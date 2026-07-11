import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin } from '@/lib/api-auth'
import { VENDOR_FIELDS, pickFields } from '@/lib/api-dto'
import { vendorWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function PUT(req, { params }) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const keyError = validateRequiredSafeId(params.key, 'key')
  if (keyError) return badRequestResponse(keyError)
  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, vendorWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { key: _ignored, ...payload } = validated.data
  const { data, error } = await supabase.from('vendors').update(payload).eq('key', params.key).select(VENDOR_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, VENDOR_FIELDS))
}

export async function DELETE(_, { params }) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const keyError = validateRequiredSafeId(params.key, 'key')
  if (keyError) return badRequestResponse(keyError)
  const deletedAt = new Date().toISOString()
  await supabase.from('vendor_programs').update({ is_deleted: true, deleted_at: deletedAt }).eq('vendor_key', params.key)
  const { error } = await supabase
    .from('vendors')
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq('key', params.key)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
