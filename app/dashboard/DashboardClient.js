'use client'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DashboardClient({ user, reservations, vendors, zones, packages }) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [activePage, setActivePage] = useState('dashboard')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const statusLabel = {
    confirmed: '확정', pending: '대기', cancelled: '취소', consult: '상담필요'
  }

  const statusColor = {
    confirmed: '#5cb85c', pending: '#f7c948', cancelled: '#e05c5c', consult: '#8a9ab0'
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRes = reservations.filter(r => r.date === todayStr)
  const monthRes = reservations.filter(r => r.date?.slice(0, 7) === todayStr.slice(0, 7))
  const totalAmount = monthRes.reduce((s, r) => s + (r.total || 0), 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1923' }}>

      {/* 사이드바 */}
      <div style={{
        width: '220px', flexShrink: 0, background: '#1a2535',
        borderRight: '1px solid #2a3a4a', display: 'flex', flexDirection: 'column',
        padding: '20px 0'
      }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #2a3a4a' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#4ecdc4' }}>🌿 체험예약관리</div>
          <div style={{ fontSize: '11px', color: '#8a9ab0', marginTop: '4px' }}>{user.email}</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
          {[
            { id: 'dashboard', label: '대시보드', icon: '📊' },
            { id: 'reservations', label: '예약 관리', icon: '📋' },
            { id: 'timetable', label: '타임테이블', icon: '🕐' },
            { id: 'settle', label: '정산 관리', icon: '💰' },
            { id: 'master', label: '기준 정보', icon: '⚙️' },
          ].map(item => (
            <div
              key={item.id}
              onClick={() => setActivePage(item.id)}
              style={{
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '10px',
                background: activePage === item.id ? 'rgba(78,205,196,0.1)' : 'transparent',
                color: activePage === item.id ? '#4ecdc4' : '#8a9ab0',
                borderLeft: activePage === item.id ? '3px solid #4ecdc4' : '3px solid transparent',
                transition: 'all .15s'
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #2a3a4a' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', height: '36px', background: 'rgba(224,92,92,0.1)',
              border: '1px solid rgba(224,92,92,0.3)', borderRadius: '8px',
              color: '#e05c5c', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* 헤더 */}
        <div style={{
          height: '52px', background: '#1a2535', borderBottom: '1px solid #2a3a4a',
          display: 'flex', alignItems: 'center', padding: '0 24px',
          fontSize: '15px', fontWeight: '700', color: '#e8eaed'
        }}>
          {{ dashboard:'대시보드', reservations:'예약 관리', timetable:'타임테이블',
             settle:'정산 관리', master:'기준 정보' }[activePage]}
        </div>

        <div style={{ padding: '24px' }}>

          {/* ── 대시보드 ── */}
          {activePage === 'dashboard' && (
            <div>
              {/* KPI */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
                {[
                  { label: '이번달 예약', value: monthRes.length + '건', color: '#4ecdc4' },
                  { label: '이번달 매출', value: '₩' + totalAmount.toLocaleString(), color: '#e8eaed', small: true },
                  { label: '오늘 예약', value: todayRes.length + '건', color: '#f7c948' },
                  { label: '전체 예약', value: reservations.length + '건', color: '#8a9ab0' },
                ].map((k, i) => (
                  <div key={i} style={{
                    background: '#1a2535', border: '1px solid #2a3a4a',
                    borderRadius: '12px', padding: '16px 20px'
                  }}>
                    <div style={{ fontSize: '11px', color: '#8a9ab0', marginBottom: '8px' }}>{k.label}</div>
                    <div style={{ fontSize: k.small ? '18px' : '24px', fontWeight: '700', color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* 최근 예약 */}
              <div style={{ background: '#1a2535', border: '1px solid #2a3a4a', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #2a3a4a', fontWeight: '700', fontSize: '14px' }}>
                  최근 예약
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#0f1923' }}>
                        {['NO', '날짜', '고객명', '패키지', '인원', '상태', '총결제'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8a9ab0', fontSize: '11px', fontWeight: '600' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.slice(0, 10).map((r, i) => (
                        <tr key={r.id} style={{ borderTop: '1px solid #2a3a4a', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(78,205,196,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '13px 16px', color: '#8a9ab0' }}>#{r.no}</td>
                          <td style={{ padding: '13px 16px' }}>{r.date}</td>
                          <td style={{ padding: '13px 16px', fontWeight: '600' }}>{r.customer}</td>
                          <td style={{ padding: '13px 16px', color: '#8a9ab0' }}>{r.pkg}</td>
                          <td style={{ padding: '13px 16px' }}>{r.pax}명</td>
                          <td style={{ padding: '13px 16px' }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                              background: statusColor[r.type] + '22', color: statusColor[r.type]
                            }}>
                              {statusLabel[r.type] || r.type}
                            </span>
                          </td>
                          <td style={{ padding: '13px 16px', fontFamily: 'monospace' }}>
                            ₩{(r.total || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {reservations.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#8a9ab0' }}>
                          등록된 예약이 없습니다
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── 예약 관리 ── */}
          {activePage === 'reservations' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                <div style={{ fontSize: '14px', color: '#8a9ab0' }}>총 {reservations.length}건</div>
                <button style={{
                  height: '36px', padding: '0 16px', background: '#4ecdc4',
                  border: 'none', borderRadius: '8px', fontSize: '13px',
                  fontWeight: '700', color: '#0f1923', cursor: 'pointer'
                }}>+ 예약 등록</button>
              </div>
              <div style={{ background: '#1a2535', border: '1px solid #2a3a4a', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#0f1923' }}>
                        {['NO', '예약날짜', '고객명', '패키지', '인원', '상태', '1인판매가', '총결제', '결제처', '운영구분'].map(h => (
                          <th key={h} style={{ padding: '11px 16px', textAlign: 'left', color: '#8a9ab0', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map(r => (
                        <tr key={r.id} style={{ borderTop: '1px solid #2a3a4a', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(78,205,196,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '14px 16px', color: '#8a9ab0' }}>#{r.no}</td>
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>{r.date}</td>
                          <td style={{ padding: '14px 16px', fontWeight: '600' }}>{r.customer}</td>
                          <td style={{ padding: '14px 16px' }}>{r.pkg}</td>
                          <td style={{ padding: '14px 16px' }}>{r.pax}명</td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                              background: statusColor[r.type] + '22', color: statusColor[r.type]
                            }}>
                              {statusLabel[r.type] || r.type}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>₩{(r.price || 0).toLocaleString()}</td>
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: '600' }}>₩{(r.total || 0).toLocaleString()}</td>
                          <td style={{ padding: '14px 16px', color: '#8a9ab0', fontSize: '12px' }}>{r.payto}</td>
                          <td style={{ padding: '14px 16px', color: r.op === '사업비' ? '#f7c948' : '#8a9ab0', fontSize: '12px' }}>{r.op}</td>
                        </tr>
                      ))}
                      {reservations.length === 0 && (
                        <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#8a9ab0' }}>
                          등록된 예약이 없습니다
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── 기타 페이지 (준비중) ── */}
          {['timetable', 'settle', 'master'].includes(activePage) && (
            <div style={{
              background: '#1a2535', border: '1px solid #2a3a4a',
              borderRadius: '12px', padding: '60px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>🚧</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#e8eaed', marginBottom: '8px' }}>
                준비 중입니다
              </div>
              <div style={{ fontSize: '13px', color: '#8a9ab0' }}>
                이 기능은 곧 추가될 예정입니다
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
