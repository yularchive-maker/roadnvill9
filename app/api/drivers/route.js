import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin, requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { DRIVER_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { driverWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await supabase.from('drivers').select(DRIVER_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false').order('name')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, DRIVER_FIELDS))
}

export async function POST(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, driverWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase.from('drivers').insert(validated.data).select(DRIVER_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, DRIVER_FIELDS))
}

export async function PUT(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, driverWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { id, ...rest } = validated.data
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { data, error } = await supabase.from('drivers').update(rest).eq('id', id).select(DRIVER_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, DRIVER_FIELDS))
}

export async function DELETE(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { id } = parsed.body
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { error } = await supabase.from('drivers').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
