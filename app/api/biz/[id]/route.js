import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PUT(req, { params }) {
  const body = await req.json()
  const { data, error } = await supabase.from('biz').update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_, { params }) {
  const { error } = await supabase
    .from('biz')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
