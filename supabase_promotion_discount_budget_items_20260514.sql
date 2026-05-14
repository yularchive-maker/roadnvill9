BEGIN;

-- roadnvill119b promotion discount budget items
--
-- These rows track the discount amount first paid by Gilgwa Maeul and reimbursed later.
-- Formula:
--   reimbursement unit amount = normal unit price * discount rate
--   reimbursement total amount = discount people count * reimbursement unit amount
--
-- Confirmed examples:
--   Geumyangyeonhwa: 115,000 * 50% = 57,500 / person, 40 people = 2,300,000
--   Sambae Village: 50,000 * 40% = 20,000 / person, 150 people = 3,000,000

WITH promotion_items AS (
  SELECT *
  FROM (
    VALUES
      ('promotion_discount', '금양연화', 50::numeric, 40::integer, 57500::numeric, 2300000::numeric, '금양연화', 110::integer, '홍보마케팅 할인지원: 정상가 115,000 x 50% = 57,500, 40 people'),
      ('promotion_discount', '삼베마을', 40::numeric, 150::integer, 20000::numeric, 3000000::numeric, '삼베마을', 120::integer, '홍보마케팅 할인지원: 정상가 50,000 x 40% = 20,000, 150 people'),
      ('promotion_discount', '가보시더', 50::numeric, 40::integer, 57500::numeric, 2300000::numeric, '가보시더', 130::integer, '홍보마케팅 할인지원: 정상가 115,000 x 50% = 57,500, 40 people'),
      ('promotion_discount', '왔니껴', 40::numeric, 150::integer, 20000::numeric, 3000000::numeric, '왔니껴', 140::integer, '홍보마케팅 할인지원: 정상가 50,000 x 40% = 20,000, 150 people'),
      ('promotion_discount', '암소해피2박3일', 50::numeric, 20::integer, 100000::numeric, 2000000::numeric, '암소해피2박3일', 150::integer, '홍보마케팅 할인지원: 정상가 200,000 x 50% = 100,000, 20 people')
  ) AS t(category, item_name, support_rate, planned_people_count, support_unit_amount, total_budget_amount, match_package_name, sort_order, memo)
),
updated AS (
  UPDATE public.biz_budget_items b
  SET
    support_rate = p.support_rate,
    planned_people_count = p.planned_people_count,
    support_unit_amount = p.support_unit_amount,
    total_budget_amount = p.total_budget_amount,
    match_package_name = p.match_package_name,
    sort_order = p.sort_order,
    memo = p.memo,
    is_active = true,
    is_deleted = false,
    deleted_at = null,
    updated_at = now()
  FROM promotion_items p
  WHERE b.category = p.category
    AND b.item_name = p.item_name
  RETURNING b.id
)
INSERT INTO public.biz_budget_items
  (category, item_name, support_rate, planned_people_count, support_unit_amount, total_budget_amount, match_package_name, sort_order, memo)
SELECT
  p.category,
  p.item_name,
  p.support_rate,
  p.planned_people_count,
  p.support_unit_amount,
  p.total_budget_amount,
  p.match_package_name,
  p.sort_order,
  p.memo
FROM promotion_items p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.biz_budget_items b
  WHERE b.category = p.category
    AND b.item_name = p.item_name
);

COMMIT;
