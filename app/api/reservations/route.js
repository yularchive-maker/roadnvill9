import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// 예약 목록 조회
export async function GET(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const month = searchParams.get('month')

  let query = supabase.from('reservations').select('*').order('date', { ascending: false })
  if (date) query = query.eq('date', date)
  if (month) query = query.like('date', `${month}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// 예약 등록
export async function POST(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()

  // NO 자동 채번
  const { data: last } = await supabase
    .from('reservations')
    .select('no')
    .order('no', { ascending: false })
    .limit(1)

  const lastNo = last?.[0]?.no ? parseInt(last[0].no) : 0
  const newNo = String(lastNo + 1).padStart(3, '0')

  const { data, error } = await supabase
    .from('reservations')
    .insert([{ ...body, no: newNo }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // lodge_confirms 초기화
  await supabase.from('lodge_confirms').insert([{
    reservation_no: newNo, checked: false, lodge: '', room: '', note: ''
  }])

  return NextResponse.json(data, { status: 201 })
}
