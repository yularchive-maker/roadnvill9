'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const IconGrid = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
const IconCalendar = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const IconSearch = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
const IconList = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
const IconTimeline = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
const IconBell = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
const IconMoney = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
const IconDoc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IconBriefcase = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
const IconSettings = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
const IconSun = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
const IconMoon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8z"/></svg>

const NAV = [
  {
    section: '메인',
    items: [
      { id: 'dashboard', label: '대시보드', href: '/dashboard', icon: IconGrid },
      { id: 'reservations', label: '예약 관리', href: '/dashboard/reservations', icon: IconCalendar },
      { id: 'vendor-confirms', label: '업체 회신관리', href: '/dashboard/vendor-confirms', icon: IconList },
      { id: 'timetable', label: '타임테이블', href: '/dashboard/timetable', icon: IconTimeline },
      { id: 'notice', label: 'NOTICE', href: '/dashboard/notice', icon: IconBell },
    ]
  },
  {
    section: '정산',
    items: [
      { id: 'settle-detail', label: '업체별 정산내역', href: '/dashboard/settle-detail', icon: IconMoney },
      { id: 'settle-summary', label: '정산 요약', href: '/dashboard/settle-summary', icon: IconDoc },
      { id: 'biz', label: '사업비 관리', href: '/dashboard/biz', icon: IconBriefcase },
    ]
  },
  {
    section: '마스터',
    items: [
      { id: 'master', label: '기준 정보', href: '/dashboard/master', icon: IconSettings },
      { id: 'search', label: '상세 검색', href: '/dashboard/search', icon: IconSearch },
    ]
  },
]

const PAGE_TITLE = {
  '/dashboard': '대시보드',
  '/dashboard/reservations': '예약 관리',
  '/dashboard/vendor-confirms': '업체 회신관리',
  '/dashboard/timetable': '타임테이블',
  '/dashboard/notice': 'NOTICE',
  '/dashboard/settle-detail': '업체별 정산내역',
  '/dashboard/settle-summary': '정산 요약',
  '/dashboard/biz': '사업비 관리',
  '/dashboard/master': '기준 정보',
  '/dashboard/search': '상세 검색',
}

