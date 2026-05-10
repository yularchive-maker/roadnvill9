BEGIN;

-- roadnvill119b price history and reservation snapshot schema
-- Purpose:
-- 1. Master prices affect future reservations only.
-- 2. Existing reservations and completed settlements keep the price captured at reservation time.
-- 3. Platform/agency fees are calculated from experience sales amount, excluding pickup fees.
--
-- Important operating rule:
-- Price effective date means reservation intake/quote date, not experience date.

CREATE TABLE IF NOT EXISTS public.program_price_history (
  id BIGSERIAL PRIMARY KEY,
  vendor_program_id TEXT,
  vendor_key TEXT NOT NULL,
  prog_name TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  customer_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  vendor_settle_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  settle_type TEXT NOT NULL DEFAULT 'per_person',
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  CONSTRAINT program_price_history_settle_type_check
    CHECK (settle_type IN ('per_person', 'fixed')),
  CONSTRAINT program_price_history_effective_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.program_price_history IS
  'Program price history. Effective date is reservation intake/quote date, not experience date.';
COMMENT ON COLUMN public.program_price_history.customer_price IS
  'Customer-facing sales price per person or fixed unit for this program.';
COMMENT ON COLUMN public.program_price_history.vendor_settle_price IS
  'Amount payable to the vendor per person or fixed unit for this program.';

CREATE INDEX IF NOT EXISTS program_price_history_vendor_program_idx
  ON public.program_price_history(vendor_key, prog_name, effective_from DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS program_price_history_active_idx
  ON public.program_price_history(is_active)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS program_price_history_open_idx
  ON public.program_price_history(vendor_key, prog_name)
  WHERE is_deleted = false
    AND is_active = true
    AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS public.reservation_program_snapshots (
  id BIGSERIAL PRIMARY KEY,
  reservation_no TEXT NOT NULL,
  package_id TEXT,
  package_name TEXT,
  vendor_program_id TEXT,
  vendor_key TEXT NOT NULL,
  vendor_name TEXT,
  prog_name TEXT NOT NULL,
  pax INTEGER NOT NULL DEFAULT 0,
  customer_price NUMERIC(12, 0),
  vendor_settle_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  settle_type TEXT NOT NULL DEFAULT 'per_person',
  customer_total NUMERIC(12, 0),
  vendor_settle_total NUMERIC(12, 0) NOT NULL DEFAULT 0,
  price_snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_basis_date DATE,
  price_effective_from DATE,
  price_effective_to DATE,
  source_price_history_id BIGINT REFERENCES public.program_price_history(id),
  snapshot_memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  CONSTRAINT reservation_program_snapshots_settle_type_check
    CHECK (settle_type IN ('per_person', 'fixed'))
);

COMMENT ON TABLE public.reservation_program_snapshots IS
  'Immutable reservation-time program composition and price snapshot for settlement.';
COMMENT ON COLUMN public.reservation_program_snapshots.price_basis_date IS
  'Date used to pick price history. Use reservation intake/quote date, not experience date.';
COMMENT ON COLUMN public.reservation_program_snapshots.customer_total IS
  'Program-level customer sales total. May be null for legacy package rows where allocation is unknown.';
COMMENT ON COLUMN public.reservation_program_snapshots.vendor_settle_total IS
  'Program-level vendor settlement total used by settlement screens.';

CREATE INDEX IF NOT EXISTS reservation_program_snapshots_reservation_idx
  ON public.reservation_program_snapshots(reservation_no)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservation_program_snapshots_vendor_idx
  ON public.reservation_program_snapshots(vendor_key, prog_name)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservation_program_snapshots_reservation_program_idx
  ON public.reservation_program_snapshots(reservation_no, vendor_key, prog_name)
  WHERE is_deleted = false;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_basis_date DATE,
  ADD COLUMN IF NOT EXISTS experience_sales_amount NUMERIC(12, 0),
  ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC(12, 0),
  ADD COLUMN IF NOT EXISTS agency_fee_amount NUMERIC(12, 0),
  ADD COLUMN IF NOT EXISTS settlement_snapshot_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reservations.booking_created_at IS
  'Reservation intake timestamp. Used as price basis when available.';
COMMENT ON COLUMN public.reservations.quote_confirmed_at IS
  'Optional quote confirmation timestamp. If set, it can be used as price basis by operation policy.';
COMMENT ON COLUMN public.reservations.price_basis_date IS
  'Date used to choose price history for this reservation.';
COMMENT ON COLUMN public.reservations.experience_sales_amount IS
  'Experience sales amount used for platform/agency fee calculation. Excludes pickup fee.';
COMMENT ON COLUMN public.reservations.platform_fee_amount IS
  'Platform fee amount calculated from experience_sales_amount, not total receipt.';
COMMENT ON COLUMN public.reservations.agency_fee_amount IS
  'Agency fee amount calculated from experience_sales_amount, not total receipt.';
COMMENT ON COLUMN public.reservations.settlement_snapshot_locked IS
  'When true, settlement snapshots should not be overwritten automatically.';

-- Keep legacy vendor_programs usable as current master values while UI migrates to price history.
ALTER TABLE public.vendor_programs
  ADD COLUMN IF NOT EXISTS customer_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_settle_price NUMERIC(12, 0);

UPDATE public.vendor_programs
SET vendor_settle_price = unit_price
WHERE vendor_settle_price IS NULL;

-- Backfill current/default price history from existing vendor_programs.
-- customer_price is set from vendor_programs.customer_price when present; legacy rows may remain 0
-- because past program-level customer allocation is not reliably knowable.
INSERT INTO public.program_price_history (
  vendor_program_id,
  vendor_key,
  prog_name,
  effective_from,
  effective_to,
  customer_price,
  vendor_settle_price,
  settle_type,
  memo
)
SELECT
  vp.id::text,
  vp.vendor_key,
  vp.prog_name,
  DATE '1900-01-01',
  NULL,
  coalesce(vp.customer_price, 0),
  coalesce(vp.vendor_settle_price, vp.unit_price, 0),
  coalesce(vp.settle_type, 'per_person'),
  'Initial history generated from vendor_programs during price snapshot migration.'
FROM public.vendor_programs vp
WHERE coalesce(vp.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.program_price_history ph
    WHERE ph.vendor_key = vp.vendor_key
      AND ph.prog_name = vp.prog_name
      AND ph.effective_from = DATE '1900-01-01'
      AND coalesce(ph.is_deleted, false) = false
  );

-- Backfill reservation-level sales/fee amounts.
-- experience_sales_amount excludes pickup_fee and burden by design.
UPDATE public.reservations
SET
  booking_created_at = coalesce(booking_created_at, created_at, now()),
  price_snapshot_at = coalesce(price_snapshot_at, created_at, now()),
  price_basis_date = coalesce(price_basis_date, (coalesce(quote_confirmed_at, booking_created_at, created_at, now()))::date),
  experience_sales_amount = coalesce(experience_sales_amount, greatest((coalesce(price, 0) * coalesce(pax, 0)) - coalesce(discount, 0), 0)),
  platform_fee_amount = coalesce(platform_fee_amount, round(greatest((coalesce(price, 0) * coalesce(pax, 0)) - coalesce(discount, 0), 0) * coalesce(plat_fee, 0) / 100.0)),
  agency_fee_amount = coalesce(agency_fee_amount, round(greatest((coalesce(price, 0) * coalesce(pax, 0)) - coalesce(discount, 0), 0) * coalesce(ag_fee, 0) / 100.0))
WHERE coalesce(is_deleted, false) = false;

-- Backfill program snapshots for existing reservations from current package/vendor composition.
-- Legacy customer_total remains null when program-level customer allocation is unknown.
INSERT INTO public.reservation_program_snapshots (
  reservation_no,
  package_id,
  package_name,
  vendor_program_id,
  vendor_key,
  vendor_name,
  prog_name,
  pax,
  customer_price,
  vendor_settle_price,
  settle_type,
  customer_total,
  vendor_settle_total,
  price_snapshot_at,
  price_basis_date,
  price_effective_from,
  price_effective_to,
  source_price_history_id,
  snapshot_memo
)
SELECT
  r.no,
  p.id::text,
  coalesce(r.package_name, r.pkg, p.name),
  vp.id::text,
  pp.vendor_key,
  v.name,
  pp.prog_name,
  coalesce(r.pax, 0),
  NULLIF(ph.customer_price, 0),
  coalesce(ph.vendor_settle_price, vp.vendor_settle_price, vp.unit_price, 0),
  coalesce(ph.settle_type, vp.settle_type, 'per_person'),
  CASE
    WHEN nullif(ph.customer_price, 0) IS NULL THEN NULL
    WHEN coalesce(ph.settle_type, vp.settle_type, 'per_person') = 'per_person'
      THEN ph.customer_price * coalesce(r.pax, 0)
    ELSE ph.customer_price
  END,
  CASE
    WHEN coalesce(ph.settle_type, vp.settle_type, 'per_person') = 'per_person'
      THEN coalesce(ph.vendor_settle_price, vp.vendor_settle_price, vp.unit_price, 0) * coalesce(r.pax, 0)
    ELSE coalesce(ph.vendor_settle_price, vp.vendor_settle_price, vp.unit_price, 0)
  END,
  coalesce(r.price_snapshot_at, r.created_at, now()),
  coalesce(r.price_basis_date, (coalesce(r.quote_confirmed_at, r.booking_created_at, r.created_at, now()))::date),
  ph.effective_from,
  ph.effective_to,
  ph.id,
  'Legacy snapshot generated from package_programs and current/default price history.'
FROM public.reservations r
JOIN public.packages p
  ON p.name = coalesce(r.package_name, r.pkg)
 AND coalesce(p.is_deleted, false) = false
JOIN public.package_programs pp
  ON pp.package_id = p.id
 AND coalesce(pp.is_deleted, false) = false
LEFT JOIN public.vendors v
  ON v.key = pp.vendor_key
LEFT JOIN public.vendor_programs vp
  ON vp.vendor_key = pp.vendor_key
 AND vp.prog_name = pp.prog_name
 AND coalesce(vp.is_deleted, false) = false
LEFT JOIN LATERAL (
  SELECT ph.*
  FROM public.program_price_history ph
  WHERE ph.vendor_key = pp.vendor_key
    AND ph.prog_name = pp.prog_name
    AND coalesce(ph.is_deleted, false) = false
    AND ph.effective_from <= coalesce(r.price_basis_date, (coalesce(r.quote_confirmed_at, r.booking_created_at, r.created_at, now()))::date)
    AND (ph.effective_to IS NULL OR ph.effective_to >= coalesce(r.price_basis_date, (coalesce(r.quote_confirmed_at, r.booking_created_at, r.created_at, now()))::date))
  ORDER BY ph.effective_from DESC, ph.id DESC
  LIMIT 1
) ph ON true
WHERE coalesce(r.is_deleted, false) = false
  AND coalesce(r.type, '') <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1
    FROM public.reservation_program_snapshots s
    WHERE s.reservation_no = r.no
      AND s.vendor_key = pp.vendor_key
      AND s.prog_name = pp.prog_name
      AND coalesce(s.is_deleted, false) = false
  );

-- RLS
ALTER TABLE public.program_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_program_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read program_price_history" ON public.program_price_history;
DROP POLICY IF EXISTS "authenticated insert program_price_history" ON public.program_price_history;
DROP POLICY IF EXISTS "authenticated update program_price_history" ON public.program_price_history;

CREATE POLICY "authenticated read program_price_history"
  ON public.program_price_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert program_price_history"
  ON public.program_price_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update program_price_history"
  ON public.program_price_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated read reservation_program_snapshots" ON public.reservation_program_snapshots;
DROP POLICY IF EXISTS "authenticated insert reservation_program_snapshots" ON public.reservation_program_snapshots;
DROP POLICY IF EXISTS "authenticated update reservation_program_snapshots" ON public.reservation_program_snapshots;

CREATE POLICY "authenticated read reservation_program_snapshots"
  ON public.reservation_program_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert reservation_program_snapshots"
  ON public.reservation_program_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update reservation_program_snapshots"
  ON public.reservation_program_snapshots
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
