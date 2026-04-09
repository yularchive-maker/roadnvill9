import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// 업체 확인 상태 조회 (예약번호별)
export async function GET(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const no = searchParams.get('no')

  let query = supabase.from('vendor_confirms').select('*')
  if (no) query = query.eq('reservation_no', no)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// 업체 확인 상태 등록/수정
export async function POST(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { reservation_no, vendor_key, status } = await request.json()
  if (!reservation_no || !vendor_key) {
    return NextResponse.json({ error: '필수값 누락' }, { status: 400 })
  }

  // upsert: 있으면 업데이트, 없으면 삽입
  const { data, error } = await supabase
    .from('vendor_confirms')
    .upsert({ reservation_no, vendor_key, status },
      { onConflict: 'reservation_no,vendor_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