const SESSION = { name: '관리자', role: '운영팀장', avatar: '관' }
const HANDOFF_STATUSES = ['일반', '긴급', '완료']
const HANDOFF_STATUS_COLOR = {
  일반: 'var(--accent)',
  긴급: 'var(--red)',
  완료: 'var(--green)',
}
const MOBILE_NAV = [
  { id: 'today', label: '오늘', href: '/dashboard', icon: IconGrid },
  { id: 'calendar', label: '달력', href: '/dashboard/timetable', icon: IconCalendar },
  { id: 'reservations', label: '예약', href: '/dashboard/reservations', icon: IconList },
  { id: 'settle', label: '정산', href: '/dashboard/settle-detail', icon: IconMoney },
  { id: 'biz', label: '사업비', href: '/dashboard/biz', icon: IconBriefcase },
]

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState(SESSION)
  const [handoffNotes, setHandoffNotes] = useState([])
  const [openHandoffDetail, setOpenHandoffDetail] = useState('')
  const [handoffInputType, setHandoffInputType] = useState('일반')
  const [handoffInputText, setHandoffInputText] = useState('')
  const [handoffSaving, setHandoffSaving] = useState(false)
  const [theme, setTheme] = useState('dark')
  const title = PAGE_TITLE[pathname] || '대시보드'
  const handoffRows = handoffNotes
    .filter(n => n.is_deleted !== true)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.id || '').localeCompare(String(a.id || '')))
  const completedHandoffs = handoffRows.filter(n => normalizeHandoffStatus(n.status) === '완료')
  const pendingHandoffs = handoffRows.filter(n => normalizeHandoffStatus(n.status) !== '완료')
  const urgentHandoffs = pendingHandoffs.filter(n => normalizeHandoffStatus(n.status) === '긴급')
  const handoffDetailRows = openHandoffDetail === 'done' ? completedHandoffs : pendingHandoffs
  const handoffDetailTitle = openHandoffDetail === 'done' ? '완료된 메모' : '작성된 메모'
  const handoffDetailSubtitle = openHandoffDetail === 'done'
    ? `완료 ${completedHandoffs.length}건`
    : `메모 ${pendingHandoffs.length}건 · 긴급 ${urgentHandoffs.length}건`

  function normalizeHandoffStatus(value) {
    return HANDOFF_STATUSES.includes(value) ? value : '일반'
  }

  function handoffDateLabel(n) {
    const ds = String(n.created_at || '').slice(0, 10)
    if (!ds) return '-'
    const today = new Date()
    const todayText = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    return ds === todayText ? '오늘' : ds.slice(5)
  }

  function handoffTitle(n) {
    return n.title || (n.content || '').split('\n')[0] || '메모'
  }

  const loadHandoffNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/handoff-notes', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setHandoffNotes(Array.isArray(data) ? data : [])
    } catch {
      console.error('Handoff notes load failed')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!mounted || !res.ok) return
        const data = await res.json()
        setSession(data?.profile || SESSION)
      } catch {
        console.error('User profile load failed')
      }
    }
    loadUser()
    return () => { mounted = false }
  }, [])

  useEffect(() => { loadHandoffNotes() }, [loadHandoffNotes])

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('roadnvill-theme') : ''
    const next = stored === 'light' || stored === 'dark'
      ? stored
      : document.documentElement.dataset.theme === 'light'
        ? 'light'
        : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    window.localStorage.setItem('roadnvill-theme', next)
  }

  async function updateHandoffStatus(notice, done) {
    const currentStatus = normalizeHandoffStatus(notice.status)
    const restoreStatus = normalizeHandoffStatus(notice.previous_status)
    const nextStatus = done ? '완료' : (restoreStatus === '완료' ? '일반' : restoreStatus)
    const res = await fetch('/api/handoff-notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...notice,
        status: nextStatus,
        previous_status: done && currentStatus !== '완료' ? currentStatus : null,
      }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      alert('전달사항 상태 변경 실패: ' + (payload.error?.message || payload.error || res.status))
      return
    }
    await loadHandoffNotes()
  }

  async function addHandoffNotice() {
    const title = handoffInputText.trim()
    if (!title || handoffSaving) return
    setHandoffSaving(true)
    const res = await fetch('/api/handoff-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content: '',
        status: handoffInputType === '긴급' ? '긴급' : '일반',
      }),
    })
    setHandoffSaving(false)
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      alert('전달사항 등록 실패: ' + (payload.error?.message || payload.error || res.status))
      return
    }
    setHandoffInputText('')
    setHandoffInputType('일반')
    setOpenHandoffDetail('memo')
    await loadHandoffNotes()
  }

  async function deleteHandoffNotice(notice) {
    if (!confirm('이 전달사항을 삭제하시겠습니까?')) return
    const res = await fetch('/api/handoff-notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notice.id }),
    })
    if (!res.ok) {
      alert('전달사항 삭제 실패')
      return
    }
    await loadHandoffNotes()
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  function downloadBackup() {
    if (!confirm('현재 DB 데이터를 Excel 백업 파일로 다운로드하시겠습니까? 파일에는 고객명, 연락처, 금액 등 운영 데이터가 포함될 수 있습니다.')) return
    window.location.href = '/api/backup/excel'
  }

  return (
    <div className="app-layout">
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

        <div className="sidebar-handoff">
          <div className="sidebar-handoff-title">담당자 전달사항</div>
          <div className="sidebar-handoff-links">
            <button type="button" onClick={() => setOpenHandoffDetail('memo')}>
              메모 <strong>{pendingHandoffs.length}</strong>건
            </button>
            <button type="button" onClick={() => setOpenHandoffDetail('done')}>
              완료 <strong>{completedHandoffs.length}</strong>건
            </button>
          </div>
          {urgentHandoffs.length > 0 && (
            <button type="button" className="sidebar-handoff-urgent" onClick={() => setOpenHandoffDetail('memo')}>
              긴급 {urgentHandoffs.length}건 확인
            </button>
          )}
        </div>

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

      <div className="main">
        <div className="topbar">
          <div className="mobile-brand">
            <span className="mobile-brand-dot">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--navy)">
                <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
              </svg>
            </span>
            <div>
              <div className="mobile-brand-name">체험예약관리</div>
              <div className="page-title">{title}</div>
            </div>
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? '나이트 테마로 전환' : '라이트 테마로 전환'}
              title={theme === 'light' ? '나이트 테마' : '라이트 테마'}
            >
              <span className="theme-toggle-icon">{theme === 'light' ? IconMoon : IconSun}</span>
              <span className="theme-toggle-text">{theme === 'light' ? '나이트' : '라이트'}</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <div className="status-dot"></div>연결됨
            </div>
            <button className="btn-outline" onClick={downloadBackup}>
              Excel 백업
            </button>
            <a className="btn-primary" href={`/dashboard/reservations?new=1${pathname === '/dashboard' ? '&from=dashboard' : ''}`} style={{ textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              예약 등록
            </a>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>

      {openHandoffDetail && (
        <div className="notice-popup open" onClick={e => { if(e.target===e.currentTarget) setOpenHandoffDetail('') }}>
          <div className="notice-popup-box">
            <div className="notice-popup-header">
              <div>
                <div style={{ fontSize:'14px', fontWeight:700 }}>{handoffDetailTitle}</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>{handoffDetailSubtitle}</div>
              </div>
              <button className="close-btn" onClick={() => setOpenHandoffDetail('')}>✕</button>
            </div>
            {openHandoffDetail === 'memo' && (
              <div className="handoff-popup-input">
                <select
                  className="form-select"
                  value={handoffInputType}
                  onChange={e => setHandoffInputType(e.target.value)}
                >
                  <option value="일반">일반</option>
                  <option value="긴급">긴급</option>
                </select>
                <input
                  className="form-input"
                  value={handoffInputText}
                  onChange={e => setHandoffInputText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addHandoffNotice()
                  }}
                  placeholder="전달할 내용 입력..."
                />
                <button
                  className="btn-primary"
                  onClick={addHandoffNotice}
                  disabled={handoffSaving || !handoffInputText.trim()}
                >
                  {handoffSaving ? '등록중' : '+ 등록'}
                </button>
              </div>
            )}
            <div style={{ padding:'12px 16px', maxHeight:'58vh', overflowY:'auto' }}>
              {handoffDetailRows.length === 0 ? (
                <div style={{ padding:'18px 10px', textAlign:'center', color:'var(--text-muted)', fontSize:'12px' }}>
                  표시할 메모가 없습니다.
                </div>
              ) : handoffDetailRows.map((notice, i) => {
                const status = normalizeHandoffStatus(notice.status)
                const done = status === '완료'
                return (
                  <div key={notice.id} className="notice-item">
                    <div className="notice-item-num">{i+1}</div>
                    <div className="notice-item-content">
                      <div style={{ fontWeight:800, color:done ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom:'3px', textDecoration:done ? 'line-through' : 'none' }}>
                        {handoffTitle(notice)}
                      </div>
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', fontSize:'11px', color:'var(--text-muted)', marginBottom:'4px' }}>
                        <span style={{ color:HANDOFF_STATUS_COLOR[status], fontWeight:800 }}>{status}</span>
                        <span>{handoffDateLabel(notice)}</span>
                      </div>
                      {notice.content && <div>{notice.content}</div>}
                      <div style={{ display:'flex', gap:'6px', marginTop:'8px' }}>
                        <button className="btn-outline btn-sm" onClick={() => updateHandoffStatus(notice, !done)}>
                          {done ? '미완료' : '완료'}
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => deleteHandoffNotice(notice)}>삭제</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border2)', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button className="btn-outline" onClick={() => setOpenHandoffDetail('')}>닫기</button>
              <button className="btn-primary" onClick={() => { setOpenHandoffDetail(''); router.push('/dashboard/notice') }}>전체 관리</button>
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="모바일 주요 메뉴">
        {MOBILE_NAV.map(item => {
          const active = item.id === 'settle'
            ? pathname.startsWith('/dashboard/settle')
            : item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <button
              key={item.id}
              type="button"
              className={`mobile-bottom-item${active ? ' active' : ''}`}
              onClick={() => router.push(item.href)}
            >
              <span className="mobile-bottom-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
