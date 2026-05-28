import { supabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const vendorKey = searchParams.get('vendor_key')
  let q = supabase
    .from('settle_history')
    .select('*, settle_history_items(*), vendors(name,color)')
    .order('settled_at', { ascending: false })
  if (vendorKey) q = q.eq('vendor_key', vendorKey)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  const active = (data || [])
    .filter(row => row?.is_deleted !== true)
    .map(row => ({
      ...row,
      settle_history_items: (row.settle_history_items || []).filter(item => item?.is_deleted !== true),
    }))
  return NextResponse.json(active)
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  const { items, reservation_nos, update_reservations, ...historyBody } = body

  const { data: hist, error } = await supabase
    .from('settle_history').insert(historyBody).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })

  if (items?.length) {
    await supabase.from('settle_history_items').insert(
      items.map(it => ({ ...it, settle_history_id: hist.id }))
    )
  }

  // Reservation-level status is optional because a single reservation can have
  // multiple vendor/lodge/pickup settlement items.
  if (update_reservations && reservation_nos?.length) {
    await supabase.from('reservations')
      .update({ settle_status: 'settled' })
      .in('no', reservation_nos)
  }

  return NextResponse.json(hist)
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const admin = createAdminSupabase()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 500 })

  const { data: history, error: historyReadError } = await admin
    .from('settle_history')
    .select('id,is_deleted')
    .eq('id', id)
    .maybeSingle()
  if (historyReadError) return NextResponse.json({ error: historyReadError }, { status: 500 })
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
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!updatedRows?.length) return NextResponse.json({ error: 'settle history was not cancelled' }, { status: 500 })

  return NextResponse.json({ ok: true, cancelled: id })
}
