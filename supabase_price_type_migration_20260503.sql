BEGIN;

ALTER TABLE lodge_confirms
  ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT 'per_room';

ALTER TABLE lodge_confirms
  DROP CONSTRAINT IF EXISTS lodge_confirms_price_type_check;

ALTER TABLE lodge_confirms
  ADD CONSTRAINT lodge_confirms_price_type_check
  CHECK (price_type IN ('per_room', 'per_person'));

UPDATE lodge_confirms
SET price_type = 'per_room'
WHERE price_type IS NULL
   OR price_type NOT IN ('per_room', 'per_person');

UPDATE lodges
SET rooms = (
  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(room) = 'object' THEN
          room || jsonb_build_object(
            'price_type',
            CASE
              WHEN room->>'price_type' IN ('per_room', 'per_person') THEN room->>'price_type'
              ELSE 'per_room'
            END
          )
        ELSE room
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(coalesce(rooms, '[]'::jsonb)) WITH ORDINALITY AS t(room, ord)
)
WHERE rooms IS NOT NULL;

COMMIT;
