import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const week = searchParams.get('week')

  let q = supabase
    .from('timetable_events')
    .select('*')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .eq('is_manual', true)
    .order('start_time')

  if (date) {
    q = q.eq('date', date)
  } else if (week) {
    const sun = new Date(week)
    sun.setDate(sun.getDate() + 6)
    q = q.gte('date', week).lte('date', sun.toISOString().slice(0, 10))
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('timetable_events')
    .insert({ ...body, is_manual: true })
    .select()
    .single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req) {
  const { id, ...body } = await req.json()
  const { data, error } = await supabase
    .from('timetable_events')
    .update(body)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  const { id } = await req.json()
  const { error } = await supabase.from('timetable_events').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ success: true })
}
