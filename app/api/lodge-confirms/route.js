import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// 숙소 확인 조회
export async function GET(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const no = searchParams.get('no')

  let query = supabase.from('lodge_confirms').select('*')
  if (no) query = query.eq('reservation_no', no)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// 숙소 확인 등록/수정
export async function POST(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { reservation_no } = body
  if (!reservation_no) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

  const { data, error } = await supabase
    .from('lodge_confirms')
    .upsert(body, { onConflict: 'reservation_no' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
