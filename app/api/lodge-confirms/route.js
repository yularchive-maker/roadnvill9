import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { LODGE_CONFIRM_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { lodgeConfirmWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const no = searchParams.get('reservation_no')
  if (no) {
    const noError = validateRequiredSafeId(no, 'reservation_no')
    if (noError) return badRequestResponse(noError)
  }
  let q = supabase.from('lodge_confirms').select(LODGE_CONFIRM_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false')
  if (no) q = q.eq('reservation_no', no)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, LODGE_CONFIRM_FIELDS))
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, lodgeConfirmWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase.from('lodge_confirms').insert(validated.data).select(LODGE_CONFIRM_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, LODGE_CONFIRM_FIELDS))
}

export async function PUT(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, lodgeConfirmWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { id, ...rest } = validated.data
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { data, error } = await supabase.from('lodge_confirms').update(rest).eq('id', id).select(LODGE_CONFIRM_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, LODGE_CONFIRM_FIELDS))
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { id } = parsed.body
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const { error } = await supabase.from('lodge_confirms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
