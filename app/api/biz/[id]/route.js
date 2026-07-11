import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin } from '@/lib/api-auth'
import { BIZ_FIELDS, pickFields } from '@/lib/api-dto'
import { bizWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function PUT(req, { params }) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const idError = validateRequiredSafeId(params.id, 'id')
  if (idError) return badRequestResponse(idError)
  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, bizWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { id: _ignored, ...payload } = validated.data
  const { data, error } = await supabase.from('biz').update(payload).eq('id', params.id).select(BIZ_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, BIZ_FIELDS))
}

export async function DELETE(_, { params }) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const idError = validateRequiredSafeId(params.id, 'id')
  if (idError) return badRequestResponse(idError)
  const { error } = await supabase
    .from('biz')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
