'use client'
import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
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
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌿</div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#e8eaed' }}>
            체험 예약 관리 시스템
          </h1>
          <p style={{ fontSize: '13px', color: '#8a9ab0', marginTop: '6px' }}>
            팀원만 접속 가능합니다
          </p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marg
