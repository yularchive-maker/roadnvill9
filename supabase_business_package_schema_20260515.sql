BEGIN;

-- roadnvill119b business package baseline fields
-- Purpose:
-- Store fixed business-package conditions once in 기준정보 > 사업비 패키지,
-- then let reservation registration only choose the package and people count.

ALTER TABLE public.biz_budget_items
  ADD COLUMN IF NOT EXISTS zone_code TEXT,
  ADD COLUMN IF NOT EXISTS default_reimbursement_target TEXT;

COMMENT ON COLUMN public.biz_budget_items.zone_code IS
  'Optional zone code for business package grouping, e.g. A0001.';
COMMENT ON COLUMN public.biz_budget_items.default_reimbursement_target IS
  'Default recipient/vendor/company to be reimbursed for prepaid discount support.';

CREATE INDEX IF NOT EXISTS biz_budget_items_zone_idx
  ON public.biz_budget_items(zone_code)
  WHERE is_deleted = false;

-- Keep product-operation rows and promotion-discount rows aligned by item name.
-- Existing rows remain valid; these updates only normalize the initial local-create items.
WITH defaults AS (
  SELECT *
  FROM (
    VALUES
      ('금양연화',  'A0001', '길과마을'),
      ('삼베마을',  'A0001', '길과마을'),
      ('가보시더',  'A0001', '길과마을'),
      ('왔니껴',    'A0001', '길과마을'),
      ('암소해피2박3일', 'A0001', '길과마을')
  ) AS t(item_name, zone_code, default_reimbursement_target)
)
UPDATE public.biz_budget_items b
SET
  zone_code = COALESCE(b.zone_code, d.zone_code),
  default_reimbursement_target = COALESCE(b.default_reimbursement_target, d.default_reimbursement_target),
  updated_at = now()
FROM defaults d
WHERE b.item_name = d.item_name;

COMMIT;
