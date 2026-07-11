import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { HANDOFF_NOTE_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { handoffWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

const STATUSES = ['?쇰컲', '湲닿툒', '?꾨즺']
const RESTORABLE_STATUSES = ['?쇰컲', '湲닿툒']

function normalizeStatus(value) {
  return STATUSES.includes(value) ? value : '?쇰컲'
}

function normalizeRestorableStatus(value) {
  return RESTORABLE_STATUSES.includes(value) ? value : null
}

function isMissingTable(error) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || message.includes('handoff_notes')
}

export async function GET() {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const { data, error } = await supabase
    .from('handoff_notes')
    .select(HANDOFF_NOTE_FIELDS.join(','))
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) return NextResponse.json([])
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(pickRows(data, HANDOFF_NOTE_FIELDS))
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, handoffWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const title = String(validated.data?.title || '').trim()
  if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 })

  const payload = {
    title,
    content: String(validated.data?.content || ''),
    status: normalizeStatus(validated.data?.status),
    created_by: user.id,
  }

  const { data, error } = await supabase.from('handoff_notes').insert(payload).select(HANDOFF_NOTE_FIELDS.join(',')).single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'handoff_notes table is not ready.' }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  return NextResponse.json(pickFields(data, HANDOFF_NOTE_FIELDS))
}

export async function PUT(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, handoffWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const id = validated.data?.id
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)

  const payload = {
    title: String(validated.data?.title || '').trim(),
    content: String(validated.data?.content || ''),
    status: normalizeStatus(validated.data?.status),
    previous_status: normalizeRestorableStatus(validated.data?.previous_status),
    updated_at: new Date().toISOString(),
  }
  if (!payload.title) delete payload.title

  const { data, error } = await supabase.from('handoff_notes').update(payload).eq('id', id).select(HANDOFF_NOTE_FIELDS.join(',')).single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'handoff_notes table is not ready.' }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  return NextResponse.json(pickFields(data, HANDOFF_NOTE_FIELDS))
}

export async function DELETE(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { id } = parsed.body
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)

  const { error } = await supabase
    .from('handoff_notes')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'handoff_notes table is not ready.' }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
