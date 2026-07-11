import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { HANDOFF_NOTE_FIELDS, pickRows } from '@/lib/api-dto'
import { badRequestResponse, readJsonObject, validateRequiredSafeId } from '@/lib/api-validate'

export const dynamic = 'force-dynamic'

function isMissingTable(error) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || message.includes('handoff_notes') || message.includes('handoff_reads')
}

export async function GET() {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const { data: notes, error: noteError } = await supabase
    .from('handoff_notes')
    .select(HANDOFF_NOTE_FIELDS.join(','))
    .eq('status', '湲닿툒')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('created_at', { ascending: false })

  if (noteError) {
    if (isMissingTable(noteError)) return NextResponse.json([])
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const active = (notes || []).filter(note => String(note.created_by || '') !== String(user.id))
  if (!active.length) return NextResponse.json([])

  const ids = active.map(note => note.id)
  const { data: reads, error: readError } = await supabase
    .from('handoff_reads')
    .select('handoff_id')
    .eq('user_id', user.id)
    .in('handoff_id', ids)

  if (readError) {
    if (isMissingTable(readError)) return NextResponse.json([])
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const readIds = new Set((reads || []).map(row => String(row.handoff_id)))
  return NextResponse.json(pickRows(active.filter(note => !readIds.has(String(note.id))), HANDOFF_NOTE_FIELDS))
}

export async function POST(req) {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const { handoff_id } = parsed.body
  const idError = validateRequiredSafeId(handoff_id, 'handoff_id')
  if (idError) return badRequestResponse(idError)

  const { error } = await supabase
    .from('handoff_reads')
    .upsert(
      { handoff_id, user_id: user.id, read_at: new Date().toISOString() },
      { onConflict: 'handoff_id,user_id' }
    )

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, skipped: true })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
