import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin, requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { VENDOR_FIELDS, VENDOR_PROGRAM_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { vendorWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload } from '@/lib/api-validate'
import { resolveVendorColor } from '@/lib/vendor-colors'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await supabase
    .from('vendors')
    .select(`${VENDOR_FIELDS.join(',')}, vendor_programs(${VENDOR_PROGRAM_FIELDS.join(',')})`)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('key')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json((data || []).map(row => ({
    ...pickFields(row, VENDOR_FIELDS),
    vendor_programs: pickRows(row.vendor_programs, VENDOR_PROGRAM_FIELDS),
  })))
}

export async function POST(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, vendorWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  // key ?癒?짗??밴쉐: V001, V002, ...
  const { data: existing } = await supabase.from('vendors').select('key,color').like('key', 'V%')
  let nextKey = 'V001'
  const nums = (existing || [])
    .map(v => parseInt(String(v.key || '').replace(/\D/g, ''), 10))
    .filter(n => Number.isFinite(n))
  if (nums.length) {
    const n = Math.max(...nums) + 1
    nextKey = 'V' + String(n).padStart(3, '0')
  }
  const { key: _ignored, ...payload } = validated.data
  payload.color = resolveVendorColor(payload.color, existing || [])
  const { data, error } = await supabase.from('vendors').insert({ ...payload, key: nextKey }).select(VENDOR_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, VENDOR_FIELDS))
}
