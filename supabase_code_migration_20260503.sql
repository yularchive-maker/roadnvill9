BEGIN;

-- 1. Missing code-support columns
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE vendor_programs
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS zone_code TEXT;

ALTER TABLE package_programs
  ADD COLUMN IF NOT EXISTS code TEXT;

-- 2. Normalize zone codes to A000N.
-- Current DB already has A0001/A0002, but one row has a leading space.
CREATE TEMP TABLE _zone_code_map ON COMMIT DROP AS
SELECT
  code AS old_code,
  'A' || lpad(row_number() OVER (ORDER BY trim(code), created_at, name)::text, 4, '0') AS new_code
FROM zones;

INSERT INTO zones (code, name, created_at)
SELECT m.new_code, z.name, z.created_at
FROM zones z
JOIN _zone_code_map m ON m.old_code = z.code
WHERE m.old_code <> m.new_code
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;

UPDATE packages p
SET zone_code = m.new_code
FROM _zone_code_map m
WHERE p.zone_code = m.old_code
  AND m.old_code <> m.new_code;

UPDATE reservations r
SET zone_code = m.new_code
FROM _zone_code_map m
WHERE r.zone_code = m.old_code
  AND m.old_code <> m.new_code;

UPDATE timetable_events t
SET zone_code = m.new_code
FROM _zone_code_map m
WHERE t.zone_code = m.old_code
  AND m.old_code <> m.new_code;

DELETE FROM zones z
USING _zone_code_map m
WHERE z.code = m.old_code
  AND m.old_code <> m.new_code;

-- 3. Normalize vendor codes to V00N and update all known references.
CREATE TEMP TABLE _vendor_key_map ON COMMIT DROP AS
SELECT
  key AS old_key,
  'V' || lpad(row_number() OVER (ORDER BY key, created_at, name)::text, 3, '0') AS new_key
FROM vendors;

INSERT INTO vendors (key, name, contact, tel, color, note, created_at)
SELECT m.new_key, v.name, v.contact, v.tel, v.color, v.note, v.created_at
FROM vendors v
JOIN _vendor_key_map m ON m.old_key = v.key
WHERE m.old_key <> m.new_key
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  contact = EXCLUDED.contact,
  tel = EXCLUDED.tel,
  color = EXCLUDED.color,
  note = EXCLUDED.note;

UPDATE vendor_programs vp
SET vendor_key = m.new_key
FROM _vendor_key_map m
WHERE vp.vendor_key = m.old_key
  AND m.old_key <> m.new_key;

UPDATE package_programs pp
SET vendor_key = m.new_key
FROM _vendor_key_map m
WHERE pp.vendor_key = m.old_key
  AND m.old_key <> m.new_key;

UPDATE vendor_confirms vc
SET vendor_key = m.new_key
FROM _vendor_key_map m
WHERE vc.vendor_key = m.old_key
  AND m.old_key <> m.new_key;

UPDATE settle_history sh
SET vendor_key = m.new_key
FROM _vendor_key_map m
WHERE sh.vendor_key = m.old_key
  AND m.old_key <> m.new_key;

UPDATE timetable_events te
SET vendor_key = m.new_key
FROM _vendor_key_map m
WHERE te.vendor_key = m.old_key
  AND m.old_key <> m.new_key;

DELETE FROM vendors v
USING _vendor_key_map m
WHERE v.key = m.old_key
  AND m.old_key <> m.new_key;

-- 4. Regenerate package codes as PKG-A000N-00N.
WITH ranked AS (
  SELECT
    id,
    'PKG-' || zone_code || '-' ||
      lpad(row_number() OVER (
        PARTITION BY zone_code
        ORDER BY created_at, name, id
      )::text, 3, '0') AS new_code
  FROM packages
)
UPDATE packages p
SET code = ranked.new_code
FROM ranked
WHERE p.id = ranked.id;

-- 5. Infer vendor_programs.zone_code, then regenerate as A000N-V00N-P0N.
WITH inferred AS (
  SELECT
    vp.id,
    coalesce(min(p.zone_code), (SELECT min(code) FROM zones)) AS zone_code
  FROM vendor_programs vp
  LEFT JOIN package_programs pp
    ON pp.vendor_key = vp.vendor_key
   AND pp.prog_name = vp.prog_name
  LEFT JOIN packages p
    ON p.id = pp.package_id
  GROUP BY vp.id
)
UPDATE vendor_programs vp
SET zone_code = inferred.zone_code
FROM inferred
WHERE vp.id = inferred.id;

WITH ranked AS (
  SELECT
    id,
    zone_code || '-' || vendor_key || '-P' ||
      lpad(row_number() OVER (
        PARTITION BY zone_code, vendor_key
        ORDER BY created_at, prog_name, id
      )::text, 2, '0') AS new_code
  FROM vendor_programs
)
UPDATE vendor_programs vp
SET code = ranked.new_code
FROM ranked
WHERE vp.id = ranked.id;

-- 6. Regenerate package program codes as A000N-V00N-P0N.
WITH ranked AS (
  SELECT
    pp.id,
    p.zone_code || '-' || pp.vendor_key || '-P' ||
      lpad(row_number() OVER (
        PARTITION BY p.zone_code, pp.vendor_key
        ORDER BY coalesce(pp.sort_order, 0), pp.prog_name, pp.id
      )::text, 2, '0') AS new_code
  FROM package_programs pp
  JOIN packages p ON p.id = pp.package_id
)
UPDATE package_programs pp
SET code = ranked.new_code
FROM ranked
WHERE pp.id = ranked.id;

-- 7. Helpful constraints/indexes after the values are normalized.
CREATE UNIQUE INDEX IF NOT EXISTS packages_code_uidx
  ON packages(code)
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_programs_code_uidx
  ON vendor_programs(code)
  WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS package_programs_code_uidx
  ON package_programs(code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_programs_zone_code_idx
  ON vendor_programs(zone_code);

COMMIT;
