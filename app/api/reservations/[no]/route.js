import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(_, { params }) {
  const { data, error } = await supabase
    .from('reservations').select('*, reservation_pickup(*), lodge_confirms(*), vendor_confirms(*)')
    .eq('no', params.no).single()
  if (error) return NextResponse.json({ error }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req, { params }) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('reservations').update(body).eq('no', params.no).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_, { params }) {
  // FK CASCADE 있으나 vendor_confirms, lodge_confirms, reservation_pickup 먼저 삭제
  await supabase.from('vendor_confirms').delete().eq('reservation_no', params.no)
  await supabase.from('lodge_confirms').delete().eq('reservation_no', params.no)
  await supabase.from('reservation_pickup').delete().eq('reservation_no', params.no)
  const { error } = await supabase.from('reservations').delete().eq('no', params.no)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
