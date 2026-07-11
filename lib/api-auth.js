import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-roles'

export async function requireApiUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function requireApiAdmin() {
  const user = await requireApiUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export function notFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
