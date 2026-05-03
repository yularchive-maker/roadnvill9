import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('vendors')
    .select('*, vendor_programs(*)')
    .order('key')
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  // key 자동생성: V001, V002, ...
  const { data: existing } = await supabase.from('vendors').select('key').order('key', { ascending: false }).limit(1)
  let nextKey = 'V001'
  if (existing?.length) {
    const n = parseInt(existing[0].key.replace(/\D/g, ''), 10) + 1
    nextKey = 'V' + String(n).padStart(3, '0')
  }
  const { data, error } = await supabase.from('vendors').insert({ ...body, key: nextKey }).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
