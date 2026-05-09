BEGIN;

-- roadnvill119b step 2 operational schema additions
-- Additive migration only: no existing columns are renamed or dropped.

ALTER TABLE public.vendor_confirms
  ADD COLUMN IF NOT EXISTS program_name TEXT,
  ADD COLUMN IF NOT EXISTS program_code TEXT,
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS request_date DATE,
  ADD COLUMN IF NOT EXISTS request_start_time TEXT,
  ADD COLUMN IF NOT EXISTS request_end_time TEXT,
  ADD COLUMN IF NOT EXISTS request_people_count INTEGER,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS place_name TEXT,
  ADD COLUMN IF NOT EXISTS zone_name TEXT,
  ADD COLUMN IF NOT EXISTS request_memo TEXT,
  ADD COLUMN IF NOT EXISTS reply_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS day_confirmed_people_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_pending_people_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_max_expected_people_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS same_day_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlap_warning BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_status TEXT NOT NULL DEFAULT '미발송',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_error TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_status TEXT NOT NULL DEFAULT '회신대기',
  ADD COLUMN IF NOT EXISTS manual_reply BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_method TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_people_count INTEGER,
  ADD COLUMN IF NOT EXISTS suggested_time TEXT,
  ADD COLUMN IF NOT EXISTS unavailable_reason TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS minimum_people_count INTEGER,
  ADD COLUMN IF NOT EXISTS can_split_groups BOOLEAN,
  ADD COLUMN IF NOT EXISTS reply_memo TEXT,
  ADD COLUMN IF NOT EXISTS final_decision TEXT NOT NULL DEFAULT '미회신';

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_status TEXT NOT NULL DEFAULT '상담중',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT '미결제',
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT '전화예약미결제',
  ADD COLUMN IF NOT EXISTS lodging_status TEXT NOT NULL DEFAULT '해당없음',
  ADD COLUMN IF NOT EXISTS pickup_status TEXT NOT NULL DEFAULT '해당없음',
  ADD COLUMN IF NOT EXISTS customer_notice_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT;

UPDATE public.reservations
SET reservation_status = CASE
  WHEN type = 'confirmed' THEN '예약확정'
  WHEN type = 'pending' THEN '가능여부확인중'
  WHEN type = 'cancelled' THEN '취소'
  WHEN type = 'consult' THEN '상담중'
  ELSE reservation_status
END
WHERE reservation_status = '상담중'
  AND type IS NOT NULL;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'lodge_vendors',
    'lodges',
    'packages',
    'vendor_programs',
    'package_programs',
    'lodge_confirms',
    'notices',
    'reservations',
    'reservation_pickup',
    'vendor_confirms',
    'vendors',
    'zones',
    'platforms',
    'drivers',
    'biz',
    'biz_payments',
    'settle_history',
    'settle_history_items',
    'timetable_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(is_deleted)', t || '_is_deleted_idx', t);
  END LOOP;
END $$;

ALTER TABLE public.vendor_confirms
  DROP CONSTRAINT IF EXISTS vendor_confirms_send_status_check,
  ADD CONSTRAINT vendor_confirms_send_status_check
  CHECK (send_status IN ('미발송', '발송완료', '발송실패', '재발송필요'));

ALTER TABLE public.vendor_confirms
  DROP CONSTRAINT IF EXISTS vendor_confirms_reply_status_check,
  ADD CONSTRAINT vendor_confirms_reply_status_check
  CHECK (reply_status IN ('회신대기', '가능', '불가능', '시간조정 필요', '인원조정 필요', '보류'));

ALTER TABLE public.vendor_confirms
  DROP CONSTRAINT IF EXISTS vendor_confirms_final_decision_check,
  ADD CONSTRAINT vendor_confirms_final_decision_check
  CHECK (final_decision IN ('확정 가능', '확정 불가', '조정 필요', '미회신'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_reservation_status_check,
  ADD CONSTRAINT reservations_reservation_status_check
  CHECK (reservation_status IN ('상담중', '가능여부확인중', '조정필요', '확정가능', '예약확정', '취소', '완료'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_payment_status_check,
  ADD CONSTRAINT reservations_payment_status_check
  CHECK (payment_status IN ('미결제', '선결제완료', '후결제예정', '일부결제', '결제완료', '환불필요', '환불완료'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_payment_type_check,
  ADD CONSTRAINT reservations_payment_type_check
  CHECK (payment_type IN ('고객선결제', '전화예약미결제', '지자체후결제', '업체후결제', '현장결제', '무료/지원사업'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_lodging_status_check,
  ADD CONSTRAINT reservations_lodging_status_check
  CHECK (lodging_status IN ('해당없음', '배정필요', '배정완료', '확정완료'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_pickup_status_check,
  ADD CONSTRAINT reservations_pickup_status_check
  CHECK (pickup_status IN ('해당없음', '확정필요', '확정완료'));

CREATE UNIQUE INDEX IF NOT EXISTS vendor_confirms_reservation_vendor_uidx
  ON public.vendor_confirms(reservation_no, vendor_key)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS vendor_confirms_reservation_no_idx
  ON public.vendor_confirms(reservation_no)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS vendor_confirms_request_date_idx
  ON public.vendor_confirms(request_date)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS reservations_status_idx
  ON public.reservations(reservation_status)
  WHERE is_deleted = false;

COMMIT;
