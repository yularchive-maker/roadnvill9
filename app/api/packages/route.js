import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('packages')
    .select('*, package_programs(*, vendors(key,name,color))')
    .order('name')
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  const { data, error } = await supabase.from('packages').insert(body).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
