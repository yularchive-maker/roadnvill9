'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR = { confirmed:'var(--green)', pending:'var(--amber)', cancelled:'var(--red)', consult:'var(--accent)' }
const DAYS = ['일','월','화','수','목','금','토']

function todayStr() { return new Date().toISOString().slice(0,10) }
function addDaysStr(baseDate, days) {
  const d = new Date(baseDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtMoney(n) {
  if (!n && n !== 0) return '-'
  return n.toLocaleString('ko-KR') + '원'
}

function componentSummaryForReservation(reservation, usages, packages = [], zoneList = []) {
  const zoneNameMap = Object.fromEntries(zoneList.map(zone => [zone.code, zone.name]))
  const rows = usages.filter(row =>
    row.reservation_no === reservation.no &&
    row.usage_type === 'product_operation' &&
    row.is_deleted !== true
  )
  if (!rows.length) {
    const zoneLabel = reservation.zone_code ? (zoneNameMap[reservation.zone_code] || reservation.zone_code) : '-'
    const packageLabel = reservation.package_name || reservation.pkg || '-'
    const maxPeople = Number(reservation.pax) || 0
    return {
      zoneCount: reservation.zone_code ? 1 : 0,
      packageCount: reservation.package_name ? 1 : 0,
      maxPeople,
      zoneLabel,
      zoneTitle: zoneLabel,
      packageLabel,
      packageTitle: packageLabel,
    }
  }
  const zoneCodes = new Set()
  const zoneNames = new Set()
  const packageNames = new Set()
  rows.forEach(row => {
    const pkg = packages.find(p => String(p.id) === String(row.package_id)) || packages.find(p => p.name === row.package_name)
    const packageZones = (pkg?.package_zones || [])
      .filter(zone => zone && zone.is_deleted !== true)
      .map(zone => zone.zone_code)
      .filter(Boolean)
    if (row.item_name || row.package_name) packageNames.add(row.item_name || row.package_name)
    if (Array.isArray(row.zone_codes) && row.zone_codes.length) {
      row.zone_codes.filter(Boolean).forEach(code => {
        zoneCodes.add(code)
        zoneNames.add(zoneNameMap[code] || code)
      })
    } else if (packageZones.length) {
      packageZones.forEach(code => {
        zoneCodes.add(code)
        zoneNames.add(zoneNameMap[code] || code)
      })
    } else if (row.zone_code || row.zone_name) {
      const code = row.zone_code || row.zone_name
      zoneCodes.add(code)
      zoneNames.add(row.zone_name || zoneNameMap[code] || code)
    }
  })
  const zoneNameList = [...zoneNames]
  const packageNameList = [...packageNames]
  const maxPeople = rows.length ? Math.max(...rows.map(row => Number(row.people_count) || 0), 0) : 0
  return {
    zoneCount: zoneCodes.size,
    packageCount: rows.length,
    maxPeople,
    zoneLabel: zoneNameList.length <= 2 ? zoneNameList.join(' · ') : `${zoneNameList.length}구역`,
    zoneTitle: zoneNameList.join(' / '),
    packageLabel: packageNameList.length === 1 ? packageNameList[0] : `${packageNameList.length}개 상품 구성`,
    packageTitle: packageNameList.join(' / '),
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState([])
  const [packages,     setPackages]     = useState([])
  const [zones,        setZones]        = useState([])
  const [notices,      setNotices]      = useState([])
  const [vendorConfirms, setVendorConfirms] = useState([])
  const [lodgeConfirms,  setLodgeConfirms]  = useState([])
  const [pickups,        setPickups]        = useState([])
  const [budgetUsages,   setBudgetUsages]   = useState([])
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [openResNo, setOpenResNo] = useState('')
  const [noticePopup,  setNoticePopup]  = useState(null)  // { date, specials, notices }
  const [limitAlertSending, setLimitAlertSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [resR, pkgR, zoneR, notR, vcR, lcR, pkR, usageR] = await Promise.all([
      supabase.from('reservations').select('*').order('date', { ascending: false }),
      supabase.from('packages').select('*, package_zones(*), package_programs(vendor_key, prog_name, vendors(key,name,color))'),
      supabase.from('zones').select('*').order('code'),
      supabase.from('notices').select('*').order('date'),
      supabase.from('vendor_confirms').select('*'),
      supabase.from('lodge_confirms').select('*'),
      supabase.from('reservation_pickup').select('*, drivers(name)'),
      supabase.from('reservation_budget_usages').select('reservation_no,usage_type,zone_code,zone_codes,zone_name,package_id,package_name,item_name,sale_type,people_count,is_deleted').or('is_deleted.is.null,is_deleted.eq.false'),
    ])
    setReservations(resR.data || [])
    setPackages(pkgR.data || [])
    setZones(zoneR.data || [])
    setNotices(notR.data || [])
    setVendorConfirms(vcR.data || [])
    setLodgeConfirms(lcR.data || [])
    setPickups(pkR.data || [])
    setBudgetUsages(usageR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── KPI 계산: 달력에서 보고 있는 년/월 기준
  const selectedMonth = `${calYear}-${String(calMonth).padStart(2,'0')}`
  const selectedMonthRes = reservations.filter(r => r.date?.startsWith(selectedMonth) && r.type !== 'cancelled' && r.is_deleted !== true)
  const selectedMonthNos = new Set(selectedMonthRes.map(r => r.no))
  const selectedMonthSales = selectedMonthRes.reduce((s,r) => s + (r.total||0), 0)
  const unsettledCount = selectedMonthRes.filter(r => (r.settle_status || 'unsettled') === 'unsettled').length
  const waitVendorCount = vendorConfirms.filter(v => {
    if (v.is_deleted === true) return false
    const replyStatus = v.reply_status || v.status || '회신대기'
    const isWaiting = ['회신대기', 'wait', 'pending', '미회신'].includes(replyStatus)
    const inReservationMonth = selectedMonthNos.has(v.reservation_no)
    const inRequestMonth = v.request_date?.startsWith(selectedMonth)
    return isWaiting && (inReservationMonth || inRequestMonth)
  }).length

  // ── 달력 데이터
  const first    = new Date(calYear, calMonth-1, 1).getDay()
  const lastDay  = new Date(calYear, calMonth, 0).getDate()
  const prevLast = new Date(calYear, calMonth-1, 0).getDate()

  function dateStr(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

  function getDateRes(ds) { return reservations.filter(r => r.date === ds && r.type !== 'cancelled') }
  function getReservationPeople(r) {
    const summary = componentSummaryForReservation(r, budgetUsages, packages, zones)
    return Number(summary.maxPeople) || Number(r.pax) || 0
  }
  function getDatePax(ds) { return getDateRes(ds).reduce((s,r) => s + getReservationPeople(r), 0) }

  // 구성 상품별 인원 알림 기준 초과 여부
  function getDateLimitWarnings(ds) {
    const rList = getDateRes(ds)
    const reservationNos = new Set(rList.map(r => r.no))
    const byPackage = new Map()

    budgetUsages
      .filter(row =>
        reservationNos.has(row.reservation_no) &&
        row.usage_type === 'product_operation' &&
        row.is_deleted !== true
      )
      .forEach(row => {
        const pkg = packages.find(p => String(p.id) === String(row.package_id)) || packages.find(p => p.name === row.package_name || p.name === row.item_name)
        const name = row.item_name || row.package_name || pkg?.name
        if (!name) return
        const limit = Number(pkg?.pax_limit) || 0
        if (!limit) return
        const current = byPackage.get(name) || { name, people: 0, limit }
        current.people += Number(row.people_count) || 0
        current.limit = limit
        byPackage.set(name, current)
      })

    rList.forEach(r => {
      const hasComponentRows = budgetUsages.some(row =>
        row.reservation_no === r.no &&
        row.usage_type === 'product_operation' &&
        row.is_deleted !== true
      )
      if (hasComponentRows) return
      const pkg = packages.find(p => p.name === (r.package_name || r.pkg))
      const limit = Number(pkg?.pax_limit) || 0
      if (!limit) return
      const name = r.package_name || r.pkg
      const current = byPackage.get(name) || { name, people: 0, limit }
      current.people += Number(r.pax) || 0
      current.limit = limit
      byPackage.set(name, current)
    })

    return [...byPackage.values()]
      .map(item => {
        const cautionAt = Math.ceil(item.limit * 0.85)
        const level = item.people >= item.limit ? 'over' : item.people >= cautionAt ? 'caution' : 'normal'
        return { ...item, cautionAt, level }
      })
      .filter(item => item.level !== 'normal')
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'over' ? -1 : 1
        return (b.people / b.limit) - (a.people / a.limit)
      })
  }

  function isOverLimit(ds) {
    return getDateLimitWarnings(ds).some(item => item.level === 'over')
  }

  function isCautionLimit(ds) {
    return getDateLimitWarnings(ds).some(item => item.level === 'caution')
  }

  function getDateNotices(ds) {
    return notices.filter(n => n.date <= ds && (n.end_date || n.date) >= ds && n.is_deleted !== true)
  }
  function isNoticeStartOn(n, ds) {
    return n.date === ds || !getDateNotices(addDaysStr(ds, -1)).some(prev => String(prev.id) === String(n.id))
  }
  function isNoticeEndOn(n, ds) {
    const end = n.end_date || n.date
    return end === ds || !getDateNotices(addDaysStr(ds, 1)).some(next => String(next.id) === String(n.id))
  }
  function noticeTitle(n) {
    return n.title || (n.content || '').split('\n')[0] || n.special || '알림'
  }
  function noticeTimeLabel(n) {
    if (n.is_all_day || (!n.start_time && !n.end_time)) return '종일'
    if (n.start_time && n.end_time) return `${n.start_time.slice(0,5)} ~ ${n.end_time.slice(0,5)}`
    return (n.start_time || n.end_time || '').slice(0,5)
  }

  // 달력 셀 생성
  const cells = []
  const prevMonthDate = calMonth === 1
    ? { year: calYear - 1, month: 12 }
    : { year: calYear, month: calMonth - 1 }
  const nextMonthDate = calMonth === 12
    ? { year: calYear + 1, month: 1 }
    : { year: calYear, month: calMonth + 1 }
  for (let i = 0; i < first; i++) {
    const day = prevLast - first + i + 1
    cells.push({ day, cur: false, ds: dateStr(prevMonthDate.year, prevMonthDate.month, day) })
  }
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ day: d, cur: true, ds: dateStr(calYear, calMonth, d) })
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - lastDay - first + 1
    cells.push({ day, cur: false, ds: dateStr(nextMonthDate.year, nextMonthDate.month, day) })
  }

  // 선택 날짜 예약 목록
  const selRes = reservations.filter(r => r.date === selectedDate)
  const selectedDateWarnings = getDateLimitWarnings(selectedDate)

  async function sendLimitAlert() {
    if (!selectedDateWarnings.length || limitAlertSending) return
    setLimitAlertSending(true)
    try {
      const res = await fetch('/api/telegram/limit-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          reservationCount: selRes.length,
          totalPeople: getDatePax(selectedDate),
          warnings: selectedDateWarnings.map(item => ({
            name: item.name,
            people: item.people,
            limit: item.limit,
            cautionAt: item.cautionAt,
            level: item.level,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '텔레그램 알림 발송 실패')
      alert('대표님에게 텔레그램 인원 알림을 발송했습니다.')
    } catch (error) {
      alert('텔레그램 인원 알림 발송 실패: ' + error.message)
    } finally {
      setLimitAlertSending(false)
    }
  }

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
    setNoticePopup({ date: ds, notices: ns })
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'300px', color:'var(--text-muted)' }}>
      로딩 중…
    </div>
  )

  return (
    <div>
      {/* 예약 상태 현황 */}
      <div className="kpi-grid">
        {Object.entries(byStatus).map(([type, count]) => (
          <div
            key={type}
            className="kpi-card"
            style={{ cursor:'pointer' }}
            onClick={() => router.push(`/dashboard/reservations?type=${type}`)}
          >
            <div className="kpi-label">{STATUS_LABEL[type]}</div>
            <div className="kpi-value" style={{ color: STATUS_COLOR[type] }}>
              {count}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span>
            </div>
            <div className="kpi-sub">예약 상태별 현황</div>
          </div>
        ))}
      </div>

      <div className="dashboard-main-grid">
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
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', fontSize:'10px', color:'var(--text-muted)', flexWrap:'wrap' }}>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid var(--border2)',borderRadius:'999px'}}>
                <span style={{ color:'var(--accent)', fontWeight:700 }}>예약 n건</span>
                <span>해당 날짜 예약 수</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid var(--border2)',borderRadius:'999px'}}>
                <span style={{ color:'var(--text-primary)', fontWeight:700 }}>총 n명</span>
                <span>요약 인원 합계</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid rgba(247,201,72,.28)',borderRadius:'999px'}}>
                <span style={{ color:'var(--amber)', fontWeight:700 }}>주의 85%</span>
                <span>알림</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid rgba(255,107,107,.28)',borderRadius:'999px'}}>
                <span style={{ color:'var(--red)', fontWeight:700 }}>초과 100%</span>
                <span>마감권고</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid var(--border2)',borderRadius:'999px'}}>
                <span className="cal-notice-dot" />
                <span>알림</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid rgba(247,201,72,.28)',borderRadius:'999px',color:'var(--amber)',fontWeight:700}}>특일</span>
            </div>
            <div className="cal-grid">
              {DAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
              {cells.map((c, i) => {
                const ds       = c.ds
                const today    = todayStr()
                const cnt      = getDateRes(ds).length
                const pax      = getDatePax(ds)
                const over     = isOverLimit(ds)
                const caution  = !over && isCautionLimit(ds)
                const ntcList  = getDateNotices(ds)
                const isToday  = ds === today
                const isSel    = ds === selectedDate
                return (
                  <div
                    key={i}
                    className={`cal-day${c.cur?'':' other-month'}${isToday?' today':''}${isSel?' cal-selected':''}`}
                    style={over
                      ? { boxShadow:'inset 0 0 0 2px rgba(255,107,107,0.62)' }
                      : caution
                        ? { boxShadow:'inset 0 0 0 2px rgba(247,201,72,0.54)' }
                        : null}
                    onClick={() => { setSelectedDate(ds); setOpenResNo('') }}
                    onDoubleClick={() => router.push(`/dashboard/reservations?new=1&date=${ds}&from=dashboard`)}
                  >
                    <div
                      className="cal-notice-list cal-notice-top"
                      onClick={e => { e.stopPropagation(); openNoticePopup(ds) }}
                    >
                      {ntcList.slice(0,2).map(n => {
                        const start = isNoticeStartOn(n, ds)
                        const end = isNoticeEndOn(n, ds)
                        const isRange = (n.end_date || n.date) !== n.date
                        return (
                          <div
                            key={n.id}
                            className={`cal-notice-title${isRange ? ' cal-notice-range' : ''}${start ? ' range-start' : ''}${end ? ' range-end' : ''}`}
                            title={noticeTitle(n)}
                          >
                            {start ? noticeTitle(n) : ''}
                          </div>
                        )
                      })}
                      {ntcList.length > 2 && <div className="cal-notice-more">+{ntcList.length - 2}</div>}
                    </div>
                    <div className="cal-day-num">{c.day}</div>
                    {cnt > 0 ? <div className="cal-res-count">예약{cnt}건</div> : <div style={{ height:'13px' }} />}
                    {pax > 0 ? (
                      <div style={{ fontSize:'9px', fontWeight:700, marginBottom:'2px', color: over ? 'var(--red)' : caution ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {over ? '초과 ' : caution ? '주의 ' : '총 '}{pax}명
                      </div>
                    ) : <div style={{ height:'13px' }} />}
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
          {selectedDateWarnings.length > 0 && (
            <div
              style={{
                marginBottom:'10px',
                padding:'10px 12px',
                border:'1px solid rgba(247,201,72,.32)',
                borderRadius:'8px',
                background:'rgba(247,201,72,.08)',
              }}
            >
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',marginBottom:'7px'}}>
                <div style={{fontSize:'11px',fontWeight:800,color:'var(--amber)'}}>인원 알림 상품</div>
                <button
                  className="btn-outline"
                  style={{height:'28px',padding:'0 10px',fontSize:'11px'}}
                  onClick={sendLimitAlert}
                  disabled
                  title="대표님 텔레그램 chat_id 연동 후 사용할 수 있습니다"
                >
                  텔레그램 연동 후 사용
                </button>
              </div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {selectedDateWarnings.map(item => (
                  <span
                    key={item.name}
                    title={`${item.name} ${item.people}/${item.limit}명 · ${item.level === 'over' ? '초과' : '주의'} 기준 ${item.level === 'over' ? item.limit : item.cautionAt}명`}
                    style={{
                      display:'inline-flex',
                      alignItems:'center',
                      gap:'5px',
                      padding:'4px 8px',
                      borderRadius:'999px',
                      border:item.level === 'over' ? '1px solid rgba(255,107,107,.34)' : '1px solid rgba(247,201,72,.34)',
                      background:'rgba(10,31,48,.32)',
                      fontSize:'11px',
                      fontWeight:800,
                      color:'var(--text-primary)',
                    }}
                  >
                    <span style={{color:item.level === 'over' ? 'var(--red)' : 'var(--amber)'}}>{item.level === 'over' ? '초과' : '주의'}</span>
                    <span>{item.name}</span>
                    <span style={{color:item.level === 'over' ? 'var(--red)' : 'var(--amber)'}}>{item.people}/{item.limit}명</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {selRes.length === 0 ? (
            <div className="list-card" style={{ padding:'20px', textAlign:'center' }}>
              <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'10px' }}>해당 날짜 예약이 없습니다.</div>
              <button className="btn-primary" style={{ height:'28px', fontSize:'11px', padding:'0 12px' }} onClick={() => router.push(`/dashboard/reservations?new=1&date=${selectedDate}&from=dashboard`)}>
                + 예약 등록하기
              </button>
            </div>
          ) : (
            <div className="list-card" style={{ overflow:'hidden', maxHeight:'486px', overflowY:'auto' }}>
              {selRes.map(r => {
                const conf = getConfirmStatus(r)
                const componentSummary = componentSummaryForReservation(r, budgetUsages, packages, zones)
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
                              <span style={{ fontWeight:400, fontSize:'11px', color:'var(--text-muted)', marginLeft:'4px' }}>{componentSummary.zoneCount}구역 · 상품 {componentSummary.packageCount}건</span>
                            </div>
                            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
                              <span title={componentSummary.packageTitle || '-'}>{componentSummary.packageLabel || '-'}</span>
                              <span style={{ color:'var(--text-muted)' }}> · </span>
                              <span title={componentSummary.zoneTitle || '-'}>{componentSummary.zoneLabel || '-'}</span>
                              <span style={{ color:'var(--text-muted)' }}> · </span>
                              <span className={`badge ${r.type}`} style={{ fontSize:'10px', padding:'1px 6px' }}>{STATUS_LABEL[r.type]}</span>
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
                            {infoItem('상품/패키지', componentSummary.packageLabel)}
                            {infoItem('구역', componentSummary.zoneLabel)}
                            {infoItem('구성', `${componentSummary.zoneCount}구역 / 상품 ${componentSummary.packageCount}건`)}
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

      {/* 선택월 KPI */}
      <div style={{ marginTop:'8px' }}>
        <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'10px' }}>{selectedMonth} 운영 요약</div>
        <div className="kpi-grid" style={{ marginBottom:0 }}>
          <div className="kpi-card">
            <div className="kpi-label">선택월 예약</div>
            <div className="kpi-value">{selectedMonthRes.length}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
            <div className="kpi-sub">{selectedMonth} 기준</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">선택월 매출</div>
            <div className="kpi-value" style={{fontSize:'20px'}}>{fmtMoney(selectedMonthSales)}</div>
            <div className="kpi-sub">취소 제외</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">미정산</div>
            <div className="kpi-value" style={{color: unsettledCount > 0 ? 'var(--amber)' : 'var(--green)'}}>{unsettledCount}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
            <div className="kpi-sub">선택월 정산 전 예약</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">업체 확인 대기</div>
            <div className="kpi-value" style={{color: waitVendorCount > 0 ? 'var(--red)' : 'var(--green)'}}>{waitVendorCount}<span style={{fontSize:'14px',fontWeight:400,color:'var(--text-muted)',marginLeft:'4px'}}>건</span></div>
            <div className="kpi-sub">선택월 응답 대기</div>
          </div>
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
              {noticePopup.notices.map((n, i) => (
                <div key={n.id} className="notice-item">
                  <div className="notice-item-num">{i+1}</div>
                  <div className="notice-item-content">
                    <div style={{fontWeight:800,color:'var(--text-primary)',marginBottom:'3px'}}>{noticeTitle(n)}</div>
                    <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'4px'}}>
                      {noticeTimeLabel(n)}{n.place ? ` · ${n.place}` : ''}
                    </div>
                    {n.content && <div>{n.content}</div>}
                  </div>
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
