import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const STATUSES = ['일반', '긴급', '완료']

function normalizeStatus(value) {
  return STATUSES.includes(value) ? value : '일반'
}

function isMissingTable(error) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || message.includes('handoff_notes')
}

export async function GET() {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const { data, error } = await supabase
    .from('handoff_notes')
    .select('*')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const body = await req.json()
  const title = String(body?.title || '').trim()
  if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 })

  const payload = {
    title,
    content: String(body?.content || ''),
    status: normalizeStatus(body?.status),
    created_by: user.id,
  }

  const { data, error } = await supabase.from('handoff_notes').insert(payload).select().single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'handoff_notes table is not ready.' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PUT(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const body = await req.json()
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const payload = {
    title: String(body?.title || '').trim(),
    content: String(body?.content || ''),
    status: normalizeStatus(body?.status),
    updated_at: new Date().toISOString(),
  }
  if (!payload.title) delete payload.title

  const { data, error } = await supabase.from('handoff_notes').update(payload).eq('id', id).select().single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'handoff_notes table is not ready.' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { error } = await supabase
    .from('handoff_notes')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'handoff_notes table is not ready.' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
