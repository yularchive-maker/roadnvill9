'use client'
import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fails, setFails] = useState(0)
  const [locked, setLocked] = useState(false)
  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (locked) return
    setLoading(true)
    setError('')

    const supabase = createClientComponentClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const newFails = fails + 1
      setFails(newFails)
      if (newFails >= 5) {
        setLocked(true)
        setError('로그인 5회 실패. 30초 후 다시 시도해주세요.')
        setTimeout(() => { setLocked(false); setFails(0); setError('') }, 30000)
      } else {
        setError(`이메일 또는 비밀번호가 올바르지 않습니다. (${newFails}/5)`)
      }
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f1923'
    }}>
      <div style={{
        background: '#1a2535', border: '1px solid #2a3a4a',
        borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🌿</div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#e8eaed' }}>
            체험 예약 관리 시스템
          </h1>
          <p style={{ fontSize: '13px', color: '#8a9ab0', marginTop: '6px' }}>
            팀원만 접속 가능합니다
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#8a9ab0', display: 'block', marginBottom: '6px' }}>
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={locked}
              style={{
                width: '100%', height: '44px', background: '#0f1923',
                border: '1px solid #2a3a4a', borderRadius: '8px',
                padding: '0 14px', fontSize: '14px', color: '#e8eaed',
                outline: 'none', opacity: locked ? 0.5 : 1
              }}
              placeholder="이메일 입력"
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', color: '#8a9ab0', display: 'block', marginBottom: '6px' }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={locked}
              style={{
                width: '100%', height: '44px', background: '#0f1923',
                border: '1px solid #2a3a4a', borderRadius: '8px',
                padding: '0 14px', fontSize: '14px', color: '#e8eaed',
                outline: 'none', opacity: locked ? 0.5 : 1
              }}
              placeholder="비밀번호 입력"
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(224,92,92,0.1)', border: '1px solid rgba(224,92,92,0.3)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
              fontSize: '13px', color: '#e05c5c', textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || locked}
            style={{
              width: '100%', height: '44px', background: '#4ecdc4',
              border: 'none', borderRadius: '8px', fontSize: '14px',
              fontWeight: '700', color: '#0f1923', cursor: locked ? 'not-allowed' : 'pointer',
              opacity: (loading || locked) ? 0.6 : 1, transition: 'opacity .2s'
            }}
          >
            {loading ? '로그인 중...' : locked ? '잠금 중 (30초)' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
