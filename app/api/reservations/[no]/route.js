import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import {
  LODGE_CONFIRM_FIELDS,
  PICKUP_FIELDS,
  RESERVATION_FIELDS,
  VENDOR_CONFIRM_FIELDS,
  pickFields,
  pickRows,
} from '@/lib/api-dto'
import { reservationWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

function active(q) {
  return q.or('is_deleted.is.null,is_deleted.eq.false')
}

export async function GET(_, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()
  const paramError = validateRequiredSafeId(params.no, 'no')
  if (paramError) return badRequestResponse(paramError)

  const { data, error } = await active(
    supabase
      .from('reservations')
      .select(`${RESERVATION_FIELDS.join(',')}, reservation_pickup(${PICKUP_FIELDS.join(',')}, drivers(name)), lodge_confirms(${LODGE_CONFIRM_FIELDS.join(',')}), vendor_confirms(${VENDOR_CONFIRM_FIELDS.join(',')})`)
      .eq('no', params.no)
  ).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    ...pickFields(data, RESERVATION_FIELDS),
    reservation_pickup: pickRows(data.reservation_pickup, PICKUP_FIELDS),
    lodge_confirms: pickRows(data.lodge_confirms, LODGE_CONFIRM_FIELDS),
    vendor_confirms: pickRows(data.vendor_confirms, VENDOR_CONFIRM_FIELDS),
  })
}

export async function PUT(req, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()
  const paramError = validateRequiredSafeId(params.no, 'no')
  if (paramError) return badRequestResponse(paramError)

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, reservationWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase
    .from('reservations').update(validated.data).eq('no', params.no).select(RESERVATION_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, RESERVATION_FIELDS))
}

export async function DELETE(_, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()
  const paramError = validateRequiredSafeId(params.no, 'no')
  if (paramError) return badRequestResponse(paramError)

  const deletedAt = new Date().toISOString()
  await supabase.from('vendor_confirms').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  await supabase.from('lodge_confirms').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  await supabase.from('reservation_pickup').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  await supabase.from('reservation_budget_usages').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  await supabase.from('reservation_program_snapshots').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  const { error } = await supabase
    .from('reservations')
    .update({ is_deleted: true, deleted_at: deletedAt, reservation_status: '痍⑥냼', type: 'cancelled' })
    .eq('no', params.no)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
