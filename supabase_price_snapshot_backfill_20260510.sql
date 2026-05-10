BEGIN;

-- roadnvill119b price history and reservation snapshot backfill
--
-- Run this only after:
-- 1. supabase_price_snapshot_schema_20260510.sql has succeeded.
-- 2. Initial customer_price and vendor_settle_price values are entered/reviewed
--    in vendor_programs for each program.
--
-- Backfill policy:
-- - Initial price history uses effective_from = 1900-01-01.
-- - This means the first entered customer/vendor prices apply to all existing
--   reservations until a future price history row is added.
-- - Price basis is reservation intake/quote date, not experience date.

-- 1. Create initial open-ended price history from reviewed vendor_programs.
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
  'Initial price history generated after first customer/vendor price review.'
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

-- 2. Backfill reservation-level sales/fee amounts.
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

-- 3. Backfill program snapshots for existing reservations from package/vendor composition.
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
  'Legacy snapshot generated from package_programs and reviewed initial price history.'
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

COMMIT;
