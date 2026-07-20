export function pickFields(row, fields) {
  if (!row || typeof row !== 'object') return row
  return Object.fromEntries(fields.map(field => [field, row[field]]).filter(([, value]) => value !== undefined))
}

export function pickRows(rows, fields) {
  return (rows || []).map(row => pickFields(row, fields))
}

export const RESERVATION_FIELDS = [
  'no',
  'date',
  'end_date',
  'zone_code',
  'package_name',
  'customer',
  'tel',
  'pax',
  'price',
  'discount',
  'pickup_fee',
  'burden',
  'total',
  'payto',
  'inflow',
  'platform_name',
  'plat_fee',
  'agency_name',
  'ag_fee',
  'op',
  'biz_id',
  'settle_status',
  'memo',
  'type',
  'reservation_status',
  'payment_status',
  'payment_type',
  'lodging_status',
  'pickup_status',
  'experience_sales_amount',
  'platform_fee_amount',
  'agency_fee_amount',
  'price_basis_date',
  'customer_notice_sent_at',
  'confirmed_at',
  'confirmed_by',
  'is_deleted',
]

export const RESERVATION_LIST_FIELDS = [
  'no',
  'date',
  'end_date',
  'zone_code',
  'package_name',
  'customer',
  'tel',
  'pax',
  'total',
  'payto',
  'op',
  'biz_id',
  'settle_status',
  'type',
  'reservation_status',
  'payment_status',
  'payment_type',
  'lodging_status',
  'pickup_status',
  'is_deleted',
]

export const VENDOR_CONFIRM_FIELDS = [
  'id',
  'reservation_no',
  'vendor_key',
  'vendor_name',
  'program_name',
  'program_code',
  'request_date',
  'request_start_time',
  'request_end_time',
  'request_people_count',
  'duration_minutes',
  'place_name',
  'zone_name',
  'request_memo',
  'reply_deadline_at',
  'day_confirmed_people_count',
  'day_pending_people_count',
  'day_max_expected_people_count',
  'same_day_schedule',
  'overlap_warning',
  'send_status',
  'sent_at',
  'reply_status',
  'manual_reply',
  'reply_method',
  'confirmed_by',
  'replied_at',
  'available_people_count',
  'suggested_time',
  'unavailable_reason',
  'adjustment_reason',
  'minimum_people_count',
  'can_split_groups',
  'reply_memo',
  'final_decision',
  'is_deleted',
]

export const LODGE_CONFIRM_FIELDS = [
  'id',
  'reservation_no',
  'lodge_name',
  'room_name',
  'guest_assignment',
  'room_price',
  'price_type',
  'is_deleted',
]

export const PICKUP_FIELDS = [
  'id',
  'reservation_no',
  'pickup_type',
  'driver_id',
  'pickup_place',
  'pickup_time',
  'pickup_fee',
  'is_deleted',
]

export const DRIVER_FIELDS = ['id', 'name', 'affil', 'tel', 'is_deleted']
export const PLATFORM_FIELDS = ['id', 'type', 'name', 'fee_ind', 'fee_grp', 'is_deleted']
export const ZONE_FIELDS = ['code', 'name', 'is_deleted']

export const HANDOFF_NOTE_FIELDS = [
  'id',
  'title',
  'content',
  'status',
  'previous_status',
  'created_by',
  'created_at',
  'updated_at',
  'is_deleted',
]

export const NOTICE_FIELDS = [
  'id',
  'date',
  'start_time',
  'end_time',
  'title',
  'content',
  'is_deleted',
  'created_at',
]

export const TIMETABLE_EVENT_FIELDS = [
  'id',
  'date',
  'start_time',
  'end_time',
  'title',
  'memo',
  'zone_code',
  'reservation_no',
  'is_manual',
  'is_deleted',
]

export const VENDOR_FIELDS = [
  'key',
  'name',
  'contact',
  'tel',
  'color',
  'note',
  'telegram_chat_id',
  'telegram_username',
  'telegram_linked_at',
  'is_deleted',
]

export const VENDOR_PROGRAM_FIELDS = [
  'id',
  'code',
  'vendor_key',
  'zone_code',
  'prog_name',
  'customer_price',
  'vendor_settle_price',
  'unit_price',
  'settle_type',
  'is_deleted',
]

export const PACKAGE_FIELDS = [
  'id',
  'code',
  'zone_code',
  'name',
  'pax_limit',
  'total_price',
  'package_type',
  'is_deleted',
]

export const PACKAGE_PROGRAM_FIELDS = [
  'id',
  'code',
  'package_id',
  'vendor_key',
  'prog_name',
  'default_start',
  'default_end',
  'sort_order',
  'vendor_settle_price',
  'settle_type',
  'price_note',
  'is_deleted',
]

export const BIZ_FIELDS = [
  'id',
  'name',
  'start_year',
  'start_month',
  'start_day',
  'end_year',
  'end_month',
  'end_day',
  'is_deleted',
]

export const BIZ_PAYMENT_FIELDS = ['id', 'biz_id', 'type', 'amount', 'note', 'is_deleted']

export const SETTLE_HISTORY_FIELDS = [
  'id',
  'vendor_key',
  'settle_type',
  'total_amt',
  'settled_at',
  'settled_by',
  'is_deleted',
]

export const SETTLE_HISTORY_ITEM_FIELDS = [
  'id',
  'settle_history_id',
  'reservation_no',
  'customer',
  'detail',
  'amt',
  'is_deleted',
]
