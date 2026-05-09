import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(_, { params }) {
  const { data: { user } } = await supabase.auth.getUser()
  const confirmedBy = user?.email || user?.id || 'internal'
  const now = new Date().toISOString()

  const { data: reservation, error: loadError } = await supabase
    .from('reservations')
    .select('no,reservation_status')
    .eq('no', params.no)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .single()

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 404 })

  if (reservation.reservation_status !== '확정가능') {
    return NextResponse.json({ error: '확정가능 상태에서만 예약확정 처리할 수 있습니다.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({
      reservation_status: '예약확정',
      type: 'confirmed',
      customer_notice_sent_at: now,
      confirmed_at: now,
      confirmed_by: confirmedBy,
    })
    .eq('no', params.no)
    .select('no,reservation_status,customer_notice_sent_at,confirmed_at,confirmed_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
