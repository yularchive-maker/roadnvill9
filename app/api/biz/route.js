import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('biz')
    .select('*, biz_payments(*)')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('name')
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  const { data, error } = await supabase.from('biz').insert(body).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
