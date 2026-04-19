import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const month = searchParams.get('month')

  let q = supabase.from('reservations').select('*').order('date', { ascending: false })
  if (type)  q = q.eq('type', type)
  if (month) q = q.like('date', `${month}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()

  // 예약번호 자동생성
  const { data: last } = await supabase
    .from('reservations').select('no').order('no', { ascending: false }).limit(1)
  const nextNo = last?.length
    ? String(parseInt(last[0].no, 10) + 1).padStart(3, '0')
    : '001'

  const { data, error } = await supabase
    .from('reservations').insert({ ...body, no: nextNo }).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
