import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/auth-roles'

const PUBLIC_PATHS = ['/login', '/api/auth/logout', '/api/telegram/webhook']
const ADMIN_PATHS = [
  '/dashboard/master',
  '/dashboard/biz',
  '/api/backup/excel',
  '/api/telegram/webhook-settings',
  '/api/telegram/updates',
  '/api/telegram/limit-alert',
  '/api/vendor-confirms/send-telegram',
]

function isPublic(pathname) {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

function isAdminPath(pathname) {
  return ADMIN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

function isProtected(pathname) {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/api')
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname) || !isProtected(pathname)) return NextResponse.next()

  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { user }, error } = await supabase.auth.getUser()

  if (!error && user) {
    if (isAdminPath(pathname) && !isAdminEmail(user.email)) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const url = req.nextUrl.clone()
      url.pathname = '/dashboard'
      url.searchParams.set('error', 'forbidden')
      return NextResponse.redirect(url)
    }
    return res
  }

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
