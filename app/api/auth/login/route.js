import { NextResponse } from 'next/server'
import { AUTH_COOKIE, expectedSessionToken, sessionToken } from '@/lib/auth'

export async function POST(req) {
  const { password } = await req.json()
  const token = await expectedSessionToken()

  if (!token) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not configured.' }, { status: 500 })
  }

  const secret = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD
  const submitted = password ? await sessionToken(password, secret) : null

  if (!password || submitted !== token) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  })
  return res
}
