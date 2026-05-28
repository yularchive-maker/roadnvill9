import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const month = searchParams.get('month')

  let q = supabase.from('reservations').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('date', { ascending: false })
  if (type)  q = q.eq('type', type)
  if (month) q = q.like('date', `${month}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()

  // ?덉빟踰덊샇 ?먮룞?앹꽦
  const { data: last } = await supabase
    .from('reservations').select('no').or('is_deleted.is.null,is_deleted.eq.false').order('no', { ascending: false }).limit(1)
  const nextNo = last?.length
    ? String(parseInt(last[0].no, 10) + 1).padStart(3, '0')
    : '001'

  const { data, error } = await supabase
    .from('reservations').insert({ ...body, no: nextNo }).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
