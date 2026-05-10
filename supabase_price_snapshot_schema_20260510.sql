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

CREATE TABLE IF NOT EXISTS public.reservation_profit_adjustments (
  id BIGSERIAL PRIMARY KEY,
  reservation_no TEXT NOT NULL,
  adjustment_type TEXT NOT NULL DEFAULT '고객혜택',
  title TEXT NOT NULL,
  amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  memo TEXT,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  CONSTRAINT reservation_profit_adjustments_type_check
    CHECK (adjustment_type IN ('고객혜택', '추가할인', '지원사업', '컴플레인보상', '무료제공', '운영조정', '기타')),
  CONSTRAINT reservation_profit_adjustments_amount_check
    CHECK (amount >= 0)
);

COMMENT ON TABLE public.reservation_profit_adjustments IS
  'Reservation-level profit adjustments such as customer benefits, extra discounts, support, or compensation.';
COMMENT ON COLUMN public.reservation_profit_adjustments.amount IS
  'Positive amount deducted from expected profit.';

CREATE INDEX IF NOT EXISTS reservation_profit_adjustments_reservation_idx
  ON public.reservation_profit_adjustments(reservation_no)
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

-- Important:
-- This schema migration does not create price history rows or reservation snapshots.
-- Run supabase_price_snapshot_backfill_20260510.sql only after initial customer_price
-- and vendor_settle_price values are entered and reviewed.

-- RLS
ALTER TABLE public.program_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_program_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_profit_adjustments ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "authenticated read reservation_profit_adjustments" ON public.reservation_profit_adjustments;
DROP POLICY IF EXISTS "authenticated insert reservation_profit_adjustments" ON public.reservation_profit_adjustments;
DROP POLICY IF EXISTS "authenticated update reservation_profit_adjustments" ON public.reservation_profit_adjustments;

CREATE POLICY "authenticated read reservation_profit_adjustments"
  ON public.reservation_profit_adjustments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert reservation_profit_adjustments"
  ON public.reservation_profit_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update reservation_profit_adjustments"
  ON public.reservation_profit_adjustments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
