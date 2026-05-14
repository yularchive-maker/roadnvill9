BEGIN;

-- roadnvill119b reservation budget usage schema
--
-- Purpose:
-- - One reservation can consume multiple business budget items.
-- - Product operation budget answers: how many people used the supported product budget?
-- - Promotion discount budget answers: how much discount did Gilgwa Maeul pre-discount and later need to be reimbursed?

CREATE TABLE IF NOT EXISTS public.reservation_budget_usages (
  id BIGSERIAL PRIMARY KEY,
  reservation_no TEXT NOT NULL REFERENCES public.reservations(no) ON UPDATE CASCADE,
  budget_item_id BIGINT NOT NULL REFERENCES public.biz_budget_items(id),
  usage_type TEXT NOT NULL DEFAULT 'product_operation',
  people_count INTEGER NOT NULL DEFAULT 0,
  unit_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  used_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  CONSTRAINT reservation_budget_usages_people_check CHECK (people_count >= 0),
  CONSTRAINT reservation_budget_usages_amount_check CHECK (unit_amount >= 0 AND used_amount >= 0),
  CONSTRAINT reservation_budget_usages_type_check CHECK (usage_type IN ('product_operation', 'promotion_discount'))
);

COMMENT ON TABLE public.reservation_budget_usages IS
  'Budget usage rows linked to reservations. Allows one reservation to use product operation and promotion discount budgets separately.';
COMMENT ON COLUMN public.reservation_budget_usages.usage_type IS
  'product_operation: product operation support usage. promotion_discount: discount paid first by Gilgwa Maeul and reimbursed later.';
COMMENT ON COLUMN public.reservation_budget_usages.unit_amount IS
  'Support or discount amount per person.';
COMMENT ON COLUMN public.reservation_budget_usages.used_amount IS
  'people_count multiplied by unit_amount unless manually adjusted.';

CREATE INDEX IF NOT EXISTS reservation_budget_usages_reservation_idx
  ON public.reservation_budget_usages(reservation_no)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservation_budget_usages_budget_item_idx
  ON public.reservation_budget_usages(budget_item_id)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS reservation_budget_usages_unique_active_idx
  ON public.reservation_budget_usages(reservation_no, budget_item_id, usage_type)
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
