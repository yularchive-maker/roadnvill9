import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function PUT(req, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  const { data, error } = await supabase.from('vendors').update(body).eq('key', params.key).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const deletedAt = new Date().toISOString()
  await supabase.from('vendor_programs').update({ is_deleted: true, deleted_at: deletedAt }).eq('vendor_key', params.key)
  const { error } = await supabase
    .from('vendors')
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq('key', params.key)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
