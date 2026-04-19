import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const no = searchParams.get('reservation_no')
  let q = supabase.from('vendor_confirms').select('*')
  if (no) q = q.eq('reservation_no', no)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  // upsert (reservation_no + vendor_key UNIQUE)
  const { data, error } = await supabase
    .from('vendor_confirms')
    .upsert(body, { onConflict: 'reservation_no,vendor_key' })
    .select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
