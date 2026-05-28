import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'

export async function requireApiUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
