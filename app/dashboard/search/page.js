'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const RESERVATION_STATUSES = ['전체', '상담중', '가능여부확인중', '조정필요', '확정가능', '예약확정', '취소', '완료']
const PAYMENT_STATUSES = ['전체', '미결제', '선결제완료', '후결제예정', '일부결제', '결제완료', '환불필요', '환불완료']
const REPLY_STATUSES = ['전체', '회신대기', '가능', '불가능', '시간조정 필요', '인원조정 필요', '보류']
const SIMPLE = ['전체', '예', '아니오']
const GRID = '86px 104px minmax(150px,1fr) minmax(150px,1fr) 70px 100px 96px 120px 92px 92px 82px 92px'
const CENTER = { display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', width:'100%' }
const RIGHT = { display:'flex', alignItems:'center', justifyContent:'flex-end', textAlign:'right', width:'100%' }
const NOWRAP = { overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }

function todayMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtMoney(value) {
  return (Number(value) || 0).toLocaleString()
}

function statusBadgeStyle(value) {
  if (value === '예약확정' || value === '확정가능' || value === '가능' || value === '완료') return { color:'var(--green)', background:'rgba(92,184,92,.14)' }
  if (value === '조정필요' || value === '시간조정 필요' || value === '인원조정 필요' || value === '후결제예정' || value === '일부결제') return { color:'var(--amber)', background:'rgba(247,201,72,.14)' }
  if (value === '취소' || value === '불가능' || value === '환불필요') return { color:'var(--red)', background:'rgba(224,92,92,.14)' }
  return { color:'var(--text-muted)', background:'rgba(143,163,177,.12)' }
}

function Badge({ children }) {
  return <span className="badge" style={{ ...statusBadgeStyle(children), minWidth:'74px', justifyContent:'center' }}>{children || '-'}</span>
}

export default function SearchPage() {
  const router = useRouter()
  const [rows, setRows] = useState([])
  const [vendorConfirms, setVendorConfirms] = useState([])
  const [lodgeConfirms, setLodgeConfirms] = useState([])
  const [pickups, setPickups] = useState([])
  const [settles, setSettles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    q: '',
    start: todayMonthStart(),
    end: '',
    reservation_status: '전체',
    payment_status: '전체',
    reply_status: '전체',
    lodging_status: '전체',
    pickup_status: '전체',
    unsettled: '전체',
    need_action: '전체',
    ready: '전체',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [resR, vcR, lcR, pkR, stR] = await Promise.all([
      supabase.from('reservations').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('date', { ascending: false }),
      supabase.from('vendor_confirms').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('lodge_confirms').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('reservation_pickup').select('*, drivers(name)').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('settle_history').select('reservation_nos, settle_history_items(reservation_no)'),
    ])
    const firstError = resR.error || vcR.error || lcR.error || pkR.error || stR.error
    if (firstError) {
      setError(firstError.message || '검색 데이터를 불러오지 못했습니다.')
      setRows([])
    } else {
      setRows(resR.data || [])
      setVendorConfirms(vcR.data || [])
      setLodgeConfirms(lcR.data || [])
      setPickups(pkR.data || [])
      setSettles(stR.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const enriched = useMemo(() => rows.map(row => {
    const vendors = vendorConfirms.filter(item => item.reservation_no === row.no)
    const lodges = lodgeConfirms.filter(item => item.reservation_no === row.no)
    const pickupRows = pickups.filter(item => item.reservation_no === row.no)
    const settledRows = settles.filter(item =>
      (item.reservation_nos || []).includes(row.no) ||
      (item.settle_history_items || []).some(child => child.reservation_no === row.no)
    )
    const vendorTotal = vendors.length
    const vendorPossible = vendors.filter(item => item.reply_status === '가능').length
    const vendorWaiting = vendors.filter(item => !item.reply_status || item.reply_status === '회신대기').length
    const vendorAdjust = vendors.filter(item => item.reply_status === '시간조정 필요' || item.reply_status === '인원조정 필요').length
    const vendorImpossible = vendors.filter(item => item.reply_status === '불가능').length

    let replySummary = '요청없음'
    if (vendorTotal) replySummary = `가능 ${vendorPossible}/${vendorTotal}`
    if (vendorWaiting) replySummary += ` · 대기 ${vendorWaiting}`
    if (vendorAdjust) replySummary += ` · 조정 ${vendorAdjust}`
    if (vendorImpossible) replySummary += ` · 불가 ${vendorImpossible}`

    const allVendorsOk = vendorTotal > 0 && vendorPossible === vendorTotal
    const lodgingOk = (row.lodging_status || '해당없음') === '해당없음' || ((row.lodging_status || '') === '확정완료' && lodges.some(item => item.lodge_name && item.room_name))
    const pickupOk = (row.pickup_status || '해당없음') === '해당없음' || ((row.pickup_status || '') === '확정완료' && pickupRows.some(item => item.driver_id || item.drivers?.name))
    const isReady = allVendorsOk && lodgingOk && pickupOk
    const needAction = vendorWaiting > 0 || vendorAdjust > 0 || vendorImpossible > 0 || !lodgingOk || !pickupOk
    const settled = row.settle_status === 'settled' || settledRows.length > 0

    return {
      ...row,
      vendors,
      replySummary,
      reply_status_rollup: vendorImpossible ? '불가능' : vendorAdjust ? '시간조정 필요' : vendorWaiting ? '회신대기' : allVendorsOk ? '가능' : '전체',
      lodgingOk,
      pickupOk,
      isReady,
      needAction,
      settled,
    }
  }), [lodgeConfirms, pickups, rows, settles, vendorConfirms])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return enriched.filter(row => {
      if (filters.start && row.date < filters.start) return false
      if (filters.end && row.date > filters.end) return false
      if (filters.reservation_status !== '전체' && (row.reservation_status || '') !== filters.reservation_status) return false
      if (filters.payment_status !== '전체' && (row.payment_status || '미결제') !== filters.payment_status) return false
      if (filters.reply_status !== '전체' && row.reply_status_rollup !== filters.reply_status) return false
      if (filters.lodging_status !== '전체' && (row.lodging_status || '해당없음') !== filters.lodging_status) return false
      if (filters.pickup_status !== '전체' && (row.pickup_status || '해당없음') !== filters.pickup_status) return false
      if (filters.unsettled === '예' && row.settled) return false
      if (filters.unsettled === '아니오' && !row.settled) return false
      if (filters.need_action === '예' && !row.needAction) return false
      if (filters.need_action === '아니오' && row.needAction) return false
      if (filters.ready === '예' && !row.isReady) return false
      if (filters.ready === '아니오' && row.isReady) return false
      if (!q) return true
      return [row.no, row.customer, row.package_name, row.zone_code, row.payto, row.memo, row.replySummary]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    })
  }, [enriched, filters])

  const summary = useMemo(() => ({
    total: filtered.length,
    ready: filtered.filter(row => row.isReady).length,
    needAction: filtered.filter(row => row.needAction).length,
    unsettled: filtered.filter(row => !row.settled).length,
  }), [filtered])

  function resetFilters() {
    setFilters({
      q: '',
      start: '',
      end: '',
      reservation_status: '전체',
      payment_status: '전체',
      reply_status: '전체',
      lodging_status: '전체',
      pickup_status: '전체',
      unsettled: '전체',
      need_action: '전체',
      ready: '전체',
    })
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">상세 검색</div>
          <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px' }}>예약, 업체 회신, 숙소, 픽업, 정산 상태를 한 번에 조회합니다.</div>
        </div>
        <button className="btn-outline" onClick={load}>새로고침</button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(4, 1fr)', marginBottom:'16px' }}>
        {[
          ['검색 결과', summary.total, 'var(--text-primary)'],
          ['확정가능', summary.ready, 'var(--green)'],
          ['조치 필요', summary.needAction, 'var(--amber)'],
          ['미정산', summary.unsettled, 'var(--red)'],
        ].map(([label, value, color]) => (
          <div key={label} className="kpi-card" style={{ padding:'14px 16px' }}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize:'22px', color }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="search-bar" style={{ flexWrap:'wrap', alignItems:'stretch' }}>
        <input className="search-input" style={{ minWidth:'280px' }} placeholder="예약번호, 고객명, 패키지, 구역, 결제처 검색" value={filters.q} onChange={e => setFilters(f => ({ ...f, q:e.target.value }))} />
        <input className="filter-select" type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start:e.target.value }))} />
        <input className="filter-select" type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end:e.target.value }))} />
        <select className="filter-select" value={filters.reservation_status} onChange={e => setFilters(f => ({ ...f, reservation_status:e.target.value }))}>
          {RESERVATION_STATUSES.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.payment_status} onChange={e => setFilters(f => ({ ...f, payment_status:e.target.value }))}>
          {PAYMENT_STATUSES.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.reply_status} onChange={e => setFilters(f => ({ ...f, reply_status:e.target.value }))}>
          {REPLY_STATUSES.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.ready} onChange={e => setFilters(f => ({ ...f, ready:e.target.value }))}>
          {SIMPLE.map(v => <option key={v} value={v}>확정가능 {v}</option>)}
        </select>
        <select className="filter-select" value={filters.need_action} onChange={e => setFilters(f => ({ ...f, need_action:e.target.value }))}>
          {SIMPLE.map(v => <option key={v} value={v}>조치필요 {v}</option>)}
        </select>
        <select className="filter-select" value={filters.unsettled} onChange={e => setFilters(f => ({ ...f, unsettled:e.target.value }))}>
          {SIMPLE.map(v => <option key={v} value={v}>미정산 {v}</option>)}
        </select>
        <button className="btn-outline" onClick={resetFilters}>초기화</button>
      </div>

      <div className="list-card">
        <div className="list-header" style={{ gridTemplateColumns:GRID, gap:'10px' }}>
          <span style={CENTER}>예약번호</span><span style={CENTER}>예약일</span><span>고객명</span><span>패키지명</span><span style={CENTER}>인원</span><span style={CENTER}>예약상태</span><span style={CENTER}>결제</span><span>업체 회신</span><span style={CENTER}>숙소</span><span style={CENTER}>픽업</span><span style={CENTER}>정산</span><span style={CENTER}>판단</span>
        </div>
        {loading ? (
          <div style={{ padding:'42px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>로딩 중...</div>
        ) : error ? (
          <div style={{ padding:'42px', textAlign:'center', color:'var(--red)', fontSize:'13px' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'42px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>조건에 맞는 예약이 없습니다.</div>
        ) : filtered.map(row => (
          <div key={row.no} className="list-row" style={{ gridTemplateColumns:GRID, gap:'10px' }} onClick={() => router.push(`/dashboard/reservations?no=${encodeURIComponent(row.no)}`)}>
            <span className="no-col" style={CENTER}>#{row.no}</span>
            <span style={{ ...CENTER, fontSize:'12px', fontFamily:'DM Mono,monospace', color:'var(--text-secondary)' }}>{row.date || '-'}</span>
            <span style={{ ...NOWRAP, fontWeight:600 }} title={row.customer}>{row.customer || '-'}</span>
            <span style={{ ...NOWRAP, fontSize:'12px', color:'var(--text-secondary)' }} title={row.package_name || '-'}>{row.package_name || '-'}</span>
            <span style={{ ...CENTER, fontWeight:700 }}>{row.pax || 0}명</span>
            <span style={CENTER}><Badge>{row.reservation_status || '-'}</Badge></span>
            <span style={CENTER}><Badge>{row.payment_status || '미결제'}</Badge></span>
            <span style={{ ...NOWRAP, fontSize:'12px', color:'var(--text-secondary)' }} title={row.replySummary}>{row.replySummary}</span>
            <span style={CENTER}><Badge>{row.lodging_status || '해당없음'}</Badge></span>
            <span style={CENTER}><Badge>{row.pickup_status || '해당없음'}</Badge></span>
            <span style={{ ...CENTER, color: row.settled ? 'var(--green)' : 'var(--amber)', fontWeight:700, fontSize:'12px' }}>{row.settled ? '완료' : '미정산'}</span>
            <span style={CENTER}><Badge>{row.isReady ? '확정가능' : row.needAction ? '조치필요' : '확인중'}</Badge></span>
          </div>
        ))}
      </div>
    </div>
  )
}
