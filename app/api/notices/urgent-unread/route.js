import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isMissingTable(error) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || message.includes('notice_reads')
}

export async function GET() {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const today = todayStr()
  const { data: notices, error: noticeError } = await supabase
    .from('notices')
    .select('*')
    .eq('notice_type', '긴급')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .lte('date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (noticeError) return NextResponse.json({ error: noticeError.message }, { status: 500 })

  const active = (notices || []).filter(notice =>
    notice.special !== '완료' &&
    String(notice.created_by || '') !== String(user.id)
  )
  if (!active.length) return NextResponse.json([])

  const ids = active.map(notice => String(notice.id))
  const { data: reads, error: readError } = await supabase
    .from('notice_reads')
    .select('notice_id')
    .eq('user_id', user.id)
    .in('notice_id', ids)

  if (readError) {
    if (isMissingTable(readError)) return NextResponse.json([])
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }

  const readIds = new Set((reads || []).map(row => String(row.notice_id)))
  return NextResponse.json(active.filter(notice => !readIds.has(String(notice.id))))
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const { notice_id } = await req.json()
  if (!notice_id) return NextResponse.json({ error: 'notice_id is required.' }, { status: 400 })

  const { error } = await supabase
    .from('notice_reads')
    .upsert(
      { notice_id: String(notice_id), user_id: user.id, read_at: new Date().toISOString() },
      { onConflict: 'notice_id,user_id' }
    )

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, skipped: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
