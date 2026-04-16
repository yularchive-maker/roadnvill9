'use client'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import ReservationsPage from './reservations/ReservationsPage'
import TimetablePage from './timetable/TimetablePage'
import MasterPage from './master/MasterPage'
import SettleDetailPage from './settle/SettleDetailPage'
import BizPage from './biz/BizPage'

// ── 상수 ──────────────────────────────────────────────────────────
const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR = { confirmed:'#5CB85C', pending:'#F7C948', cancelled:'#E05C5C', consult:'#8FA3B1' }

// ── 스타일 헬퍼 ──────────────────────────────────────────────────
const S = {
  card: { background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px' },
  input: { width:'100%', height:'36px', background:'var(--navy3)', border:'1px solid var(--border)',
    borderRadius:'7px', padding:'0 12px', fontSize:'13px', color:'var(--text-primary)', outline:'none' },
  btnPrimary: { height:'34px', padding:'0 16px', background:'var(--accent)', border:'none',
    borderRadius:'7px', color:'var(--navy)', fontSize:'13px', fontWeight:'700', cursor:'pointer' },
  btnOutline: { height:'34px', padding:'0 14px', background:'transparent', border:'1px solid var(--border)',
    borderRadius:'7px', color:'var(--text-secondary)', fontSize:'13px', cursor:'pointer' },
}

// ── 날짜 유틸 ─────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0,10) }
function monthStr()  { return new Date().toISOString().slice(0,7)  }

// ────────────────────────────────────────────────────────────────
// 달력 컴포넌트
// ────────────────────────────────────────────────────────────────
function Calendar({ reservations, packages, year, month, selectedDate, onSelect, onDblClick }) {
  const days = ['일','월','화','수','목','금','토']
  const first = new Date(year, month-1, 1).getDay()
  const last  = new Date(year, month, 0).getDate()
  const prevLast = new Date(year, month-1, 0).getDate()
  const today = todayStr()

  const cells = []
  // 이전 달
  for (let i = 0; i < first; i++) {
    cells.push(
      <div key={`p${i}`} style={{ opacity:.3, minHeight:'72px', padding:'5px 4px', borderRadius:'8px' }}>
        <div style={{ fontSize:'12px' }}>{prevLast - first + i + 1}</div>
      </div>
    )
  }
  // 이번 달
  for (let d = 1; d <= last; d++) {
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dayRes = reservations.filter(r => r.date === ds && r.type !== 'cancelled')
    const resCnt = dayRes.length
    const totalPax = dayRes.reduce((s,r) => s+(r.pax||0), 0)
    const isToday = ds === today
    const isSel   = ds === selectedDate

    // paxLimit 초과 체크
    const paxOver = dayRes.some(r => {
      const pkg = packages.find(p => p.name === r.pkg)
      if (!pkg?.pax_limit) return false
      const pkgPax = dayRes.filter(x=>x.pkg===r.pkg).reduce((s,x)=>s+(x.pax||0),0)
      return pkgPax >= pkg.pax_limit
    })

    cells.push(
      <div key={ds}
        onClick={() => onSelect(ds)}
        onDoubleClick={() => onDblClick(ds)}
        style={{
          borderRadius:'8px', minHeight:'72px', padding:'5px 4px',
          cursor:'pointer', fontSize:'12px', display:'flex', flexDirection:'column', alignItems:'center',
          background: isSel ? 'rgba(78,205,196,.22)' : isToday ? 'rgba(78,205,196,.15)' : 'transparent',
          boxShadow: isSel ? 'inset 0 0 0 2px var(--accent)' : paxOver ? 'inset 0 0 0 2px rgba(247,201,72,.6)' : 'none',
          transition: 'background .15s',
        }}
        title={paxOver ? '⚠ 인원 초과' : ''}
      >
        <div style={{ fontSize:'12px', fontWeight: isToday||isSel ? '700':'500',
          color: isToday||isSel ? 'var(--accent)':'var(--text-primary)', marginBottom:'2px' }}>{d}</div>
        {resCnt > 0 && <div style={{ fontSize:'9px', color:'var(--accent)', fontWeight:'500' }}>예약{resCnt}건</div>}
        {totalPax > 0 && <div style={{ fontSize:'9px', fontWeight:'700',
          color: paxOver ? 'var(--amber)':'var(--text-muted)' }}>{paxOver?'⚠ ':''}{totalPax}명</div>}
      </div>
    )
  }
  // 다음 달
  const rem = (first + last) % 7
  if (rem > 0) for (let i=1; i<=7-rem; i++) {
    cells.push(<div key={`n${i}`} style={{ opacity:.3, minHeight:'72px', padding:'5px 4px', borderRadius:'8px' }}>
      <div style={{ fontSize:'12px' }}>{i}</div>
    </div>)
  }

  return (
    <div style={{ padding:'16px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px', marginBottom:'4px' }}>
        {days.map(d => <div key={d} style={{ textAlign:'center', fontSize:'10px', fontWeight:'600',
          color:'var(--text-muted)', padding:'4px 0', letterSpacing:'.5px' }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px' }}>
        {cells}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 대시보드 날짜별 예약 패널
// ────────────────────────────────────────────────────────────────
function DashDatePanel({ dateStr, reservations, packages, vendors, onNewReserve, onOpenDetail }) {
  if (!dateStr) return (
    <div style={{ padding:'30px', textAlign:'center', fontSize:'12px', color:'var(--text-muted)' }}>
      달력에서 날짜를 선택하세요
    </div>
  )
  const dayRes = reservations.filter(r => r.date === dateStr)
  if (!dayRes.length) return (
    <div style={{ ...S.card, padding:'24px', textAlign:'center' }}>
      <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'12px' }}>해당 날짜 예약이 없습니다.</div>
      <button onClick={() => onNewReserve(dateStr)} style={{ ...S.btnPrimary, fontSize:'12px', height:'30px' }}>+ 예약 등록</button>
    </div>
  )
  return (
    <div style={{ ...S.card, overflow:'hidden' }}>
      {dayRes.map(r => {
        const statusC = STATUS_COLOR[r.type] || '#8FA3B1'
        return (
          <div key={r.id} onClick={() => onOpenDetail(r)}
            style={{ padding:'12px 14px', cursor:'pointer', borderBottom:'1px solid var(--border2)',
              transition:'background .12s' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(78,205,196,.04)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'7px', height:'7px', borderRadius:'50%', background: statusC, flexShrink:0 }}/>
                <span style={{ fontWeight:'600', fontSize:'13px' }}>{r.customer}</span>
                <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{r.pax}명</span>
              </div>
              <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', fontWeight:'600',
                background: statusC+'22', color: statusC }}>{STATUS_LABEL[r.type]}</span>
            </div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginLeft:'15px' }}>
              {r.pkg} · ₩{(r.total||0).toLocaleString()}
            </div>
          </div>
        )
      })}
      <div style={{ padding:'8px 14px', fontSize:'11px', color:'var(--text-muted)', textAlign:'right' }}>
        총 {dayRes.length}건
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 검색 페이지
// ────────────────────────────────────────────────────────────────
function SearchPage({ reservations }) {
  const [kw, setKw] = useState('')
  const [results, setResults] = useState(null)

  const doSearch = () => {
    if (!kw.trim()) return
    const r = reservations.filter(x =>
      x.customer?.includes(kw) || x.no?.includes(kw) ||
      x.date?.startsWith(kw) || x.pkg?.includes(kw) ||
      (x.tel && x.tel.replace(/-/g,'').includes(kw.replace(/-/g,'')))
    )
    setResults(r)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
        <input value={kw} onChange={e=>setKw(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&doSearch()}
          placeholder="고객명, 연락처, 예약NO, 날짜(2026-01) 입력..."
          style={{ ...S.input, flex:1, height:'40px' }}/>
        <button onClick={doSearch} style={{ ...S.btnPrimary, height:'40px', padding:'0 20px' }}>조회</button>
      </div>

      {results === null && (
        <div style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>🔍</div>
          <div style={{ fontSize:'14px' }}>검색어를 입력하고 조회하세요</div>
        </div>
      )}

      {results && results.length === 0 && (
        <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>검색 결과 없음: "{kw}"</div>
      )}

      {results && results.length > 0 && (
        <div>
          <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'12px' }}>{results.length}건 검색됨</div>
          <div style={{ ...S.card, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'50px 100px 1fr 60px 80px 110px 80px',
              padding:'11px 18px', fontSize:'11px', color:'var(--text-muted)', fontWeight:'600',
              borderBottom:'1px solid var(--border2)', background:'rgba(0,0,0,.1)' }}>
              {['NO','예약날짜','고객명·패키지','인원','상태','총결제금액','운영'].map(h=>
                <span key={h}>{h}</span>)}
            </div>
            {results.map(r => (
              <div key={r.id} style={{ display:'grid', gridTemplateColumns:'50px 100px 1fr 60px 80px 110px 80px',
                padding:'13px 18px', fontSize:'13px', borderBottom:'1px solid var(--border2)', alignItems:'center' }}>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:'11px', color:'var(--text-muted)' }}>#{r.no}</span>
                <span style={{ fontSize:'12px' }}>{r.date}</span>
                <div>
                  <div style={{ fontWeight:'500' }}>{r.customer}</div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{r.pkg}</div>
                </div>
                <span>{r.pax}명</span>
                <span><span style={{ padding:'3px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:'600',
                  background:(STATUS_COLOR[r.type]||'#8FA3B1')+'22', color:STATUS_COLOR[r.type]||'#8FA3B1' }}>
                  {STATUS_LABEL[r.type]||r.type}</span></span>
                <span style={{ fontFamily:'DM Mono,monospace', fontWeight:'600', color:'var(--accent)' }}>
                  ₩{(r.total||0).toLocaleString()}</span>
                <span style={{ fontSize:'12px', color:r.op==='사업비'?'var(--amber)':'var(--text-muted)' }}>{r.op}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 정산 요약 페이지
// ────────────────────────────────────────────────────────────────
function SettleSummaryPage({ reservations, packages, vendors }) {
  const [period, setPeriod] = useState('month')

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const filtered = reservations.filter(r => r.date?.startsWith(thisMonth) && r.type !== 'cancelled')

  const totalRevenue = filtered.reduce((s,r) => s+(r.total||0), 0)
  const totalPax     = filtered.reduce((s,r) => s+(r.pax||0), 0)
  const confirmed    = filtered.filter(r => r.type==='confirmed').length
  const pending      = filtered.filter(r => r.type==='pending').length

  // 패키지별 집계
  const pkgMap = {}
  filtered.forEach(r => {
    if (!pkgMap[r.pkg]) pkgMap[r.pkg] = { cnt:0, pax:0, total:0 }
    pkgMap[r.pkg].cnt++
    pkgMap[r.pkg].pax  += r.pax||0
    pkgMap[r.pkg].total += r.total||0
  })

  return (
    <div>
      <div style={{ display:'flex', gap:'14px', marginBottom:'24px' }}>
        {[
          { label:'이번달 총결제', value:'₩'+totalRevenue.toLocaleString(), color:'var(--accent)', small:true },
          { label:'이번달 예약건수', value:filtered.length+'건', color:'var(--accent)' },
          { label:'이번달 참여인원', value:totalPax+'명', color:'var(--text-primary)' },
          { label:'확정 / 대기', value:confirmed+' / '+pending, color:'var(--amber)' },
        ].map((k,i) => (
          <div key={i} style={{ ...S.card, flex:1, padding:'18px 20px' }}>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'8px', letterSpacing:'.5px' }}>{k.label}</div>
            <div style={{ fontSize: k.small?'18px':'26px', fontWeight:'700', color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...S.card, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border2)', fontWeight:'700', fontSize:'14px' }}>
          패키지별 집계 ({thisMonth})
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 140px',
          padding:'10px 18px', fontSize:'11px', color:'var(--text-muted)', fontWeight:'600',
          borderBottom:'1px solid var(--border2)', background:'rgba(0,0,0,.1)' }}>
          {['패키지명','예약건수','총인원','총결제금액'].map(h=><span key={h}>{h}</span>)}
        </div>
        {Object.entries(pkgMap).map(([name, v]) => (
          <div key={name} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 140px',
            padding:'13px 18px', fontSize:'13px', borderBottom:'1px solid var(--border2)', alignItems:'center' }}>
            <span style={{ fontWeight:'600' }}>{name}</span>
            <span style={{ color:'var(--accent)' }}>{v.cnt}건</span>
            <span>{v.pax}명</span>
            <span style={{ fontFamily:'DM Mono,monospace', fontWeight:'600' }}>₩{v.total.toLocaleString()}</span>
          </div>
        ))}
        {Object.keys(pkgMap).length === 0 && (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>이번달 예약 없음</div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 메인 DashboardClient
// ────────────────────────────────────────────────────────────────
export default function DashboardClient({ user, initialReservations, vendors, zones, packages }) {
  const supabase = createClientComponentClient()
  const router   = useRouter()

  const [activePage, setActivePage] = useState('dashboard')
  const [reservations, setReservations] = useState(initialReservations || [])

  // 달력 상태
  const now = new Date()
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth()+1)
  const [calSel,   setCalSel]   = useState(now.toISOString().slice(0,10))

  // 예약 모달 제어 (하위 컴포넌트로 전달)
  const [newReserveDate, setNewReserveDate] = useState(null)
  const [detailRes,      setDetailRes]      = useState(null)

  // 예약 목록 갱신
  const refreshReservations = useCallback(async () => {
    const res  = await fetch('/api/reservations')
    const data = await res.json()
    setReservations(Array.isArray(data) ? data : [])
  }, [])

  // ── 로그아웃 ──────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // ── 달력 이동 ─────────────────────────────────────────────────
  const changeCalMonth = (dir) => {
    let m = calMonth + dir, y = calYear
    if (m > 12) { m=1; y++ }
    if (m < 1)  { m=12; y-- }
    setCalMonth(m); setCalYear(y)
  }

  // ── KPI ──────────────────────────────────────────────────────
  const mStr  = `${calYear}-${String(calMonth).padStart(2,'0')}`
  const mRes  = reservations.filter(r => r.date?.startsWith(mStr) && r.type!=='cancelled')
  const mTotal = mRes.reduce((s,r) => s+(r.total||0), 0)
  const waitVC = reservations.filter(r =>
    r.type==='confirmed' && !r._allVendorOk
  ).length

  // ── 사이드바 네비 ─────────────────────────────────────────────
  const navItems = [
    { section:'메인' },
    { id:'dashboard',     label:'대시보드',       icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
    { id:'reservations',  label:'예약 관리',       icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
      badge: reservations.filter(r=>r.type==='confirmed').length, badgeGreen:true },
    { id:'timetable',     label:'타임테이블',      icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
    { section:'정산' },
    { id:'settle-detail', label:'업체별 정산내역', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { id:'settle-summary',label:'정산 요약',       icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
    { id:'biz',           label:'사업비 관리',     icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
    { section:'마스터' },
    { id:'master',        label:'기준 정보',       icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> },
    { id:'search',        label:'상세 조회',       icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
  ]

  const pageTitles = {
    dashboard:'대시보드', reservations:'예약 관리', timetable:'타임테이블',
    'settle-detail':'업체별 정산내역', 'settle-summary':'정산 요약',
    biz:'사업비 관리', master:'기준 정보', search:'상세 조회',
  }

  // ── 대시보드 신규 예약 열기 ──────────────────────────────────
  const openNewReserveOnDate = (ds) => {
    setNewReserveDate(ds)
    setActivePage('reservations')
  }

  const openResDetail = (r) => {
    setDetailRes(r)
    setActivePage('reservations')
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--navy)' }}>

      {/* ═══ 사이드바 ══════════════════════════════════════════ */}
      <nav style={{ width:'var(--sidebar-w)', minHeight:'100vh', background:'var(--navy2)',
        borderRight:'1px solid var(--border2)', display:'flex', flexDirection:'column',
        position:'fixed', left:0, top:0, bottom:0, zIndex:100 }}>

        <div style={{ height:'var(--header-h)', display:'flex', alignItems:'center', gap:'10px',
          padding:'0 18px', borderBottom:'1px solid var(--border2)', flexShrink:0 }}>
          <div style={{ width:'28px', height:'28px', borderRadius:'7px', background:'var(--accent)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--navy)">
              <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
            </svg>
          </div>
          <span style={{ fontSize:'13px', fontWeight:'700' }}>체험예약관리</span>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {navItems.map((item, i) => {
            if (item.section) return (
              <div key={i} style={{ padding:'14px 10px 6px', fontSize:'10px', fontWeight:'600',
                color:'var(--text-muted)', letterSpacing:'1px', textTransform:'uppercase' }}>
                {item.section}
              </div>
            )
            const isActive = activePage === item.id
            return (
              <div key={item.id} onClick={() => setActivePage(item.id)}
                style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px',
                  borderRadius:'8px', margin:'0 8px 2px', cursor:'pointer', fontSize:'13px',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(78,205,196,0.12)' : 'transparent',
                  borderLeft: isActive ? 'none' : 'none',
                  position:'relative', transition:'all .15s' }}
                onMouseEnter={e => { if(!isActive) e.currentTarget.style.background='rgba(78,205,196,.08)'; if(!isActive) e.currentTarget.style.color='var(--text-primary)' }}
                onMouseLeave={e => { if(!isActive) e.currentTarget.style.background='transparent'; if(!isActive) e.currentTarget.style.color='var(--text-secondary)' }}
              >
                {isActive && <div style={{ position:'absolute', left:'-8px', top:'50%', transform:'translateY(-50%)',
                  width:'3px', height:'20px', background:'var(--accent)', borderRadius:'0 2px 2px 0' }}/>}
                <span style={{ opacity: isActive?1:.7, flexShrink:0 }}>{item.icon}</span>
                <span style={{ flex:1 }}>{item.label}</span>
                {item.badge > 0 && (
                  <span style={{ background: item.badgeGreen?'var(--accent)':'var(--red)',
                    color: item.badgeGreen?'var(--navy)':'#fff',
                    fontSize:'10px', fontWeight:'700', padding:'1px 6px', borderRadius:'10px' }}>
                    {item.badge}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding:'12px 8px', borderTop:'1px solid var(--border2)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'8px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'var(--accent)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'13px', fontWeight:'700', color:'var(--navy)', flexShrink:0 }}>
              {(user.email||'관')[0].toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'12px', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user.email}
              </div>
              <div style={{ fontSize:'10px', color:'var(--text-muted)' }}>운영팀</div>
            </div>
            <button onClick={handleLogout} title="로그아웃"
              style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ 메인 영역 ════════════════════════════════════════ */}
      <div style={{ marginLeft:'var(--sidebar-w)', flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }}>

        {/* 상단 바 */}
        <div style={{ height:'var(--header-h)', display:'flex', alignItems:'center',
          justifyContent:'space-between', padding:'0 24px',
          borderBottom:'1px solid var(--border2)', background:'var(--navy)',
          position:'sticky', top:0, zIndex:50, flexShrink:0 }}>
          <div style={{ fontSize:'15px', fontWeight:'700' }}>{pageTitles[activePage]}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'var(--text-muted)' }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--green)' }}/>연결됨
            </div>
            <button onClick={() => { setNewReserveDate(calSel||todayStr()); setActivePage('reservations') }}
              style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              예약 등록
            </button>
          </div>
        </div>

        {/* 콘텐츠 */}
        <div style={{ flex:1, padding:'24px', overflow:'auto' }}>

          {/* ── 대시보드 ── */}
          {activePage === 'dashboard' && (
            <div>
              {/* KPI 카드 */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px', marginBottom:'24px' }}>
                {[
                  { label:`${calYear}년 ${calMonth}월 예약`, value:mRes.length+'건', color:'var(--accent)' },
                  { label:`${calYear}년 ${calMonth}월 매출`, value:'₩'+mTotal.toLocaleString(), color:'var(--text-primary)', small:true },
                  { label:'전체 예약', value:reservations.filter(r=>r.type!=='cancelled').length+'건', color:'var(--amber)' },
                  { label:'대기중 예약', value:reservations.filter(r=>r.type==='pending').length+'건', color:'var(--red)' },
                ].map((k,i) => (
                  <div key={i} style={{ ...S.card, padding:'18px 20px' }}>
                    <div style={{ fontSize:'11px', color:'var(--text-muted)', letterSpacing:'.5px', marginBottom:'8px' }}>{k.label}</div>
                    <div style={{ fontSize:k.small?'18px':'26px', fontWeight:'700', letterSpacing:'-1px', color:k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* 달력 + 예약 패널 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                    <div style={{ fontSize:'14px', fontWeight:'700' }}>{calYear}년 {calMonth}월</div>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={() => changeCalMonth(-1)} style={{ width:'28px', height:'28px', borderRadius:'6px',
                        border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)',
                        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
                      <button onClick={() => changeCalMonth(1)} style={{ width:'28px', height:'28px', borderRadius:'6px',
                        border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)',
                        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
                    </div>
                  </div>
                  <div style={{ ...S.card }}>
                    <Calendar
                      reservations={reservations}
                      packages={packages}
                      year={calYear} month={calMonth}
                      selectedDate={calSel}
                      onSelect={ds => setCalSel(ds)}
                      onDblClick={ds => openNewReserveOnDate(ds)}
                    />
                    <div style={{ padding:'8px 16px 12px', fontSize:'11px', color:'var(--text-muted)',
                      borderTop:'1px solid var(--border2)', display:'flex', gap:'12px', flexWrap:'wrap' }}>
                      <span style={{ color:'var(--accent)' }}>예약N건</span>
                      <span style={{ color:'var(--amber)' }}>⚠ 인원초과</span>
                      <span style={{ fontSize:'10px' }}>더블클릭=신규예약</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                    <div style={{ fontSize:'14px', fontWeight:'700' }}>
                      {calSel ? (() => { const d=new Date(calSel); return `${d.getMonth()+1}월 ${d.getDate()}일 예약` })() : '날짜 선택'}
                    </div>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={() => openNewReserveOnDate(calSel||todayStr())}
                        style={{ ...S.btnPrimary, height:'28px', fontSize:'11px', padding:'0 10px' }}>+ 신규</button>
                      <button onClick={() => setActivePage('reservations')} style={{ ...S.btnOutline, height:'28px', fontSize:'11px' }}>전체 보기</button>
                    </div>
                  </div>
                  <DashDatePanel
                    dateStr={calSel}
                    reservations={reservations}
                    packages={packages}
                    vendors={vendors}
                    onNewReserve={openNewReserveOnDate}
                    onOpenDetail={openResDetail}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── 예약 관리 ── */}
          {activePage === 'reservations' && (
            <ReservationsPage
              packages={packages}
              zones={zones}
              vendors={vendors}
              initialNewDate={newReserveDate}
              initialDetailRes={detailRes}
              onClearNew={() => { setNewReserveDate(null); setDetailRes(null) }}
              onReservationChange={refreshReservations}
            />
          )}

          {/* ── 타임테이블 ── */}
          {activePage === 'timetable' && (
            <TimetablePage vendors={vendors} reservations={reservations} zones={zones} packages={packages} />
          )}

          {/* ── 업체별 정산내역 ── */}
          {activePage === 'settle-detail' && (
            <SettleDetailPage reservations={reservations} packages={packages} vendors={vendors} />
          )}

          {/* ── 정산 요약 ── */}
          {activePage === 'settle-summary' && (
            <SettleSummaryPage reservations={reservations} packages={packages} vendors={vendors} />
          )}

          {/* ── 사업비 관리 ── */}
          {activePage === 'biz' && (
            <BizPage reservations={reservations} />
          )}

          {/* ── 기준 정보 ── */}
          {activePage === 'master' && (
            <MasterPage />
          )}

          {/* ── 상세 조회 ── */}
          {activePage === 'search' && (
            <SearchPage reservations={reservations} />
          )}

        </div>
      </div>
    </div>
  )
}
