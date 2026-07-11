import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin, requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { BIZ_FIELDS, BIZ_PAYMENT_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { bizWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await supabase
    .from('biz')
    .select(`${BIZ_FIELDS.join(',')}, biz_payments(${BIZ_PAYMENT_FIELDS.join(',')})`)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('name')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json((data || []).map(row => ({
    ...pickFields(row, BIZ_FIELDS),
    biz_payments: pickRows(row.biz_payments, BIZ_PAYMENT_FIELDS),
  })))
}

export async function POST(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, bizWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase.from('biz').insert(validated.data).select(BIZ_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, BIZ_FIELDS))
}
