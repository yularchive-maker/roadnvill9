import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PUT(req, { params }) {
  const body = await req.json()
  const { data, error } = await supabase.from('vendors').update(body).eq('key', params.key).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_, { params }) {
  const deletedAt = new Date().toISOString()
  await supabase.from('vendor_programs').update({ is_deleted: true, deleted_at: deletedAt }).eq('vendor_key', params.key)
  const { error } = await supabase
    .from('vendors')
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq('key', params.key)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
