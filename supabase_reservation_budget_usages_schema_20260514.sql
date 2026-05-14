BEGIN;

-- roadnvill119b reservation budget usage schema
--
-- Purpose:
-- - One reservation can contain multiple package components.
-- - Each component can be normal or business-funded.
-- - Business-funded components can track discount tiers, prepaid amounts,
--   reimbursement target, unreimbursed amount, and reimbursement status.

CREATE TABLE IF NOT EXISTS public.reservation_budget_usages (
  id BIGSERIAL PRIMARY KEY,
  reservation_no TEXT NOT NULL REFERENCES public.reservations(no) ON UPDATE CASCADE,
  budget_item_id BIGINT REFERENCES public.biz_budget_items(id),
  usage_type TEXT NOT NULL DEFAULT 'product_operation',
  people_count INTEGER NOT NULL DEFAULT 0,
  unit_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  used_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.reservation_budget_usages
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS biz_id TEXT,
  ADD COLUMN IF NOT EXISTS biz_name TEXT,
  ADD COLUMN IF NOT EXISTS zone_code TEXT,
  ADD COLUMN IF NOT EXISTS zone_name TEXT,
  ADD COLUMN IF NOT EXISTS package_id TEXT,
  ADD COLUMN IF NOT EXISTS package_name TEXT,
  ADD COLUMN IF NOT EXISTS discount_label TEXT,
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS normal_unit_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_unit_price NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepaid_unit_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepaid_total_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursement_target TEXT,
  ADD COLUMN IF NOT EXISTS reimbursed_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursement_status TEXT NOT NULL DEFAULT '미정산',
  ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reimbursement_memo TEXT;

ALTER TABLE public.reservation_budget_usages
  DROP CONSTRAINT IF EXISTS reservation_budget_usages_people_check,
  DROP CONSTRAINT IF EXISTS reservation_budget_usages_amount_check,
  DROP CONSTRAINT IF EXISTS reservation_budget_usages_type_check,
  DROP CONSTRAINT IF EXISTS reservation_budget_usages_operation_type_check,
  DROP CONSTRAINT IF EXISTS reservation_budget_usages_discount_rate_check,
  DROP CONSTRAINT IF EXISTS reservation_budget_usages_reimbursement_status_check;

ALTER TABLE public.reservation_budget_usages
  ADD CONSTRAINT reservation_budget_usages_people_check CHECK (people_count >= 0),
  ADD CONSTRAINT reservation_budget_usages_amount_check CHECK (
    unit_amount >= 0
    AND used_amount >= 0
    AND normal_unit_price >= 0
    AND customer_unit_price >= 0
    AND prepaid_unit_amount >= 0
    AND prepaid_total_amount >= 0
    AND reimbursed_amount >= 0
  ),
  ADD CONSTRAINT reservation_budget_usages_type_check CHECK (usage_type IN ('product_operation', 'promotion_discount')),
  ADD CONSTRAINT reservation_budget_usages_operation_type_check CHECK (operation_type IN ('general', 'business')),
  ADD CONSTRAINT reservation_budget_usages_discount_rate_check CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD CONSTRAINT reservation_budget_usages_reimbursement_status_check CHECK (reimbursement_status IN ('미정산', '일부정산', '정산완료'));

COMMENT ON TABLE public.reservation_budget_usages IS
  'Reservation package-component budget usage rows. Tracks business package usage, discount tiers, prepaid amounts, and reimbursement status.';
COMMENT ON COLUMN public.reservation_budget_usages.usage_type IS
  'product_operation: overall package operation usage. promotion_discount: discount/prepaid amount to be reimbursed later.';
COMMENT ON COLUMN public.reservation_budget_usages.operation_type IS
  'general or business per package component.';
COMMENT ON COLUMN public.reservation_budget_usages.prepaid_total_amount IS
  'Amount prepaid due to customer discount. Usually people_count * prepaid_unit_amount.';
COMMENT ON COLUMN public.reservation_budget_usages.reimbursement_target IS
  'Free-text organization/vendor/person to reimburse the prepaid amount to.';
COMMENT ON COLUMN public.reservation_budget_usages.reimbursed_amount IS
  'Amount already reimbursed.';
COMMENT ON COLUMN public.reservation_budget_usages.reimbursement_status IS
  '미정산, 일부정산, or 정산완료. The app can derive this from prepaid_total_amount and reimbursed_amount.';

CREATE INDEX IF NOT EXISTS reservation_budget_usages_reservation_idx
  ON public.reservation_budget_usages(reservation_no)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservation_budget_usages_budget_item_idx
  ON public.reservation_budget_usages(budget_item_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservation_budget_usages_structure_idx
  ON public.reservation_budget_usages(biz_id, zone_code, package_name)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservation_budget_usages_reimbursement_idx
  ON public.reservation_budget_usages(reimbursement_target, reimbursement_status)
  WHERE is_deleted = false
    AND usage_type = 'promotion_discount';

DROP INDEX IF EXISTS public.reservation_budget_usages_unique_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS reservation_budget_usages_component_uidx
  ON public.reservation_budget_usages(
    reservation_no,
    coalesce(biz_id, ''),
    coalesce(zone_code, ''),
    coalesce(package_name, ''),
    usage_type,
    discount_rate
  )
  WHERE is_deleted = false;

ALTER TABLE public.reservation_budget_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read reservation_budget_usages" ON public.reservation_budget_usages;
DROP POLICY IF EXISTS "authenticated insert reservation_budget_usages" ON public.reservation_budget_usages;
DROP POLICY IF EXISTS "authenticated update reservation_budget_usages" ON public.reservation_budget_usages;

CREATE POLICY "authenticated read reservation_budget_usages"
  ON public.reservation_budget_usages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert reservation_budget_usages"
  ON public.reservation_budget_usages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update reservation_budget_usages"
  ON public.reservation_budget_usages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
