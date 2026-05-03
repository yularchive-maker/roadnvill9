import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const vendorKey = searchParams.get('vendor_key')
  let q = supabase
    .from('settle_history')
    .select('*, settle_history_items(*), vendors(name,color)')
    .order('settled_at', { ascending: false })
  if (vendorKey) q = q.eq('vendor_key', vendorKey)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
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
