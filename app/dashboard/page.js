'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR = { confirmed:'var(--green)', pending:'var(--amber)', cancelled:'var(--red)', consult:'var(--accent)' }
const DAYS = ['일','월','화','수','목','금','토']

function todayStr() { return new Date().toISOString().slice(0,10) }

function fmtMoney(n) {
  if (!n && n !== 0) return '-'
  return n.toLocaleString('ko-KR') + '원'
}

export default function DashboardPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState([])
  const [packages,     setPackages]     = useState([])
  const [notices,      setNotices]      = useState([])
  const [vendorConfirms, setVendorConfirms] = useState([])
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [noticePopup,  setNoticePopup]  = useState(null)  // { date, specials, notices }
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [resR, pkgR, notR, vcR] = await Promise.all([
      supabase.from('reservations').select('*').order('date', { ascending: false }),
      supabase.from('packages').select('*'),
      supabase.from('notices').select('*').order('date'),
      supabase.from('vendor_confirms').select('*').eq('status','wait'),
    ])
    setReservations(resR.data || [])
    setPackages(pkgR.data || [])
    setNotices(notR.data || [])
    setVendorConfirms(vcR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── KPI 계산
  const now       = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const thisMonthRes = reservations.filter(r => r.date?.startsWith(thisMonth) && r.type !== 'cancelled')
  const thisMonthSales = thisMonthRes.reduce((s,r) => s + (r.total||0), 0)
  const unsettledCount = reservations.filter(r => r.settle_status === 'unsettled' && r.type !== 'cancelled').length
  const waitVendorCount = vendorConfirms.length

  // ── 달력 데이터
  const first    = new Date(calYear, calMonth-1, 1).getDay()
  const lastDay  = new Date(calYear, calMonth, 0).getDate()
  const prevLast = new Date(calYear, calMonth-1, 0).getDate()

  function dateStr(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

  function getDateRes(ds) { return reservations.filter(r => r.date === ds && r.type !== 'cancelled') }
  function getDatePax(ds) { return getDateRes(ds).reduce((s,r) => s + (r.pax||0), 0) }

  // pax_limit 초과 여부
  const pkgLimitMap = {}
  packages.forEach(p => { if (p.pax_limit > 0) pkgLimitMap[p.name] = p.pax_limit })

  function isOverLimit(ds) {
    const rList = getDateRes(ds)
    const byPkg = {}
    rList.forEach(r => {
      if (!byPkg[r.package_name]) byPkg[r.package_name] = 0
      byPkg[r.package_name] += (r.pax || 0)
    })
    return Object.entries(byPkg).some(([name, pax]) => pkgLimitMap[name] && pax > pkgLimitMap[name])
  }

  function getDateNotices(ds) { return notices.filter(n => n.date === ds) }

  function getDateSpecial(ds) {
    const ns = getDateNotices(ds)
    const specials = [...new Set(ns.map(n => n.special).filter(Boolean))]
    return specials[0] || ''
  }

  // 달력 셀 생성
  const cells = []
  for (let i = 0; i < first; i++) {
    cells.push({ day: prevLast - first + i + 1, cur: false, ds: null })
  }
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ day: d, cur: true, ds: dateStr(calYear, calMonth, d) })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - lastDay - first + 1, cur: false, ds: null })
  }

  // 선택 날짜 예약 목록
  const selRes = reservations.filter(r => r.date === selectedDate)

  // 상태별 현황
  const byStatus = { confirmed:0, pending:0, cancelled:0, consult:0 }
  reservations.forEach(r => { if (byStatus[r.type] !== undefined) byStatus[r.type]++ })

  function openNoticePopup(ds) {
    const ns = getDateNotices(ds)
    if (!ns.length) return
    const specials = [...new Set(ns.map(n => n.special).filter(Boolean))]
    setNoticePopup({ date: ds, special: specials[0] || '', notices: ns })
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'300px', color:'var(--text-muted)' }}>
      로딩 중…
    </div>
  )

  return (
    <div>
      {/* KPI */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">이번달 예약</div>
          <div className="kpi-value">{thisMonthRes.length}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
          <div className="kpi-sub">{thisMonth} 기준</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">이번달 매출</div>
          <div className="kpi-value" style={{fontSize:'20px'}}>{fmtMoney(thisMonthSales)}</div>
          <div className="kpi-sub">취소 제외</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">미정산 (체험)</div>
          <div className="kpi-value" style={{color: unsettledCount > 0 ? 'var(--amber)' : 'var(--green)'}}>{unsettledCount}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
          <div className="kpi-sub">settle_status = unsettled</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">업체 확인 대기</div>
          <div className="kpi-value" style={{color: waitVendorCount > 0 ? 'var(--red)' : 'var(--green)'}}>{waitVendorCount}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
          <div className="kpi-sub">응답 대기 중</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'16px', marginBottom:'24px' }}>
        {/* 달력 */}
        <div className="cal-card">
          {/* 달력 헤더 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <span style={{ fontSize:'14px', fontWeight:700 }}>{calYear}년 {calMonth}월</span>
            <div style={{ display:'flex', gap:'6px' }}>
              <button className="cal-nav-btn" onClick={() => { if(calMonth===1){setCalYear(y=>y-1);setCalMonth(12)}else setCalMonth(m=>m-1) }}>‹</button>
              <button className="cal-nav-btn" onClick={() => { if(calMonth===12){setCalYear(y=>y+1);setCalMonth(1)}else setCalMonth(m=>m+1) }}>›</button>
            </div>
          </div>
          <div className="cal-grid">
            {DAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
            {cells.map((c, i) => {
              if (!c.cur) return (
                <div key={i} className="cal-day other-month">
                  <div className="cal-day-num">{c.day}</div>
                </div>
              )
              const ds       = c.ds
              const today    = todayStr()
              const cnt      = getDateRes(ds).length
              const pax      = getDatePax(ds)
              const over     = isOverLimit(ds)
              const special  = getDateSpecial(ds)
              const ntcList  = getDateNotices(ds)
              const isToday  = ds === today
              const isSel    = ds === selectedDate
              return (
                <div
                  key={i}
                  className={`cal-day${isToday?' today':''}${isSel?' cal-selected':''}`}
                  onClick={() => setSelectedDate(ds)}
                >
                  <div className="cal-day-num">{c.day}</div>
                  {special && <div className="cal-special">{special}</div>}
                  {cnt > 0 && (
                    <div className="cal-res-count">
                      {over && <span style={{color:'var(--amber)'}}>⚠ </span>}
                      {cnt}건 / {pax}명
                    </div>
                  )}
                  {ntcList.length > 0 && (
                    <div
                      className="cal-notice-dots"
                      onClick={e => { e.stopPropagation(); openNoticePopup(ds) }}
                    >
                      {ntcList.slice(0,4).map((_,j) => <div key={j} className="cal-notice-dot"/>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 상태별 현황 */}
        <div>
          <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'10px' }}>예약 상태 현황</div>
          {Object.entries(byStatus).map(([type, count]) => (
            <div
              key={type}
              className="card"
              style={{ padding:'14px 16px', marginBottom:'8px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
              onClick={() => router.push(`/dashboard/reservations?type=${type}`)}
            >
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: STATUS_COLOR[type] }}/>
                <span style={{ fontSize:'13px' }}>{STATUS_LABEL[type]}</span>
              </div>
              <span style={{ fontFamily:'DM Mono,monospace', fontSize:'15px', fontWeight:700, color: STATUS_COLOR[type] }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 선택일 예약 목록 */}
      <div>
        <div className="section-header">
          <div className="section-title">
            {selectedDate} 예약 목록
            <span style={{ fontSize:'12px', fontWeight:400, color:'var(--text-muted)', marginLeft:'8px' }}>{selRes.length}건</span>
          </div>
          <button className="btn-primary" onClick={() => router.push(`/dashboard/reservations?new=1&date=${selectedDate}`)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            예약 등록
          </button>
        </div>

        {selRes.length === 0 ? (
          <div className="card" style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>
            해당 날짜 예약 없음
          </div>
        ) : (
          <div className="list-card">
            <div className="list-header" style={{ gridTemplateColumns:'60px 1fr 80px 60px 80px 100px 80px' }}>
              <span>NO</span><span>고객명 / 패키지</span><span>구분</span><span>인원</span><span>총금액</span><span>결제처</span><span>정산</span>
            </div>
            {selRes.map(r => (
              <div
                key={r.no}
                className="list-row"
                style={{ gridTemplateColumns:'60px 1fr 80px 60px 80px 100px 80px' }}
                onClick={() => router.push(`/dashboard/reservations?no=${r.no}`)}
              >
                <span className="no-col">#{r.no}</span>
                <div>
                  <div style={{ fontWeight:500 }}>{r.customer}</div>
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px' }}>{r.package_name}</div>
                </div>
                <span><span className={`badge ${r.type}`}>{STATUS_LABEL[r.type]}</span></span>
                <span style={{ fontSize:'13px' }}>{r.pax}명</span>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:'12px' }}>{(r.total||0).toLocaleString()}</span>
                <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{r.payto||'-'}</span>
                <span style={{ fontSize:'11px', color: r.settle_status==='settled' ? 'var(--green)' : 'var(--amber)' }}>
                  {r.settle_status==='settled' ? '완료' : '미정산'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NOTICE 팝업 */}
      {noticePopup && (
        <div className="notice-popup open" onClick={e => { if(e.target===e.currentTarget) setNoticePopup(null) }}>
          <div className="notice-popup-box">
            <div className="notice-popup-header">
              <div>
                <div style={{ fontSize:'14px', fontWeight:700 }}>{noticePopup.date}</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>{noticePopup.notices.length}개 알림</div>
              </div>
              <button className="close-btn" onClick={() => setNoticePopup(null)}>✕</button>
            </div>
            <div style={{ padding:'16px 20px' }}>
              {noticePopup.special && (
                <div className="notice-special-banner">
                  <span>⭐</span><span>{noticePopup.special}</span>
                </div>
              )}
              {noticePopup.notices.map((n, i) => (
                <div key={n.id} className="notice-item">
                  <div className="notice-item-num">{i+1}</div>
                  <div className="notice-item-content">{n.content}</div>
                </div>
              ))}
            </div>
            <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border2)', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button className="btn-outline" onClick={() => setNoticePopup(null)}>닫기</button>
              <button className="btn-primary" onClick={() => { setNoticePopup(null); router.push('/dashboard/notice') }}>알림 관리</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
