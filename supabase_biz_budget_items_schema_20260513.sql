BEGIN;

-- roadnvill119b business budget item schema
-- Purpose:
-- Track practical operating budgets by supported product.
-- Vendor settlement answers "who do we pay?"
-- Budget usage answers "which budget item was consumed?"

CREATE TABLE IF NOT EXISTS public.biz_budget_items (
  id BIGSERIAL PRIMARY KEY,
  biz_id TEXT,
  category TEXT NOT NULL DEFAULT 'product_operation',
  item_name TEXT NOT NULL,
  support_rate NUMERIC(5, 2),
  planned_people_count INTEGER NOT NULL DEFAULT 0,
  support_unit_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  total_budget_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  match_package_name TEXT,
  match_program_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  CONSTRAINT biz_budget_items_people_check CHECK (planned_people_count >= 0),
  CONSTRAINT biz_budget_items_amount_check CHECK (support_unit_amount >= 0 AND total_budget_amount >= 0)
);

COMMENT ON TABLE public.biz_budget_items IS
  'Practical business budget items for operations, such as product operation support by product.';
COMMENT ON COLUMN public.biz_budget_items.item_name IS
  'Support product/item name, e.g. Geumyangyeonhwa, Sambae Village, Gabosideo.';
COMMENT ON COLUMN public.biz_budget_items.support_unit_amount IS
  'Budget support amount per person used for budget consumption calculation.';
COMMENT ON COLUMN public.biz_budget_items.match_package_name IS
  'Optional package name override. If empty, item_name is used for matching.';
COMMENT ON COLUMN public.biz_budget_items.match_program_name IS
  'Optional program name override for future detailed matching.';

CREATE INDEX IF NOT EXISTS biz_budget_items_biz_idx
  ON public.biz_budget_items(biz_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS biz_budget_items_active_idx
  ON public.biz_budget_items(is_active, sort_order)
  WHERE is_deleted = false;

-- Initial product operation support plan.
-- Korean display names are kept in item_name because the app matches reservation package names with these values.
-- biz_id is intentionally nullable so these can be used before a specific biz row is assigned.
INSERT INTO public.biz_budget_items
  (category, item_name, support_rate, planned_people_count, support_unit_amount, total_budget_amount, sort_order, memo)
VALUES
  ('product_operation', '금양연화', 50, 80, 115000, 9200000, 10, '80 people x 115,000'),
  ('product_operation', '삼베마을', 40, 250, 50000, 12500000, 20, '250 people x 50,000'),
  ('product_operation', '가보시더', 50, 80, 115000, 9200000, 30, '80 people x 115,000'),
  ('product_operation', '왔니껴', 40, 250, 50000, 12500000, 40, '250 people x 50,000'),
  ('product_operation', '암소해피2박3일', 50, 20, 200000, 4000000, 50, '20 people x 200,000');

ALTER TABLE public.biz_budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read biz_budget_items" ON public.biz_budget_items;
DROP POLICY IF EXISTS "authenticated insert biz_budget_items" ON public.biz_budget_items;
DROP POLICY IF EXISTS "authenticated update biz_budget_items" ON public.biz_budget_items;

CREATE POLICY "authenticated read biz_budget_items"
  ON public.biz_budget_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert biz_budget_items"
  ON public.biz_budget_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update biz_budget_items"
  ON public.biz_budget_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
