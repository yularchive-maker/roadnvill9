import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase.from('platforms').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('type').order('name')
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  const { data, error } = await supabase.from('platforms').insert(body).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req) {
  const body = await req.json()
  const { id, ...rest } = body
  const { data, error } = await supabase.from('platforms').update(rest).eq('id', id).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  const { id } = await req.json()
  const { error } = await supabase.from('platforms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
