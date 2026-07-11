import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { VENDOR_CONFIRM_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { vendorConfirmWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const no = searchParams.get('reservation_no')
  if (no) {
    const noError = validateRequiredSafeId(no, 'reservation_no')
    if (noError) return badRequestResponse(noError)
  }
  let q = supabase.from('vendor_confirms').select(VENDOR_CONFIRM_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false')
  if (no) q = q.eq('reservation_no', no)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickRows(data, VENDOR_CONFIRM_FIELDS))
}

export async function POST(req) {
  if (!await requireApiUser()) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, vendorConfirmWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  // upsert (reservation_no + vendor_key UNIQUE)
  const { data, error } = await supabase
    .from('vendor_confirms')
    .upsert(validated.data, { onConflict: 'reservation_no,vendor_key' })
    .select(VENDOR_CONFIRM_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, VENDOR_CONFIRM_FIELDS))
}
