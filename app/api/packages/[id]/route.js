import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin } from '@/lib/api-auth'
import { PACKAGE_FIELDS, pickFields } from '@/lib/api-dto'
import { packageWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function PUT(req, { params }) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const idError = validateRequiredSafeId(params.id, 'id')
  if (idError) return badRequestResponse(idError)
  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, packageWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { id: _ignored, ...payload } = validated.data
  const { data, error } = await supabase.from('packages').update(payload).eq('id', params.id).select(PACKAGE_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, PACKAGE_FIELDS))
}

export async function DELETE(_, { params }) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const idError = validateRequiredSafeId(params.id, 'id')
  if (idError) return badRequestResponse(idError)
  const { error } = await supabase
    .from('packages')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
