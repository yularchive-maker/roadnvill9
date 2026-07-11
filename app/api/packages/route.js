import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { notFoundResponse, requireApiAdmin, requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { PACKAGE_FIELDS, PACKAGE_PROGRAM_FIELDS, pickFields, pickRows } from '@/lib/api-dto'
import { packageWriteSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await requireApiUser()) return unauthorizedResponse()

  const { data, error } = await supabase
    .from('packages')
    .select(`${PACKAGE_FIELDS.join(',')}, package_programs(${PACKAGE_PROGRAM_FIELDS.join(',')}, vendors(key,name,color))`)
    .order('name')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json((data || []).map(row => ({
    ...pickFields(row, PACKAGE_FIELDS),
    package_programs: (row.package_programs || []).map(program => ({
      ...pickFields(program, PACKAGE_PROGRAM_FIELDS),
      vendors: program.vendors ? pickFields(program.vendors, ['key', 'name', 'color']) : program.vendors,
    })),
  })))
}

export async function POST(req) {
  if (!await requireApiAdmin()) return notFoundResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, packageWriteSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const { data, error } = await supabase.from('packages').insert(validated.data).select(PACKAGE_FIELDS.join(',')).single()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(pickFields(data, PACKAGE_FIELDS))
}
