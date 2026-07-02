import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function normalizeNoticePayload(body, user, options = {}) {
  const payload = {
    ...body,
    content: body?.content ?? '',
  }
  if (options.insert && user?.id) payload.created_by = user.id
  return payload
}

function isMissingCreatedBy(error) {
  const message = String(error?.message || '')
  return error?.code === 'PGRST204' || message.includes('created_by')
}

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  let q = supabase.from('notices').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('date').order('created_at')
  if (date) q = q.eq('date', date)
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const body = await req.json()
  let payload = normalizeNoticePayload(body, user, { insert: true })
  let { data, error } = await supabase.from('notices').insert(payload).select().single()
  if (error && isMissingCreatedBy(error)) {
    const { created_by, ...fallbackPayload } = payload
    ;({ data, error } = await supabase.from('notices').insert(fallbackPayload).select().single())
  }
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const body = await req.json()
  const { id, ...rest } = body
  const { created_by, ...safeRest } = rest
  const { data, error } = await supabase.from('notices').update(normalizeNoticePayload(safeRest, user)).eq('id', id).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { id } = await req.json()
  const { error } = await supabase.from('notices').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
