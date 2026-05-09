'use client'

import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const submittedEmail = String(formData.get('email') || email).trim()
    const submittedPassword = String(formData.get('password') || password)

    if (!submittedEmail || !submittedPassword) {
      setError('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    setError('')
    setLoading(true)

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: submittedEmail,
      password: submittedPassword,
    })

    setLoading(false)
    if (loginError) {
      setError(loginError.message || '로그인에 실패했습니다.')
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
            <p>내부 직원 계정으로 로그인해 주세요.</p>
          </div>

          <label className="login-field">
            <span>이메일</span>
            <input
              autoFocus
              name="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="staff@example.com"
              autoComplete="email"
            />
          </label>

          <label className="login-field">
            <span>비밀번호</span>
            <input
              name="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="btn-primary login-submit" disabled={loading}>
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
