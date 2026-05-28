import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await supabase
    .from('vendors')
    .select('*, vendor_programs(*)')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('key')
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const body = await req.json()
  // key ?먮룞?앹꽦: V001, V002, ...
  const { data: existing } = await supabase.from('vendors').select('key').like('key', 'V%')
  let nextKey = 'V001'
  const nums = (existing || [])
    .map(v => parseInt(String(v.key || '').replace(/\D/g, ''), 10))
    .filter(n => Number.isFinite(n))
  if (nums.length) {
    const n = Math.max(...nums) + 1
    nextKey = 'V' + String(n).padStart(3, '0')
  }
  const { data, error } = await supabase.from('vendors').insert({ ...body, key: nextKey }).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
