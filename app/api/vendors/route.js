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
  // key 자동생성: 현재 최대 key 다음 알파벳
  const { data: existing } = await supabase.from('vendors').select('key').order('key', { ascending: false }).limit(1)
  const nextKey = existing?.length
    ? String.fromCharCode(existing[0].key.charCodeAt(0) + 1)
    : 'A'
  const { data, error } = await supabase.from('vendors').insert({ ...body, key: nextKey }).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
