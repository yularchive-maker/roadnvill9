import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const no = searchParams.get('reservation_no')
  let q = supabase.from('lodge_confirms').select('*').or('is_deleted.is.null,is_deleted.eq.false')
  if (no) q = q.eq('reservation_no', no)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  const { data, error } = await supabase.from('lodge_confirms').insert(body).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  const { id, ...rest } = body
  const { data, error } = await supabase.from('lodge_confirms').update(rest).eq('id', id).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { id } = await req.json()
  const { error } = await supabase.from('lodge_confirms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
