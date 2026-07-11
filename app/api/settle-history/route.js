import { supabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { forbiddenResponse, requireApiAdmin, requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { SETTLE_HISTORY_FIELDS, SETTLE_HISTORY_ITEM_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { settleHistoryWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, isSafeId, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const vendorKey = searchParams.get('vendor_key')
  if (vendorKey && !isSafeId(vendorKey)) return badRequestResponse('vendor_key is invalid.')
  let q = supabase
    .from('settle_history')
    .select(`${SETTLE_HISTORY_FIELDS.join(',')}, settle_history_items(${SETTLE_HISTORY_ITEM_FIELDS.join(',')}), vendors(name,color)`)
    .order('settled_at', { ascending: false })
  if (vendorKey) q = q.eq('vendor_key', vendorKey)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  const active = (data || [])
    .filter(row => row?.is_deleted !== true)
    .map(row => ({
      ...pickFields(row, SETTLE_HISTORY_FIELDS),
      vendors: row.vendors ? pickFields(row.vendors, ['name', 'color']) : row.vendors,
      settle_history_items: pickRows((row.settle_history_items || []).filter(item => item?.is_deleted !== true), SETTLE_HISTORY_ITEM_FIELDS),
    }))
  return NextResponse.json(active)
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, settleHistoryWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { items, reservation_nos, update_reservations, ...historyBody } = validated.data

  const { data: hist, error } = await supabase
    .from('settle_history')
    .insert(pickFields(historyBody, ['vendor_key', 'settle_type', 'total_amt', 'settled_at', 'settled_by']))
    .select(SETTLE_HISTORY_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  if (items?.length) {
    const itemRows = items.map(item => ({
      reservation_no: String(item?.reservation_no || '').slice(0, 30),
      customer: String(item?.customer || '').slice(0, 80),
      detail: String(item?.detail || '').slice(0, 500),
      amt: Number(item?.amt) || 0,
      settle_history_id: hist.id,
    }))
    await supabase.from('settle_history_items').insert(
      itemRows
    )
  }

  // Reservation-level status is optional because a single reservation can have
  // multiple vendor/lodge/pickup settlement items.
  const safeReservationNos = (reservation_nos || []).map(value => String(value || '')).filter(isSafeId)
  if (update_reservations && safeReservationNos.length) {
    await supabase.from('reservations')
      .update({ settle_status: 'settled' })
      .in('no', safeReservationNos)
  }

  return NextResponse.json(pickFields(hist, SETTLE_HISTORY_FIELDS))
}

export async function DELETE(req) {
  if (!await requireApiAdmin()) return forbiddenResponse()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const idError = validateRequiredSafeId(id, 'id')
  if (idError) return badRequestResponse(idError)
  const admin = createAdminSupabase()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 500 })

  const { data: history, error: historyReadError } = await admin
    .from('settle_history')
    .select('id,is_deleted')
    .eq('id', id)
    .maybeSingle()
  if (historyReadError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  if (!history || history.is_deleted === true) return NextResponse.json({ error: 'settle history not found' }, { status: 404 })

  const now = new Date().toISOString()
  const { error: itemError } = await admin
    .from('settle_history_items')
    .update({ is_deleted: true, deleted_at: now, updated_at: now })
    .eq('settle_history_id', id)
  if (itemError) return NextResponse.json({ error: itemError }, { status: 500 })

  const { data: updatedRows, error } = await admin
    .from('settle_history')
    .update({ is_deleted: true, deleted_at: now, updated_at: now })
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  if (!updatedRows?.length) return NextResponse.json({ error: 'settle history was not cancelled' }, { status: 500 })

  return NextResponse.json({ ok: true, cancelled: id })
}
