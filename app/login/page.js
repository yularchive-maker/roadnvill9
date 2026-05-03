'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || '로그인에 실패했습니다.')
      return
    }

    router.replace(searchParams.get('next') || '/dashboard')
    router.refresh()
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-logo">
          <div className="dot">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--navy)">
              <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
            </svg>
          </div>
          <span>체험예약관리</span>
        </div>

        <form onSubmit={submit} className="login-form">
          <div>
            <h1>관리자 로그인</h1>
            <p>예약과 정산 정보 보호를 위해 비밀번호를 입력해 주세요.</p>
          </div>

          <label className="login-field">
            <span>비밀번호</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="관리자 비밀번호"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="btn-primary login-submit" disabled={loading || !password}>
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
