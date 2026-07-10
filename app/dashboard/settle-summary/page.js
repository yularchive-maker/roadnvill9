'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'

const fmt = n => (Number(n) || 0).toLocaleString()

const SETTLE_TYPES = [
  { key: '체험', title: '체험 정산', color: 'var(--accent)' },
  { key: '숙박', title: '숙박 정산', color: 'var(--amber)' },
  { key: '픽업', title: '픽업 정산', color: 'var(--pickup)' },
  { key: '플랫폼', title: '플랫폼 정산', color: 'var(--purple)' },
  { key: '여행사', title: '여행사 정산', color: 'var(--green)' },
]

function monthRange() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return [`${y}-${m}-01`, `${y}-${m}-${String(last).padStart(2, '0')}`]
}

function monthValueFromDate(date) {
  return String(date || '').slice(0, 7)
}

function monthDateRange(monthValue) {
  const [year, month] = String(monthValue || '').split('-').map(Number)
  if (!year || !month) return monthRange()
  const last = new Date(year, month, 0).getDate()
  const paddedMonth = String(month).padStart(2, '0')
  return [`${year}-${paddedMonth}-01`, `${year}-${paddedMonth}-${String(last).padStart(2, '0')}`]
}

function addMonthValue(monthValue, diff) {
  const [year, month] = String(monthValue || '').split('-').map(Number)
  if (!year || !month) return monthValueFromDate(monthRange()[0])
  const date = new Date(year, month - 1 + diff, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthValue) {
  const [year, month] = String(monthValue || '').split('-')
  return year && month ? `${year}년 ${Number(month)}월` : '월 선택'
}

function emptyRows() {
  return Object.fromEntries(SETTLE_TYPES.map(type => [type.key, []]))
}

function emptyMap() {
  return Object.fromEntries(SETTLE_TYPES.map(type => [type.key, {}]))
}

function pkgName(reservation) {
  return reservation.package_name || reservation.pkg
}

function feeAmount(total, percent) {
  return Math.round((Number(total) || 0) * (Number(percent) || 0) / 100)
}

function lodgeSettleAmount(lodge, reservation) {
  const price = Number(lodge?.room_price) || 0
  if (lodge?.price_type === 'per_person') {
    return price * (Number(reservation?.pax) || 0)
  }
  return price
}

function lodgeVendorInfo(lodge, lodgeVendors = []) {
  const vendor = lodgeVendors.find(item =>
    (item.lodges || []).some(space => space?.name === lodge?.lodge_name)
  )
  return {
    vendorName: vendor?.name || lodge?.lodge_name || '숙박업체',
    spaceName: lodge?.lodge_name || '',
  }
}

function normalizeSettleType(type, vendorKey) {
  if (vendorKey) return '체험'
  if (SETTLE_TYPES.some(item => item.key === type)) return type
  return type || ''
}

function settledKey(type, vendorKey, item) {
  return [
    type || '',
    vendorKey || '',
    item.no || item.reservation_no || '',
    item.detail || '',
    Number(item.amt) || 0,
  ].join('|')
}

function inDateRange(value, start, end) {
  if (!value) return false
  const date = String(value).slice(0, 10)
  return date >= start && date <= end
}

function historyVendorName(history, vendors = []) {
  if (history.vendors?.name) return history.vendors.name
  const vendor = vendors.find(item => item.key === history.vendor_key)
  if (vendor?.name) return vendor.name
  if (history.settle_type === '플랫폼' || history.settle_type === '여행사') {
    return history.settle_history_items?.[0]?.detail || history.settle_type
  }
  return history.settle_type || '기타'
}

function historyVendorKeys(history, item, vendors = []) {
  if (history.vendor_key) return [history.vendor_key]
  const detail = item?.detail || ''
  const keys = vendors
    .filter(vendor => (vendor.vendor_programs || []).some(program => program.prog_name === detail))
    .map(vendor => vendor.key)
    .filter(Boolean)
  return keys.length ? keys : ['']
}

function addAmount(map, type, name, amount, color, detail = null) {
  if (!map[type] || !name) return
  const numericAmount = Number(amount) || 0
  if (numericAmount <= 0) return
  if (!map[type][name]) {
    map[type][name] = { vendor: name, color, count: 0, settled: 0, unsettled: 0, details: [] }
  }
  map[type][name].count += 1
  map[type][name].unsettled += numericAmount
  if (detail) map[type][name].details.push({ ...detail, amount: numericAmount, status: '미정산' })
}

export default function SettleSummaryPage() {
  const [defaultStart, defaultEnd] = monthRange()
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [draftStartDate, setDraftStartDate] = useState(defaultStart)
  const [draftEndDate, setDraftEndDate] = useState(defaultEnd)
  const [periodMode, setPeriodMode] = useState('range')
  const [selectedMonth, setSelectedMonth] = useState(monthValueFromDate(defaultStart))
  const [loading, setLoading] = useState(false)
  const [vendors, setVendors] = useState([])
  const [lodgeVendors, setLodgeVendors] = useState([])
  const [packages, setPackages] = useState([])
  const [rows, setRows] = useState(emptyRows())
  const [activeType, setActiveType] = useState(SETTLE_TYPES[0].key)
  const [expandedRows, setExpandedRows] = useState({})
  const [hasQueried, setHasQueried] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*, vendor_programs(*)').order('key'),
      supabase.from('lodge_vendors').select('*, lodges(*)').order('name'),
      supabase.from('packages').select('*, package_programs(*)').order('name'),
    ]).then(([vendorRes, lodgeVendorRes, packageRes]) => {
      setVendors(vendorRes.data || [])
      setLodgeVendors(lodgeVendorRes.data || [])
      setPackages(packageRes.data || [])
    })
  }, [])

  const load = useCallback(async () => {
    if (!vendors.length || !packages.length || !startDate || !endDate) return
    setLoading(true)

    const { data: historyRows } = await supabase
      .from('settle_history')
      .select('*, settle_history_items(*), vendors(name,color)')

    const activeHistory = (historyRows || []).filter(row => row?.is_deleted !== true)
    const settledMap = emptyMap()
    const settled = new Set()

    for (const history of activeHistory) {
      const items = (history.settle_history_items || []).filter(item => item?.is_deleted !== true)
      const type = normalizeSettleType(history.settle_type, history.vendor_key)

      for (const item of items) {
        settled.add(settledKey(history.settle_type, history.vendor_key, item))
        settled.add(settledKey(type, history.vendor_key, item))
        historyVendorKeys(history, item, vendors).forEach(vendorKey => {
          settled.add(settledKey(type, vendorKey, item))
          if (type === '체험') settled.add(settledKey('체험', vendorKey, item))
        })

        if (!inDateRange(item.date, startDate, endDate)) continue
        if (!settledMap[type]) continue
        const amount = Number(item.amt) || 0
        if (amount <= 0) continue

        const name = historyVendorName(history, vendors)
        if (!settledMap[type][name]) {
          settledMap[type][name] = {
            vendor: name,
            color: history.vendors?.color,
            count: 0,
            settled: 0,
            unsettled: 0,
            details: [],
          }
        }
        settledMap[type][name].count += 1
        settledMap[type][name].settled += amount
        settledMap[type][name].details.push({
          no: item.no || item.reservation_no || '',
          date: item.date || '',
          customer: item.customer || '',
          pax: item.pax,
          detail: item.detail || '',
          amount,
          status: '정산완료',
        })
      }
    }

    const { data: reservations } = await supabase
      .from('reservations')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .neq('type', 'cancelled')
      .or('is_deleted.is.null,is_deleted.eq.false')

    const unsettledMap = emptyMap()

    if (reservations?.length) {
      const reservationNos = reservations.map(item => item.no)
      const reservationByNo = Object.fromEntries(reservations.map(item => [item.no, item]))
      const [lodgeRes, pickupRes, snapshotRes] = await Promise.all([
        supabase.from('lodge_confirms').select('*').in('reservation_no', reservationNos).or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('reservation_pickup').select('*, drivers(name)').in('reservation_no', reservationNos).or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('reservation_program_snapshots').select('*').in('reservation_no', reservationNos).or('is_deleted.is.null,is_deleted.eq.false'),
      ])

      const snapshots = snapshotRes.data || []
      const snapshotNos = new Set(snapshots.map(item => item.reservation_no))

      for (const snapshot of snapshots) {
        const amount = Number(snapshot.vendor_settle_total) || 0
        const item = { no: snapshot.reservation_no, detail: snapshot.prog_name, amt: amount }
        if (settled.has(settledKey('체험', snapshot.vendor_key, item))) continue
        const reservation = reservationByNo[snapshot.reservation_no] || {}
        const vendor = vendors.find(vendorItem => vendorItem.key === snapshot.vendor_key)
        const name = snapshot.vendor_name || vendor?.name || snapshot.vendor_key
        addAmount(unsettledMap, '체험', name, amount, vendor?.color, {
          no: snapshot.reservation_no,
          date: reservation.date,
          customer: reservation.customer,
          pax: snapshot.pax || reservation.pax,
          detail: snapshot.prog_name,
        })
      }

      for (const reservation of reservations) {
        if (snapshotNos.has(reservation.no)) continue
        const pack = packages.find(item => item.name === pkgName(reservation))
        if (!pack) continue

        for (const program of pack.package_programs || []) {
          const vendor = vendors.find(item => item.key === program.vendor_key)
          if (!vendor) continue
          const vendorProgram = vendor.vendor_programs?.find(item => item.prog_name === program.prog_name)
          if (!vendorProgram) continue

          const amount = vendorProgram.settle_type === 'per_person'
            ? (Number(vendorProgram.unit_price) || 0) * (Number(reservation.pax) || 0)
            : Number(vendorProgram.unit_price) || 0
          const item = { no: reservation.no, detail: program.prog_name, amt: amount }
          if (settled.has(settledKey('체험', program.vendor_key, item))) continue
          addAmount(unsettledMap, '체험', vendor.name, amount, vendor.color, {
            no: reservation.no,
            date: reservation.date,
            customer: reservation.customer,
            pax: reservation.pax,
            detail: program.prog_name,
          })
        }
      }

      for (const lodge of lodgeRes.data || []) {
        if (!lodge.lodge_name || !lodge.room_price) continue
        const reservation = reservationByNo[lodge.reservation_no] || {}
        const amount = lodgeSettleAmount(lodge, reservation)
        const lodgeInfo = lodgeVendorInfo(lodge, lodgeVendors)
        const item = { no: lodge.reservation_no, detail: `${lodgeInfo.spaceName || '-'} · ${lodge.room_name || ''}${lodge.price_type === 'per_person' ? ' · 인원당' : ''}`, amt: amount }
        const legacyItem = { ...item, detail: lodge.room_name || '' }
        if (settled.has(settledKey('숙박', null, item)) || settled.has(settledKey('숙박', null, legacyItem))) continue
        addAmount(unsettledMap, '숙박', lodgeInfo.vendorName, amount, 'var(--amber)', {
          no: lodge.reservation_no,
          date: reservation.date,
          customer: reservation.customer,
          pax: reservation.pax,
          detail: item.detail,
        })
      }

      for (const pickup of pickupRes.data || []) {
        if (!pickup.pickup_fee) continue
        const item = { no: pickup.reservation_no, detail: pickup.pickup_place || '', amt: pickup.pickup_fee }
        if (settled.has(settledKey('픽업', null, item))) continue
        const reservation = reservationByNo[pickup.reservation_no] || {}
        addAmount(unsettledMap, '픽업', pickup.drivers?.name || '픽업 수행자', pickup.pickup_fee, 'var(--pickup)', {
          no: pickup.reservation_no,
          date: reservation.date,
          customer: reservation.customer,
          pax: reservation.pax,
          detail: pickup.pickup_place || '',
        })
      }

      for (const reservation of reservations) {
        const platformAmount = feeAmount(reservation.total, reservation.plat_fee)
        if (reservation.platform_name && platformAmount > 0) {
          const item = { no: reservation.no, detail: reservation.platform_name, amt: platformAmount }
          if (!settled.has(settledKey('플랫폼', null, item))) {
            addAmount(unsettledMap, '플랫폼', reservation.platform_name, platformAmount, 'var(--purple)', {
              no: reservation.no,
              date: reservation.date,
              customer: reservation.customer,
              pax: reservation.pax,
              detail: reservation.platform_name,
            })
          }
        }

        const agencyAmount = feeAmount(reservation.total, reservation.ag_fee)
        if (reservation.agency_name && agencyAmount > 0) {
          const item = { no: reservation.no, detail: reservation.agency_name, amt: agencyAmount }
          if (!settled.has(settledKey('여행사', null, item))) {
            addAmount(unsettledMap, '여행사', reservation.agency_name, agencyAmount, 'var(--green)', {
              no: reservation.no,
              date: reservation.date,
              customer: reservation.customer,
              pax: reservation.pax,
              detail: reservation.agency_name,
            })
          }
        }
      }
    }

    const merged = emptyMap()
    for (const type of SETTLE_TYPES.map(item => item.key)) {
      const names = new Set([...Object.keys(settledMap[type]), ...Object.keys(unsettledMap[type])])
      for (const name of names) {
        const settledRow = settledMap[type][name] || {}
        const unsettledRow = unsettledMap[type][name] || {}
        merged[type][name] = {
          vendor: name,
          color: settledRow.color || unsettledRow.color,
          count: (settledRow.count || 0) + (unsettledRow.count || 0),
          settled: settledRow.settled || 0,
          unsettled: unsettledRow.unsettled || 0,
          details: [...(settledRow.details || []), ...(unsettledRow.details || [])]
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.no || '').localeCompare(String(b.no || ''))),
        }
      }
    }

    setRows(Object.fromEntries(
      SETTLE_TYPES.map(type => [
        type.key,
        Object.values(merged[type.key]).sort((a, b) => a.vendor.localeCompare(b.vendor, 'ko')),
      ])
    ))
    setLoading(false)
  }, [startDate, endDate, vendors, lodgeVendors, packages])

  useEffect(() => {
    if (!hasQueried) return
    load()
  }, [hasQueried, load])

  const activeMeta = SETTLE_TYPES.find(type => type.key === activeType) || SETTLE_TYPES[0]
  const activeData = rows[activeType] || []
  const allRows = useMemo(() => Object.values(rows).flat(), [rows])
  const totalAmount = activeData.reduce((sum, row) => sum + row.settled + row.unsettled, 0)
  const totalUnsettled = activeData.reduce((sum, row) => sum + row.unsettled, 0)
  const totalSettled = activeData.reduce((sum, row) => sum + row.settled, 0)
  const totalCount = activeData.reduce((sum, row) => sum + row.count, 0)
  const overallAmount = allRows.reduce((sum, row) => sum + row.settled + row.unsettled, 0)
  const overallUnsettled = allRows.reduce((sum, row) => sum + row.unsettled, 0)
  const overallSettled = allRows.reduce((sum, row) => sum + row.settled, 0)
  const overallCount = allRows.reduce((sum, row) => sum + row.count, 0)
  const toggleRow = key => setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }))
  const applyPeriod = () => {
    if (!draftStartDate || !draftEndDate) return
    setHasQueried(true)
    if (draftStartDate === startDate && draftEndDate === endDate) {
      load()
      return
    }
    setStartDate(draftStartDate)
    setEndDate(draftEndDate)
  }

  const applyMonthlyPeriod = (monthValue = selectedMonth) => {
    if (!monthValue) return
    const [nextStart, nextEnd] = monthDateRange(monthValue)
    setSelectedMonth(monthValue)
    setDraftStartDate(nextStart)
    setDraftEndDate(nextEnd)
    setHasQueried(true)
    if (nextStart === startDate && nextEnd === endDate) {
      load()
      return
    }
    setStartDate(nextStart)
    setEndDate(nextEnd)
  }

  const moveMonth = diff => {
    const nextMonth = addMonthValue(selectedMonth, diff)
    const [nextStart, nextEnd] = monthDateRange(nextMonth)
    setSelectedMonth(nextMonth)
    setDraftStartDate(nextStart)
    setDraftEndDate(nextEnd)
  }

  return (
    <div>
      <div className="settle-mode-tabs" aria-label="정산 요약 조회 방식">
        <button
          type="button"
          className={periodMode === 'range' ? 'active' : ''}
          onClick={() => setPeriodMode('range')}
        >
          기간 직접 조회
        </button>
        <button
          type="button"
          className={periodMode === 'month' ? 'active' : ''}
          onClick={() => setPeriodMode('month')}
        >
          월별 정산내역
        </button>
      </div>

      <div className="settle-period-bar" style={{ marginBottom: '14px' }}>
        {periodMode === 'month' ? (
          <>
            <label>조회 월</label>
            <div className="settle-month-stepper">
              <button type="button" className="cal-nav-btn" onClick={() => moveMonth(-1)}>‹</button>
              <div className="settle-month-current">{monthLabel(selectedMonth)}</div>
              <button type="button" className="cal-nav-btn" onClick={() => moveMonth(1)}>›</button>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {draftStartDate} ~ {draftEndDate}
            </span>
            <button className="btn-primary" style={{ height: '34px' }} onClick={() => applyMonthlyPeriod()}>월별 조회</button>
          </>
        ) : (
          <>
            <label>정산 시작일</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              className="form-input"
              style={{ width: '140px', height: '34px' }}
              value={draftStartDate}
              onChange={event => setDraftStartDate(formatDateTyping(event.target.value))}
              placeholder="2026-05-01"
            />
            <span style={{ color: 'var(--text-muted)' }}>~</span>
            <label>정산 종료일</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              className="form-input"
              style={{ width: '140px', height: '34px' }}
              value={draftEndDate}
              onChange={event => setDraftEndDate(formatDateTyping(event.target.value))}
              placeholder="2026-05-31"
            />
            <button className="btn-primary" style={{ height: '34px' }} onClick={applyPeriod}>조회</button>
          </>
        )}
        <Link href="/dashboard/settle-detail" className="btn-outline" style={{ height: '34px', display: 'inline-flex', alignItems: 'center' }}>
          업체별 정산내역
        </Link>
      </div>

      <div className="summary-cards" style={{ marginBottom: '14px' }}>
        <div className="summary-card">
          <div className="summary-label">기간 내 전체 건수</div>
          <div className="summary-value">{overallCount}건</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">기간 내 정산 대상</div>
          <div className="summary-value settle-money">₩{fmt(overallAmount)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">미정산 합계</div>
          <div className="summary-value settle-money" style={{ color: 'var(--amber)' }}>₩{fmt(overallUnsettled)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">정산완료 합계</div>
          <div className="summary-value settle-money" style={{ color: 'var(--green)' }}>₩{fmt(overallSettled)}</div>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: '16px' }}>
        {SETTLE_TYPES.map(type => {
          const data = rows[type.key] || []
          const count = data.reduce((sum, row) => sum + row.count, 0)
          const amount = data.reduce((sum, row) => sum + row.settled + row.unsettled, 0)
          return (
            <button
              key={type.key}
              className={`tab-btn${activeType === type.key ? ' active' : ''}`}
              onClick={() => setActiveType(type.key)}
            >
              {type.key}
              <span style={{ marginLeft: '6px', fontSize: '11px', color: activeType === type.key ? 'var(--accent)' : 'var(--text-muted)' }}>
                {count}건 · ₩{fmt(amount)}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>조회 중...</div>
      ) : (
        <div className="list-card">
          <div className="master-card-header">
            <div>
              <div className="master-card-title">{activeMeta.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                예약/사용일 기준 {startDate} ~ {endDate}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>{totalCount}건</span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700, color: activeMeta.color }}>
                ₩{fmt(totalAmount)}
              </span>
            </div>
          </div>
          <div className="list-header" style={{ gridTemplateColumns: 'minmax(180px,1fr) 70px 130px 120px 120px 38px', fontSize: '10px', alignItems: 'center' }}>
            <span style={{ textAlign: 'center' }}>대상</span><span style={{ textAlign: 'center' }}>건수</span><span style={{ textAlign: 'right' }}>합계</span><span style={{ textAlign: 'right' }}>미정산</span><span style={{ textAlign: 'right' }}>완료</span><span />
          </div>
          {activeData.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              내역 없음
            </div>
          ) : activeData.map((row, index) => {
            const rowKey = `${activeType}-${row.vendor}-${index}`
            const isOpen = !!expandedRows[rowKey]
            return (
              <div key={rowKey} style={{ borderTop: index === 0 ? 0 : '1px solid var(--border2)' }}>
                <button
                  type="button"
                  onClick={() => toggleRow(rowKey)}
                  className="list-row"
                  style={{
                    width: '100%',
                    gridTemplateColumns: 'minmax(180px,1fr) 70px 130px 120px 120px 38px',
                    fontSize: '13px',
                    textAlign: 'left',
                    border: 0,
                    cursor: 'pointer',
                    appearance: 'none',
                    background: isOpen ? 'rgba(78,205,196,0.08)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    {row.color && (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, display: 'inline-block', flexShrink: 0 }} />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.vendor}</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{row.count}건</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", textAlign: 'right' }}>₩{fmt(row.settled + row.unsettled)}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: row.unsettled > 0 ? 'var(--amber)' : 'var(--text-muted)', textAlign: 'right' }}>₩{fmt(row.unsettled)}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: row.settled > 0 ? 'var(--green)' : 'var(--text-muted)', textAlign: 'right' }}>₩{fmt(row.settled)}</span>
                  <span style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '11px' }}>{isOpen ? '접기' : '상세'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '8px 18px 14px', background: 'rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '76px 92px minmax(92px,1fr) 58px minmax(120px,1.2fr) 110px 72px', gap: '8px', padding: '7px 10px', color: 'var(--text-muted)', fontSize: '10px', borderBottom: '1px solid var(--border2)' }}>
                      <span>예약번호</span><span>날짜</span><span>고객명</span><span>인원</span><span>내용</span><span style={{ textAlign:'right' }}>금액</span><span>상태</span>
                    </div>
                    {(row.details || []).length === 0 ? (
                      <div style={{ padding: '12px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>예약별 상세 없음</div>
                    ) : row.details.map((detail, detailIndex) => (
                      <div key={`${rowKey}-detail-${detailIndex}`} style={{ display: 'grid', gridTemplateColumns: '76px 92px minmax(92px,1fr) 58px minmax(120px,1.2fr) 110px 72px', gap: '8px', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px' }}>
                        <span className="no-col">#{detail.no || '-'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{detail.date || '-'}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail.customer || '-'}</span>
                        <span style={{ fontWeight: 700 }}>{detail.pax ? `${detail.pax}명` : '-'}</span>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail.detail || '-'}</span>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 800, color: detail.status === '정산완료' ? 'var(--green)' : 'var(--amber)', textAlign:'right' }}>₩{fmt(detail.amount)}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: detail.status === '정산완료' ? 'var(--green)' : 'var(--amber)' }}>{detail.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {activeData.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border2)', display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 70px 130px 120px 120px 38px', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', alignItems: 'center' }}>
              <span>합계</span>
              <span style={{ textAlign: 'center' }}>{totalCount}건</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: activeMeta.color, textAlign: 'right' }}>₩{fmt(totalAmount)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: totalUnsettled > 0 ? 'var(--amber)' : 'var(--text-muted)', textAlign: 'right' }}>₩{fmt(totalUnsettled)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: totalSettled > 0 ? 'var(--green)' : 'var(--text-muted)', textAlign: 'right' }}>₩{fmt(totalSettled)}</span>
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
