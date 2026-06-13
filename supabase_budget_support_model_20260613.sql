BEGIN;

-- roadnvill119b business budget support model stabilization
--
-- Purpose:
-- 1. Treat biz_budget_items(product_operation) as the top-level budget/counting item.
-- 2. Allow reservation_budget_usages rows to represent the actual sold component:
--    fixed package or custom/single composition.
-- 3. Avoid duplicate-key errors when the same program/package is added more than once
--    in one reservation by using component_uid as the active uniqueness key.
--
-- This migration is additive/safe for existing data. Existing amount columns are kept:
-- - prepaid_unit_amount / prepaid_total_amount are displayed in the app as support amounts.
-- - reimbursement_* columns are displayed in the app as support settlement fields.

ALTER TABLE public.reservation_budget_usages
  ADD COLUMN IF NOT EXISTS component_uid TEXT,
  ADD COLUMN IF NOT EXISTS vendor_key TEXT,
  ADD COLUMN IF NOT EXISTS prog_name TEXT,
  ADD COLUMN IF NOT EXISTS vendor_settle_unit_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_time TEXT,
  ADD COLUMN IF NOT EXISTS end_time TEXT,
  ADD COLUMN IF NOT EXISTS place TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS support_note TEXT;

COMMENT ON COLUMN public.reservation_budget_usages.component_uid IS
  'Stable per-reservation component key. Used so repeated same package/program rows can coexist.';
COMMENT ON COLUMN public.reservation_budget_usages.discount_amount IS
  'Per-person discount/support amount. Existing prepaid_unit_amount remains the main stored support amount.';
COMMENT ON COLUMN public.reservation_budget_usages.support_note IS
  'Internal memo for support amount/settlement context.';

-- Backfill component_uid for older rows where possible.
UPDATE public.reservation_budget_usages
SET component_uid = concat_ws(
  '-',
  'legacy',
  id::text,
  coalesce(usage_type, ''),
  coalesce(package_name, ''),
  coalesce(prog_name, '')
)
WHERE (component_uid IS NULL OR component_uid = '')
  AND coalesce(is_deleted, false) = false;

-- Backfill discount_amount from existing support amount.
UPDATE public.reservation_budget_usages
SET discount_amount = coalesce(prepaid_unit_amount, 0)
WHERE coalesce(discount_amount, 0) = 0
  AND coalesce(prepaid_unit_amount, 0) > 0;

DROP INDEX IF EXISTS public.reservation_budget_usages_component_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS reservation_budget_usages_component_uidx
  ON public.reservation_budget_usages (
    reservation_no,
    usage_type,
    coalesce(component_uid, '')
  )
  WHERE is_deleted = false
    AND component_uid IS NOT NULL
    AND component_uid <> '';

CREATE INDEX IF NOT EXISTS reservation_budget_usages_budget_component_idx
  ON public.reservation_budget_usages (budget_item_id, sale_type, usage_type)
  WHERE is_deleted = false;

COMMIT;
