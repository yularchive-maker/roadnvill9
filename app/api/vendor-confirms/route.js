import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const no = searchParams.get('reservation_no')
  let q = supabase.from('vendor_confirms').select('*').or('is_deleted.is.null,is_deleted.eq.false')
  if (no) q = q.eq('reservation_no', no)
  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  // upsert (reservation_no + vendor_key UNIQUE)
  const { data, error } = await supabase
    .from('vendor_confirms')
    .upsert(body, { onConflict: 'reservation_no,vendor_key' })
    .select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
