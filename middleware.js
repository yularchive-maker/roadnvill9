import { NextResponse } from 'next/server'

// 인증은 클라이언트 sessionStorage 기반으로 처리 (DashboardLayout에서 체크)
// 미들웨어는 단순 pass-through
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: []
}
