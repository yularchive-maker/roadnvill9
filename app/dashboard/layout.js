'use client'
import { useRouter, usePathname } from 'next/navigation'

const NAV = [
  {
    section: '메인',
    items: [
      { id: 'dashboard',    label: '대시보드',      href: '/dashboard',            icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
      { id: 'reservations', label: '예약 관리',      href: '/dashboard/reservations', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
      { id: 'timetable',   label: '타임테이블',     href: '/dashboard/timetable',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
      { id: 'notice',      label: 'NOTICE',         href: '/dashboard/notice',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    ]
  },
  {
    section: '정산',
    items: [
      { id: 'settle-detail',  label: '업체별 정산내역', href: '/dashboard/settle-detail',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { id: 'settle-summary', label: '정산 요약',       href: '/dashboard/settle-summary', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
      { id: 'biz',            label: '사업비 관리',     href: '/dashboard/biz',            icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
    ]
  },
  {
    section: '마스터',
    items: [
      { id: 'master', label: '기준 정보', href: '/dashboard/master', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> },
    ]
  },
]

const PAGE_TITLE = {
  '/dashboard':              '대시보드',
  '/dashboard/reservations': '예약 관리',
  '/dashboard/timetable':    '타임테이블',
  '/dashboard/notice':       'NOTICE',
  '/dashboard/settle-detail':'업체별 정산내역',
  '/dashboard/settle-summary':'정산 요약',
  '/dashboard/biz':          '사업비 관리',
  '/dashboard/master':       '기준 정보',
}

const SESSION = { name: '관리자', role: '운영팀장', avatar: '관' }

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const session = SESSION

  const title = PAGE_TITLE[pathname] || '대시보드'

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="app-layout">
      {/* ── 사이드바 */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="dot">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--navy)">
              <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
            </svg>
          </div>
          <span>체험예약관리</span>
        </div>

        {NAV.map(group => (
          <div key={group.section}>
            <div className="sb-section">{group.section}</div>
            {group.items.map(item => (
              <div
                key={item.id}
                className={`nav-item${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? ' active' : ''}`}
                onClick={() => router.push(item.href)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        ))}

        <div className="sb-bottom">
          <div className="user-card">
            <div className="avatar">{session.avatar}</div>
            <div>
              <div className="user-name">{session.name}</div>
              <div className="user-role">{session.role}</div>
            </div>
            <button className="logout-btn" onClick={logout}>로그아웃</button>
          </div>
        </div>
      </nav>

      {/* ── 메인 */}
      <div className="main">
        <div className="topbar">
          <div className="page-title">{title}</div>
          <div className="topbar-right">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <div className="status-dot"></div>연결됨
            </div>
            <button className="btn-primary" onClick={() => {
              const from = pathname === '/dashboard' ? '&from=dashboard' : ''
              router.push(`/dashboard/reservations?new=1${from}`)
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              예약 등록
            </button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
