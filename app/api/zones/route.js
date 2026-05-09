import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase.from('zones').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('code')
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  const { data, error } = await supabase.from('zones').insert(body).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req) {
  const body = await req.json()
  const { code, ...rest } = body
  const { data, error } = await supabase.from('zones').update(rest).eq('code', code).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  const { code } = await req.json()
  const { error } = await supabase.from('zones').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('code', code)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
