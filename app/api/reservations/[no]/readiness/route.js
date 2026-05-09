import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function active(query) {
  return query.or('is_deleted.is.null,is_deleted.eq.false')
}

function vendorCondition(rows) {
  if (!rows.length) {
    return {
      key: 'vendors',
      label: '체험 업체',
      passed: false,
      status: '미회신',
      detail: '업체 회신 요청이 없습니다.',
    }
  }

  const possible = rows.filter(row => row.reply_status === '가능').length
  const waiting = rows.filter(row => !row.reply_status || row.reply_status === '회신대기').length
  const impossible = rows.filter(row => row.reply_status === '불가능').length
  const adjusting = rows.filter(row => row.reply_status === '시간조정 필요' || row.reply_status === '인원조정 필요').length
  const passed = possible === rows.length

  let status = '미회신'
  if (passed) status = '통과'
  else if (impossible) status = '확정 불가'
  else if (adjusting) status = '조정 필요'
  else if (waiting) status = '회신대기'

  return {
    key: 'vendors',
    label: '체험 업체',
    passed,
    status,
    detail: `가능 ${possible}/${rows.length}, 회신대기 ${waiting}, 조정필요 ${adjusting}, 불가능 ${impossible}`,
  }
}

function lodgingCondition(reservation, lodges) {
  const status = reservation.lodging_status || '해당없음'
  if (status === '해당없음') {
    return {
      key: 'lodging',
      label: '숙소',
      passed: true,
      status,
      detail: '숙박 없는 예약으로 처리됩니다.',
    }
  }

  const assigned = lodges.some(row => row.lodge_name && row.room_name)
  const passed = status === '확정완료' && assigned
  return {
    key: 'lodging',
    label: '숙소',
    passed,
    status,
    detail: assigned ? `배정 ${lodges.length}건, 상태 ${status}` : '숙소명/객실명 배정이 필요합니다.',
  }
}

function pickupCondition(reservation, pickups) {
  const status = reservation.pickup_status || '해당없음'
  if (status === '해당없음') {
    return {
      key: 'pickup',
      label: '픽업',
      passed: true,
      status,
      detail: '픽업 없는 예약으로 처리됩니다.',
    }
  }

  const assigned = pickups.some(row => row.driver_id || row.driver_name || row.drivers?.name)
  const passed = status === '확정완료' && assigned
  return {
    key: 'pickup',
    label: '픽업',
    passed,
    status,
    detail: assigned ? `픽업 ${pickups.length}건, 상태 ${status}` : '픽업 수행자 배정이 필요합니다.',
  }
}

function nextReservationStatus(reservation, ready, conditions) {
  if (['예약확정', '취소', '완료'].includes(reservation.reservation_status)) {
    return reservation.reservation_status
  }

  if (!ready) {
    const hasAdjust = conditions.some(item => item.status === '조정 필요' || item.status === '확정 불가')
    return hasAdjust ? '조정필요' : '가능여부확인중'
  }

  return '확정가능'
}

async function evaluate(no, { persist = false } = {}) {
  const { data: reservation, error: reservationError } = await active(
    supabase.from('reservations').select('*').eq('no', no)
  ).single()

  if (reservationError) {
    return { error: reservationError, status: 404 }
  }

  const [vendorRes, lodgeRes, pickupRes] = await Promise.all([
    active(supabase.from('vendor_confirms').select('*').eq('reservation_no', no)),
    active(supabase.from('lodge_confirms').select('*').eq('reservation_no', no)),
    active(supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', no)),
  ])

  const error = vendorRes.error || lodgeRes.error || pickupRes.error
  if (error) return { error, status: 500 }

  const conditions = [
    vendorCondition(vendorRes.data || []),
    lodgingCondition(reservation, lodgeRes.data || []),
    pickupCondition(reservation, pickupRes.data || []),
  ]
  const ready = conditions.every(item => item.passed)
  const suggested_status = nextReservationStatus(reservation, ready, conditions)

  let saved_status = reservation.reservation_status
  if (persist && suggested_status !== reservation.reservation_status && !['예약확정', '취소', '완료'].includes(reservation.reservation_status)) {
    const { data, error: updateError } = await supabase
      .from('reservations')
      .update({ reservation_status: suggested_status })
      .eq('no', no)
      .select('reservation_status')
      .single()
    if (updateError) return { error: updateError, status: 500 }
    saved_status = data.reservation_status
  }

  return {
    data: {
      reservation_no: no,
      ready,
      reservation_status: saved_status,
      suggested_status,
      payment_status: reservation.payment_status || '미결제',
      payment_type: reservation.payment_type || '전화예약미결제',
      conditions,
    },
  }
}

export async function GET(_, { params }) {
  const result = await evaluate(params.no)
  if (result.error) return NextResponse.json({ error: result.error.message || result.error }, { status: result.status })
  return NextResponse.json(result.data)
}

export async function POST(_, { params }) {
  const result = await evaluate(params.no, { persist: true })
  if (result.error) return NextResponse.json({ error: result.error.message || result.error }, { status: result.status })
  return NextResponse.json(result.data)
}
