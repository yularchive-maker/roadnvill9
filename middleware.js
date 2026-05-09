import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth/logout', '/api/telegram/webhook']

function isPublic(pathname) {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

function isProtected(pathname) {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/api')
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname) || !isProtected(pathname)) return NextResponse.next()

  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  if (session) return res

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
