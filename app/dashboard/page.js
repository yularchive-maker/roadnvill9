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
  const [lodgeConfirms,  setLodgeConfirms]  = useState([])
  const [pickups,        setPickups]        = useState([])
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [openResNo, setOpenResNo] = useState('')
  const [noticePopup,  setNoticePopup]  = useState(null)  // { date, specials, notices }
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [resR, pkgR, notR, vcR, lcR, pkR] = await Promise.all([
      supabase.from('reservations').select('*').order('date', { ascending: false }),
      supabase.from('packages').select('*, package_programs(vendor_key, prog_name, vendors(key,name,color))'),
      supabase.from('notices').select('*').order('date'),
      supabase.from('vendor_confirms').select('*'),
      supabase.from('lodge_confirms').select('*'),
      supabase.from('reservation_pickup').select('*, drivers(name)'),
    ])
    setReservations(resR.data || [])
    setPackages(pkgR.data || [])
    setNotices(notR.data || [])
    setVendorConfirms(vcR.data || [])
    setLodgeConfirms(lcR.data || [])
    setPickups(pkR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── KPI 계산
  const now       = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const thisMonthRes = reservations.filter(r => r.date?.startsWith(thisMonth) && r.type !== 'cancelled')
  const thisMonthSales = thisMonthRes.reduce((s,r) => s + (r.total||0), 0)
  const unsettledCount = reservations.filter(r => r.settle_status === 'unsettled' && r.type !== 'cancelled').length
  const waitVendorCount = vendorConfirms.filter(v => v.status === 'wait').length

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
    return Object.entries(byPkg).some(([name, pax]) => pkgLimitMap[name] && pax >= pkgLimitMap[name])
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

  function getPkg(r) {
    return packages.find(p => p.name === (r.package_name || r.pkg))
  }

  function getConfirmStatus(r) {
    const pkg = getPkg(r)
    const vendorKeys = [...new Set((pkg?.package_programs || []).map(p => p.vendor_key).filter(Boolean))]
    if (!vendorKeys.length) return 'none'
    const rows = vendorConfirms.filter(v => v.reservation_no === r.no && vendorKeys.includes(v.vendor_key))
    const okValues = ['ok', 'confirmed', '가능', 'done']
    const okCount = rows.filter(v => okValues.includes(v.status)).length
    if (okCount === vendorKeys.length) return 'confirmed'
    if (okCount > 0 || rows.length > 0) return 'partial'
    return 'wait'
  }

  function getLodges(no) {
    return lodgeConfirms.filter(l => l.reservation_no === no)
  }

  function getPickups(no) {
    return pickups.filter(p => p.reservation_no === no)
  }

  function infoItem(label, value) {
    return (
      <div style={{ padding:'6px 10px', background:'var(--navy2)', borderRadius:'6px' }}>
        <div style={{ fontSize:'10px', color:'var(--text-muted)', marginBottom:'2px' }}>{label}</div>
        <div style={{ fontSize:'12px', fontWeight:500 }}>{value || '-'}</div>
      </div>
    )
  }

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
          <div className="kpi-sub">정산 전 예약 건수</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">업체 확인 대기</div>
          <div className="kpi-value" style={{color: waitVendorCount > 0 ? 'var(--red)' : 'var(--green)'}}>{waitVendorCount}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
          <div className="kpi-sub">응답 대기 중</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'16px', marginBottom:'24px' }}>
        {/* 달력 */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <span style={{ fontSize:'14px', fontWeight:700 }}>{calYear}년 {calMonth}월</span>
            <div style={{ display:'flex', gap:'6px' }}>
              <button className="cal-nav-btn" onClick={() => { if(calMonth===1){setCalYear(y=>y-1);setCalMonth(12)}else setCalMonth(m=>m-1) }}>‹</button>
              <button className="cal-nav-btn" onClick={() => { if(calMonth===12){setCalYear(y=>y+1);setCalMonth(1)}else setCalMonth(m=>m+1) }}>›</button>
            </div>
          </div>
          <div className="cal-card">
            <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'10px', fontSize:'11px', color:'var(--text-muted)', flexWrap:'wrap' }}>
              <span><span style={{ color:'var(--accent)', fontWeight:600 }}>예약n건</span> 건수</span>
              <span><span style={{ color:'var(--text-muted)', fontWeight:600 }}>n명</span> 총인원</span>
              <span><span style={{ color:'var(--amber)', fontWeight:600 }}>⚠ n명</span> 임계초과</span>
              <span style={{ display:'flex', alignItems:'center', gap:'4px' }}><span className="cal-notice-dot" /> 알림</span>
              <span style={{ color:'var(--amber)', fontWeight:600 }}>특일</span>
              <span style={{ marginLeft:'auto', fontSize:'10px', color:'var(--text-muted)' }}>인원 기준은 기준정보 &gt; 패키지에서 설정</span>
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
                    style={over ? { boxShadow:'inset 0 0 0 2px rgba(247,201,72,0.6)' } : null}
                    onClick={() => { setSelectedDate(ds); setOpenResNo('') }}
                    onDoubleClick={() => router.push(`/dashboard/reservations?new=1&date=${ds}&from=dashboard`)}
                  >
                    {special ? <div className="cal-special">{special}</div> : <div style={{ height:'12px' }} />}
                    <div className="cal-day-num">{c.day}</div>
                    {cnt > 0 ? <div className="cal-res-count">예약{cnt}건</div> : <div style={{ height:'13px' }} />}
                    {pax > 0 ? (
                      <div style={{ fontSize:'9px', fontWeight:700, marginBottom:'2px', color: over ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {over ? '⚠ ' : ''}{pax}명
                      </div>
                    ) : <div style={{ height:'13px' }} />}
                    <div
                      className="cal-notice-dots"
                      onClick={e => { e.stopPropagation(); openNoticePopup(ds) }}
                    >
                      {ntcList.slice(0,5).map((_,j) => <div key={j} className="cal-notice-dot"/>)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 선택일 예약 목록 */}
        <div>
          <div className="section-header" style={{ marginBottom:'10px' }}>
            <div className="section-title" style={{ fontSize:'13px' }}>
              {selectedDate} 예약 목록
              <span style={{ fontSize:'12px', fontWeight:400, color:'var(--text-muted)', marginLeft:'8px' }}>{selRes.length}건</span>
            </div>
            <button className="btn-primary" style={{ fontSize:'12px', padding:'5px 10px' }} onClick={() => router.push(`/dashboard/reservations?new=1&date=${selectedDate}&from=dashboard`)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              등록
            </button>
          </div>
          {selRes.length === 0 ? (
            <div className="list-card" style={{ padding:'20px', textAlign:'center' }}>
              <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'10px' }}>해당 날짜 예약이 없습니다.</div>
              <button className="btn-primary" style={{ height:'28px', fontSize:'11px', padding:'0 12px' }} onClick={() => router.push(`/dashboard/reservations?new=1&date=${selectedDate}&from=dashboard`)}>
                + 예약 등록하기
              </button>
            </div>
          ) : (
            <div className="list-card" style={{ overflow:'hidden', maxHeight:'520px', overflowY:'auto' }}>
              {selRes.map(r => {
                const conf = getConfirmStatus(r)
                const dot = conf === 'confirmed' ? 'var(--green)' : conf === 'partial' ? 'var(--amber)' : 'var(--text-muted)'
                const lodges = getLodges(r.no)
                const pickupRows = getPickups(r.no)
                const hasPickup = pickupRows.length > 0 || (r.pickup_fee || 0) > 0
                const isOpen = openResNo === r.no
                return (
                  <div key={r.no}>
                    <div
                      className={`dash-res-item${isOpen ? ' active' : ''}`}
                      onClick={() => setOpenResNo(isOpen ? '' : r.no)}
                    >
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
                          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:dot, flexShrink:0 }} />
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:'13px' }}>
                              {r.customer}
                              <span style={{ fontWeight:400, fontSize:'11px', color:'var(--text-muted)', marginLeft:'4px' }}>{r.pax}명</span>
                            </div>
                            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
                              {r.package_name || r.pkg || '-'} · <span className={`badge ${r.type}`} style={{ fontSize:'10px', padding:'1px 6px' }}>{STATUS_LABEL[r.type]}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
                          {hasPickup && <span style={{ fontSize:'10px', background:'rgba(184,184,255,.15)', color:'#B8B8FF', border:'1px solid rgba(184,184,255,.3)', borderRadius:'4px', padding:'2px 6px' }}>픽업</span>}
                          {lodges.length > 0
                            ? <span style={{ fontSize:'10px', background:'rgba(78,205,196,.1)', color:'var(--accent)', border:'1px solid rgba(78,205,196,.25)', borderRadius:'4px', padding:'2px 6px' }}>{lodges[0].lodge_name || '숙소'}</span>
                            : <span style={{ fontSize:'10px', color:'var(--text-muted)', border:'1px dashed var(--border2)', borderRadius:'4px', padding:'2px 6px' }}>숙소미정</span>}
                          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{isOpen ? '▴' : '▾'}</span>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="dash-res-card">
                        <div style={{ padding:'12px 16px 14px', background:'var(--navy3)', borderTop:'1px solid var(--border2)' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginBottom:'10px' }}>
                            {infoItem('고객명', r.customer)}
                            {infoItem('패키지', r.package_name || r.pkg)}
                            {infoItem('인원', `${r.pax || 0}명`)}
                            {infoItem('연락처', r.tel)}
                            {infoItem('날짜', `${r.date}${r.end_date && r.end_date !== r.date ? ` ~ ${r.end_date.slice(5)}` : ''}`)}
                            {infoItem('결제처', r.payto)}
                          </div>
                          <div style={{ marginBottom:'8px', padding:'9px 12px', background:'var(--navy2)', borderRadius:'8px', border:`1px solid ${lodges.some(l => l.checked) ? 'rgba(78,205,196,.25)' : 'var(--border2)'}` }}>
                            <div style={{ fontSize:'10px', color:'var(--text-muted)', letterSpacing:'.5px', marginBottom:'4px' }}>숙소</div>
                            {lodges.length > 0 ? lodges.map(l => (
                              <div key={l.id} style={{ fontSize:'13px', fontWeight:600, marginTop:'3px' }}>
                                {l.lodge_name || '-'} <span style={{ fontWeight:400, color:'var(--text-secondary)' }}>· {l.room_name || '객실미정'}</span>
                                {l.room_price ? <span style={{ fontWeight:400, color:'var(--accent)', fontSize:'12px', marginLeft:'6px' }}>{fmtMoney(l.room_price)}</span> : null}
                              </div>
                            )) : <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>미배정 (숙소 확인 필요)</div>}
                          </div>
                          <div style={{ marginBottom:'10px', padding:'9px 12px', background:'var(--navy2)', borderRadius:'8px', border:`1px solid ${hasPickup ? 'rgba(184,184,255,.25)' : 'var(--border2)'}` }}>
                            <div style={{ fontSize:'10px', color:'var(--text-muted)', letterSpacing:'.5px', marginBottom:'4px' }}>픽업</div>
                            {hasPickup ? (
                              <div>
                                <div style={{ fontSize:'13px', fontWeight:600 }}>픽업/드랍 있음 <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:'12px' }}>· {fmtMoney(r.pickup_fee || pickupRows.reduce((s,p)=>s+(p.pickup_fee||0),0))}</span></div>
                                {pickupRows.map(p => <div key={p.id} style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'3px' }}>{p.pickup_type} · {p.drivers?.name || '수행자 미정'}</div>)}
                              </div>
                            ) : <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>픽업 없음</div>}
                          </div>
                          <div style={{ display:'flex', gap:'6px' }}>
                            <button className="btn-outline" style={{ flex:1, height:'30px', fontSize:'12px' }} onClick={e => { e.stopPropagation(); router.push(`/dashboard/reservations?no=${r.no}&from=dashboard`) }}>전체 상세</button>
                            <button className="btn-primary" style={{ flex:1, height:'30px', fontSize:'12px' }} onClick={e => { e.stopPropagation(); router.push(`/dashboard/reservations?no=${r.no}&from=dashboard`) }}>수정</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ padding:'7px 14px', fontSize:'11px', color:'var(--text-muted)', textAlign:'right', borderTop:'1px solid var(--border2)' }}>
                총 {selRes.length}건 · 클릭하면 상세 보기
              </div>
            </div>
          )}
          <div style={{ marginTop:'12px', padding:'10px 14px', background:'var(--navy3)', borderRadius:'8px', border:'1px dashed var(--border2)', textAlign:'center', fontSize:'11px', color:'var(--text-muted)' }}>
            달력 날짜를 클릭하면 해당 날짜 예약 조회 · 더블클릭하면 신규 예약 등록
          </div>
        </div>
      </div>

      {/* 예약 상태 현황 — 페이지 하단 */}
      <div style={{ marginTop:'8px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'10px' }}>예약 상태 현황</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px' }}>
          {Object.entries(byStatus).map(([type, count]) => (
            <div
              key={type}
              className="card"
              style={{ padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
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
