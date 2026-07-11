import { arrayRule, booleanRule, numberRule, objectRule, stringRule } from '@/lib/api-validate'

export const RESERVATION_TYPE_VALUES = ['pending', 'confirmed', 'cancelled', 'consult', 'done']
export const RESERVATION_STATUS_VALUES = ['상담중', '가능여부확인중', '조정필요', '확정가능', '예약확정', '취소', '완료']
export const PAYMENT_STATUS_VALUES = ['미결제', '선결제완료', '결제예정', '일부결제', '결제완료', '환불필요', '환불완료']

export const reservationWriteSchema = {
  date: stringRule(10, { pattern: 'date' }),
  end_date: stringRule(10, { pattern: 'date' }),
  zone_code: stringRule(30),
  package_name: stringRule(120),
  customer: stringRule(80),
  tel: stringRule(30),
  pax: numberRule({ min: 0, max: 100000 }),
  price: numberRule({ min: 0 }),
  discount: numberRule({ min: 0 }),
  pickup_fee: numberRule({ min: 0 }),
  burden: numberRule({ min: 0 }),
  total: numberRule({ min: 0 }),
  payto: stringRule(120),
  inflow: stringRule(120),
  platform_name: stringRule(120),
  plat_fee: numberRule({ min: 0, max: 100 }),
  agency_name: stringRule(120),
  ag_fee: numberRule({ min: 0, max: 100 }),
  op: stringRule(80),
  biz_id: stringRule(80),
  settle_status: stringRule(40),
  memo: stringRule(2000),
  type: stringRule(30, { enum: RESERVATION_TYPE_VALUES }),
  reservation_status: stringRule(40, { enum: RESERVATION_STATUS_VALUES }),
  payment_status: stringRule(40, { enum: PAYMENT_STATUS_VALUES }),
  payment_type: stringRule(80),
  lodging_status: stringRule(40),
  pickup_status: stringRule(40),
  experience_sales_amount: numberRule({ min: 0 }),
  platform_fee_amount: numberRule({ min: 0 }),
  agency_fee_amount: numberRule({ min: 0 }),
  price_basis_date: stringRule(10, { pattern: 'date' }),
}

export const vendorConfirmWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  reservation_no: stringRule(30),
  vendor_key: stringRule(80),
  vendor_name: stringRule(120),
  program_name: stringRule(160),
  program_code: stringRule(80),
  request_date: stringRule(10, { pattern: 'date' }),
  request_start_time: stringRule(5, { pattern: 'time' }),
  request_end_time: stringRule(5, { pattern: 'time' }),
  request_people_count: numberRule({ min: 0, max: 100000 }),
  duration_minutes: numberRule({ min: 0, max: 10080 }),
  place_name: stringRule(160),
  zone_name: stringRule(120),
  request_memo: stringRule(2000),
  reply_deadline_at: stringRule(60),
  day_confirmed_people_count: numberRule({ min: 0 }),
  day_pending_people_count: numberRule({ min: 0 }),
  day_max_expected_people_count: numberRule({ min: 0 }),
  same_day_schedule: arrayRule(100),
  overlap_warning: booleanRule(),
  send_status: stringRule(40),
  reply_status: stringRule(60),
  manual_reply: booleanRule(),
  reply_method: stringRule(60),
  confirmed_by: stringRule(120),
  available_people_count: numberRule({ min: 0 }),
  suggested_time: stringRule(80),
  unavailable_reason: stringRule(1000),
  adjustment_reason: stringRule(1000),
  minimum_people_count: numberRule({ min: 0 }),
  can_split_groups: booleanRule(),
  reply_memo: stringRule(2000),
  final_decision: stringRule(80),
}

export const lodgeConfirmWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  reservation_no: stringRule(30),
  lodge_name: stringRule(160),
  room_name: stringRule(160),
  room_price: numberRule({ min: 0 }),
  price_type: stringRule(40),
}

export const noticeWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  date: stringRule(10, { pattern: 'date' }),
  start_time: stringRule(5, { pattern: 'time' }),
  end_time: stringRule(5, { pattern: 'time' }),
  title: stringRule(200),
  content: stringRule(5000),
}

export const handoffWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  title: stringRule(200),
  content: stringRule(5000),
  status: stringRule(20, { enum: ['일반', '긴급', '완료'] }),
  previous_status: stringRule(20, { enum: ['일반', '긴급'] }),
}

export const timetableWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  date: stringRule(10, { pattern: 'date' }),
  start_time: stringRule(5, { pattern: 'time' }),
  end_time: stringRule(5, { pattern: 'time' }),
  title: stringRule(200),
  memo: stringRule(2000),
  zone_code: stringRule(30),
  reservation_no: stringRule(30),
  is_manual: booleanRule(),
}

export const driverWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  name: stringRule(80),
  affil: stringRule(120),
  tel: stringRule(30),
}

export const platformWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  type: stringRule(40, { enum: ['플랫폼', '여행사'] }),
  name: stringRule(120),
  fee_ind: numberRule({ min: 0, max: 100 }),
  fee_grp: numberRule({ min: 0, max: 100 }),
}

export const zoneWriteSchema = {
  code: stringRule(30),
  name: stringRule(120),
}

export const bizWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  name: stringRule(160),
  start_year: numberRule({ min: 1900, max: 3000 }),
  start_month: numberRule({ min: 1, max: 12 }),
  start_day: numberRule({ min: 1, max: 31 }),
  end_year: numberRule({ min: 1900, max: 3000 }),
  end_month: numberRule({ min: 1, max: 12 }),
  end_day: numberRule({ min: 1, max: 31 }),
}

export const packageWriteSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  code: stringRule(80),
  zone_code: stringRule(30),
  name: stringRule(160),
  pax_limit: numberRule({ min: 0 }),
  total_price: numberRule({ min: 0 }),
  package_type: stringRule(40),
}

export const vendorWriteSchema = {
  key: stringRule(80),
  name: stringRule(160),
  contact: stringRule(80),
  tel: stringRule(30),
  color: stringRule(30),
  note: stringRule(2000),
  telegram_chat_id: stringRule(120),
  telegram_username: stringRule(120),
}

export const settleHistoryWriteSchema = {
  vendor_key: stringRule(80),
  settle_type: stringRule(60),
  total_amt: numberRule({ min: 0 }),
  settled_by: stringRule(120),
  settled_at: stringRule(80),
  items: arrayRule(500),
  reservation_nos: arrayRule(500),
  update_reservations: booleanRule(),
}

export const telegramLimitAlertSchema = {
  date: stringRule(10, { pattern: 'date' }),
  totalPeople: numberRule({ min: 0 }),
  reservationCount: numberRule({ min: 0 }),
  warnings: arrayRule(100),
}

export const telegramWebhookSettingsSchema = {
  url: stringRule(300),
}

export const telegramSendSchema = {
  id: stringRule(80, { pattern: 'safeId' }),
  ids: arrayRule(200),
}
