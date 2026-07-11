import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { NOTICE_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { noticeWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validateOptionalDate, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

function normalizeNoticePayload(body) {
  return {
    ...body,
    content: body?.content ?? '',
  }
}

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  for (const [label, value] of [['date', date], ['from', from], ['to', to]]) {
    const dateError = validateOptionalDate(value, label)
    if (dateError) return badRequestResponse(dateError)
  }
  let q = supabase.from('notices').select(NOTICE_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false').order('date').order('created_at')
  if (date) q = q.eq('date', date)
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, NOTICE_FIELDS))
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, noticeWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase.from('notices').insert(normalizeNoticePayload(validated.data)).select(NOTICE_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, NOTICE_FIELDS))
}

export async function PUT(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, noticeWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { id, ...rest } = validated.data
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { data, error } = await supabase.from('notices').update(normalizeNoticePayload(rest)).eq('id', id).select(NOTICE_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, NOTICE_FIELDS))
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { id } = parsed.body
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { error } = await supabase.from('notices').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
