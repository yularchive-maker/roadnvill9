import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// 사업비 목록 (biz_names + biz_vendors join)
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const [bizRes, vendorRes] = await Promise.all([
    supabase.from('biz_names').select('*').order('id'),
    supabase.from('biz_vendors').select('*').order('id'),
  ])

  if (bizRes.error) return NextResponse.json([], { status: 200 })

  const bizList = (bizRes.data || []).map(b => ({
    ...b,
    vendors: (vendorRes.data || []).filter(v => v.biz_id === b.id),
  }))

  return NextResponse.json(bizList)
}

export async function POST(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  if (action === 'add_biz') {
    const { data, error } = await supabase
      .from('biz_names').insert([{ name: body.name, period: body.period, status: body.status || '진행중' }]).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (action === 'add_vendor') {
    const { data, error } = await supabase
      .from('biz_vendors').insert([{
        biz_id: body.biz_id, div: body.div, vendor: body.vendor,
        budget: body.budget || 0, paid: body.paid || 0, used: body.used || 0,
      }]).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (action === 'update_vendor') {
    const { data, error } = await supabase
      .from('biz_vendors').update({ paid: body.paid, used: body.used }).eq('id', body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}

export async function DELETE(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { action, id } = await request.json()
  const table = action === 'del_biz' ? 'biz_names' : 'biz_vendors'
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
