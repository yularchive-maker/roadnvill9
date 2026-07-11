import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin, requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { ZONE_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { zoneWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await supabase.from('zones').select(ZONE_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false').order('code')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, ZONE_FIELDS))
}

export async function POST(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, zoneWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase.from('zones').insert(validated.data).select(ZONE_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, ZONE_FIELDS))
}

export async function PUT(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, zoneWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { code, ...rest } = validated.data
  const codeError = validateRequiredSafeId(code, 'code')
  if (codeError) return badRequestResponse(codeError)
  const { data, error } = await supabase.from('zones').update(rest).eq('code', code).select(ZONE_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, ZONE_FIELDS))
}

export async function DELETE(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { code } = parsed.body
  const codeError = validateRequiredSafeId(code, 'code')
  if (codeError) return badRequestResponse(codeError)
  const { error } = await supabase.from('zones').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('code', code)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
