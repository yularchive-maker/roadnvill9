import { NextResponse } from 'next/server'
import { AUTH_COOKIE, expectedSessionToken } from './lib/auth'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout']

function isPublic(pathname) {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

function isProtected(pathname) {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/api')
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname) || !isProtected(pathname)) return NextResponse.next()

  const expected = await expectedSessionToken()
  const actual = req.cookies.get(AUTH_COOKIE)?.value
  if (expected && actual === expected) return NextResponse.next()

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
