import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { TIMETABLE_EVENT_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { timetableWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validateOptionalDate, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const week = searchParams.get('week')
  const dateError = validateOptionalDate(date)
  if (dateError) return badRequestResponse(dateError)
  const weekError = validateOptionalDate(week, 'week')
  if (weekError) return badRequestResponse(weekError)

  let q = supabase
    .from('timetable_events')
    .select(TIMETABLE_EVENT_FIELDS.join(','))
    .or('is_deleted.is.null,is_deleted.eq.false')
    .eq('is_manual', true)
    .order('start_time')

  if (date) {
    q = q.eq('date', date)
  } else if (week) {
    const sun = new Date(week)
    sun.setDate(sun.getDate() + 6)
    q = q.gte('date', week).lte('date', sun.toISOString().slice(0, 10))
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, TIMETABLE_EVENT_FIELDS))
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, timetableWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase
    .from('timetable_events')
    .insert({ ...validated.data, is_manual: true })
    .select(TIMETABLE_EVENT_FIELDS.join(','))
    .single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, TIMETABLE_EVENT_FIELDS), { status: 201 })
}

export async function PUT(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, timetableWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { id, ...body } = validated.data
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { data, error } = await supabase
    .from('timetable_events')
    .update(body)
    .eq('id', id)
    .select(TIMETABLE_EVENT_FIELDS.join(','))
    .single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, TIMETABLE_EVENT_FIELDS))
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { id } = parsed.body
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { error } = await supabase.from('timetable_events').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ success: true })
}
