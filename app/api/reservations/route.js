import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { RESERVATION_FIELDS, RESERVATION_LIST_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { RESERVATION_TYPE_VALUES, reservationWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validateEnum, validateOptionalMonth, validatePayload } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const month = searchParams.get('month')
  const typeError = validateEnum(type, RESERVATION_TYPE_VALUES, 'type')
  if (typeError) return badRequestResponse(typeError)
  const monthError = validateOptionalMonth(month)
  if (monthError) return badRequestResponse(monthError)

  let q = supabase.from('reservations').select(RESERVATION_LIST_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false').order('date', { ascending: false })
  if (type)  q = q.eq('type', type)
  if (month) q = q.like('date', `${month}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, RESERVATION_LIST_FIELDS))
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, reservationWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)

  // ??됰튋甕곕뜇???癒?짗??밴쉐
  const { data: last } = await supabase
    .from('reservations').select('no').or('is_deleted.is.null,is_deleted.eq.false').order('no', { ascending: false }).limit(1)
  const nextNo = last?.length
    ? String(parseInt(last[0].no, 10) + 1).padStart(3, '0')
    : '001'

  const { data, error } = await supabase
    .from('reservations')
    .insert({ ...validated.data, no: nextNo })
    .select(RESERVATION_FIELDS.join(','))
    .single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, RESERVATION_FIELDS))
}
