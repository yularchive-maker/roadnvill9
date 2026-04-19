'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'

const MAX_FAILS = 5
const LOCK_MS   = 30 * 1000

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const fails     = useRef(0)
  const lockedUntil = useRef(0)
  const router = useRouter()

  function attempt() {
    if (loading) return
    const now = Date.now()

    if (now < lockedUntil.current) {
      const sec = Math.ceil((lockedUntil.current - now) / 1000)
      setError(`⛔ 로그인 시도가 너무 많습니다. ${sec}초 후 다시 시도하세요.`)
      return
    }

    if (!email || !password) { setError('이메일과 비밀번호를 입력하세요.'); return }

    setLoading(true)
    setError('')
    const session = login(email, password)

    if (!session) {
      fails.current += 1
      if (fails.current >= MAX_FAILS) {
        lockedUntil.current = Date.now() + LOCK_MS
        fails.current = 0
        setError(`⛔ ${MAX_FAILS}회 실패로 30초간 잠금됩니다.`)
        setTimeout(() => { setError(''); lockedUntil.current = 0 }, LOCK_MS)
      } else {
        setError(`❌ 이메일 또는 비밀번호가 올바르지 않습니다. (${fails.current}/${MAX_FAILS})`)
      }
      setPassword('')
      setLoading(false)
      return
    }

    fails.current = 0
    router.push('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(78,205,196,0.07) 0%, transparent 60%)',
    }}>
      <div style={{
        width: '380px', padding: '48px 40px',
        background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '16px',
      }}>
        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '36px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--navy)">
              <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 700 }}>체험 예약 관리</h1>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>Experience Booking System</span>
          </div>
        </div>

        {/* 이메일 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>이메일</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && document.getElementById('pw').focus()}
            placeholder="이메일 입력" autoComplete="username"
            style={{ width: '100%', height: '44px', background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 14px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none' }}
          />
        </div>

        {/* 비밀번호 */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>비밀번호</label>
          <input
            id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && attempt()}
            placeholder="비밀번호 입력" autoComplete="current-password"
            style={{ width: '100%', height: '44px', background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 14px', fontSize: '14px', color: 'var(--text-primary)', outline: 'none' }}
          />
        </div>

        {/* 에러 */}
        {error && (
          <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'rgba(224,92,92,0.1)', border: '1px solid rgba(224,92,92,0.25)', borderRadius: '8px', fontSize: '12px', color: 'var(--red)', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button
          onClick={attempt} disabled={loading}
          style={{ width: '100%', height: '46px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'var(--navy)', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? '확인 중…' : '로그인'}
        </button>

        <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>팀원 계정으로만 접근 가능합니다</p>
        <p style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', opacity: 0.55 }}>
          데모: admin@experience.com / Admin1234!
        </p>
      </div>
    </div>
  )
}
