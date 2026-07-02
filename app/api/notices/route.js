import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function normalizeNoticePayload(body) {
  return {
    ...body,
    content: body?.content ?? '',
  }
}

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  let q = supabase.from('notices').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('date').order('created_at')
  if (date) q = q.eq('date', date)
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const body = await req.json()
  const { data, error } = await supabase.from('notices').insert(normalizeNoticePayload(body)).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const body = await req.json()
  const { id, ...rest } = body
  const { data, error } = await supabase.from('notices').update(normalizeNoticePayload(rest)).eq('id', id).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { id } = await req.json()
  const { error } = await supabase.from('notices').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
