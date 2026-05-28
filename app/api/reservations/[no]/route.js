import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function active(q) {
  return q.or('is_deleted.is.null,is_deleted.eq.false')
}

export async function GET(_, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await active(
    supabase
      .from('reservations')
      .select('*, reservation_pickup(*), lodge_confirms(*), vendor_confirms(*)')
      .eq('no', params.no)
  ).single()
  if (error) return NextResponse.json({ error }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  const { data, error } = await supabase
    .from('reservations').update(body).eq('no', params.no).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_, { params }) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const deletedAt = new Date().toISOString()
  await supabase.from('vendor_confirms').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  await supabase.from('lodge_confirms').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  await supabase.from('reservation_pickup').update({ is_deleted: true, deleted_at: deletedAt }).eq('reservation_no', params.no)
  const { error } = await supabase
    .from('reservations')
    .update({ is_deleted: true, deleted_at: deletedAt, reservation_status: '취소', type: 'cancelled' })
    .eq('no', params.no)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
