import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function PUT(req, { params }) {
  const body = await req.json()
  const { data, error } = await supabase.from('vendors').update(body).eq('key', params.key).select().single()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_, { params }) {
  const { error } = await supabase.from('vendors').delete().eq('key', params.key)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
