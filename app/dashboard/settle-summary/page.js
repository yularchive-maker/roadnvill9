'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'

const fmt = n => (n || 0).toLocaleString()

function pkgName(r) { return r.package_name || r.pkg }

function monthRange() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return [`${y}-${m}-01`, `${y}-${m}-${String(last).padStart(2, '0')}`]
}

const TYPES = [
  { key: '체험', title: '기간별 체험 정산' },
  { key: '숙박', title: '기간별 숙박 정산' },
  { key: '픽업', title: '기간별 픽업 정산' },
  { key: '플랫폼', title: '기간별 플랫폼 정산' },
  { key: '여행사', title: '기간별 여행사 정산' },
]

function emptyRows() {
  return Object.fromEntries(TYPES.map(t => [t.key, []]))
}

function emptyMap() {
  return Object.fromEntries(TYPES.map(t => [t.key, {}]))
}

function feeAmount(total, percent) {
  return Math.round((Number(total) || 0) * (Number(percent) || 0) / 100)
}

function historyVendorName(h) {
  if (h.vendors?.name) return h.vendors.name
  if (h.settle_type === '플랫폼' || h.settle_type === '여행사') {
    return h.settle_history_items?.[0]?.detail || h.settle_type
  }
  return h.settle_type
}

function normalizeSettleType(type, vendorKey) {
  if (TYPES.some(t => t.key === type)) return type
  if (vendorKey) return '체험'
  return type
}

function settledKey(type, vendorKey, it) {
  return [type || '', vendorKey || '', it.no || it.reservation_no || '', it.detail || '', Number(it.amt) || 0].join('|')
}

export default function SettleSummaryPage() {
  const [s0, e0] = monthRange()
  const [startDate, setStartDate] = useState(s0)
  const [endDate, setEndDate] = useState(e0)
  const [loading,  setLoading]  = useState(false)
  const [vendors,  setVendors]  = useState([])
  const [packages, setPackages] = useState([])
  const [rows,     setRows]     = useState(emptyRows())
  const [activeType, setActiveType] = useState(TYPES[0].key)

  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*, vendor_programs(*)').order('key'),
      supabase.from('packages').select('*, package_programs(*)').order('name'),
    ]).then(([v, p]) => {
      setVendors(v.data || [])
      setPackages(p.data || [])
    })
  }, [])

  const load = useCallback(async () => {
    if (!vendors.length || !packages.length) return
    if (!startDate || !endDate) return
    setLoading(true)
    const start = startDate
    const end = endDate

    // ?뺤궛 ?꾨즺 ?대젰 (???ъ뿉 settled_at 湲곗?)
    const { data: hist } = await supabase
      .from('settle_history')
      .select('*, settle_history_items(*), vendors(name,color)')
      .gte('settled_at', start).lte('settled_at', end)

    // settled 湲덉븸 吏묎퀎: type ??vendor ??{count, amt, color}
    const settledMap = emptyMap()
    for (const h of (hist || []).filter(row => row?.is_deleted !== true)) {
      const historyItems = (h.settle_history_items || []).filter(item => item?.is_deleted !== true)
      const type = normalizeSettleType(h.settle_type, h.vendor_key)
      if (!settledMap[type]) continue
      const name = historyVendorName(h)
      if (!settledMap[type][name]) settledMap[type][name] = { vendor: name, color: h.vendors?.color, count: 0, settled: 0, unsettled: 0 }
      settledMap[type][name].count += historyItems.length
      settledMap[type][name].settled += historyItems.reduce((acc, item) => acc + (Number(item.amt) || 0), 0)
    }

    const { data: allHist } = await supabase
      .from('settle_history')
      .select('*, settle_history_items(*)')

    const settled = new Set()
    ;(allHist || []).filter(h => h?.is_deleted !== true).forEach(h => {
      ;(h.settle_history_items || []).filter(it => it?.is_deleted !== true).forEach(it => {
        settled.add(settledKey(h.settle_type, h.vendor_key, it))
        settled.add(settledKey(normalizeSettleType(h.settle_type, h.vendor_key), h.vendor_key, it))
      })
    })

    // 誘몄젙??湲덉븸 吏묎퀎 (????reservations, unsettled)
    const { data: resv } = await supabase
      .from('reservations').select('*')
      .gte('date', start).lte('date', end)
      .neq('type', 'cancelled')
      .or('is_deleted.is.null,is_deleted.eq.false')

    const unsettledMap = emptyMap()

    if (resv?.length) {
      const nos = resv.map(r => r.no)
      const [lcRes, rpRes, snapRes] = await Promise.all([
        supabase.from('lodge_confirms').select('*').in('reservation_no', nos).or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('reservation_pickup').select('*, drivers(name)').in('reservation_no', nos).or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('reservation_program_snapshots').select('*').in('reservation_no', nos).or('is_deleted.is.null,is_deleted.eq.false'),
      ])

      // 泥댄뿕 誘몄젙??      for (const r of resv) {
      const snapshots = snapRes.data || []
      const snapNos = new Set(snapshots.map(s => s.reservation_no))
      const experienceType = TYPES[0].key
      for (const snap of snapshots) {
        const amt = Number(snap.vendor_settle_total) || 0
        const item = { no: snap.reservation_no, detail: snap.prog_name, amt }
        if (settled.has(settledKey(experienceType, snap.vendor_key, item))) continue
        const vendor = vendors.find(v => v.key === snap.vendor_key)
        const k = snap.vendor_name || vendor?.name || snap.vendor_key
        if (!unsettledMap[experienceType][k]) unsettledMap[experienceType][k] = { vendor: k, color: vendor?.color, count: 0, settled: 0, unsettled: 0 }
        unsettledMap[experienceType][k].count += 1
        unsettledMap[experienceType][k].unsettled += amt
      }

      for (const r of resv) {
        if (snapNos.has(r.no)) continue
        const pkg = packages.find(p => p.name === pkgName(r))
        if (!pkg) continue
        for (const pp of pkg.package_programs || []) {
          const vendor = vendors.find(v => v.key === pp.vendor_key)
          if (!vendor) continue
          const vp = vendor.vendor_programs?.find(x => x.prog_name === pp.prog_name)
          if (!vp) continue
          const amt = vp.settle_type === 'per_person' ? vp.unit_price * (r.pax || 0) : vp.unit_price
          const item = { no: r.no, detail: pp.prog_name, amt }
          if (settled.has(settledKey('체험', pp.vendor_key, item))) continue
          const k = vendor.name
          if (!unsettledMap['체험'][k]) unsettledMap['체험'][k] = { vendor: k, color: vendor.color, count: 0, settled: 0, unsettled: 0 }
          unsettledMap['체험'][k].count += 1
          unsettledMap['체험'][k].unsettled += amt
        }
      }

      for (const lc of lcRes.data || []) {
        if (!lc.lodge_name || !lc.room_price) continue
        const item = { no: lc.reservation_no, detail: lc.room_name || '', amt: lc.room_price }
        if (settled.has(settledKey('숙박', null, item))) continue
        const k = lc.lodge_name
        if (!unsettledMap['숙박'][k]) unsettledMap['숙박'][k] = { vendor: k, color: 'var(--amber)', count: 0, settled: 0, unsettled: 0 }
        unsettledMap['숙박'][k].count += 1
        unsettledMap['숙박'][k].unsettled += lc.room_price
      }

      for (const rp of rpRes.data || []) {
        if (!rp.pickup_fee) continue
        const item = { no: rp.reservation_no, detail: rp.pickup_place || '', amt: rp.pickup_fee }
        if (settled.has(settledKey('픽업', null, item))) continue
        const k = rp.drivers?.name || '픽업수행자'
        if (!unsettledMap['픽업'][k]) unsettledMap['픽업'][k] = { vendor: k, color: 'var(--pickup)', count: 0, settled: 0, unsettled: 0 }
        unsettledMap['픽업'][k].count += 1
        unsettledMap['픽업'][k].unsettled += rp.pickup_fee
      }

      for (const r of resv) {
        const platformAmt = feeAmount(r.total, r.plat_fee)
        if (r.platform_name) {
          const item = { no: r.no, detail: r.platform_name, amt: platformAmt }
          if (!settled.has(settledKey('플랫폼', null, item))) {
            const k = r.platform_name
            if (!unsettledMap['플랫폼'][k]) unsettledMap['플랫폼'][k] = { vendor: k, color: 'var(--purple)', count: 0, settled: 0, unsettled: 0 }
            unsettledMap['플랫폼'][k].count += 1
            unsettledMap['플랫폼'][k].unsettled += platformAmt
          }
        }

        const agencyAmt = feeAmount(r.total, r.ag_fee)
        if (r.agency_name) {
          const item = { no: r.no, detail: r.agency_name, amt: agencyAmt }
          if (!settled.has(settledKey('여행사', null, item))) {
            const k = r.agency_name
            if (!unsettledMap['여행사'][k]) unsettledMap['여행사'][k] = { vendor: k, color: 'var(--green)', count: 0, settled: 0, unsettled: 0 }
            unsettledMap['여행사'][k].count += 1
            unsettledMap['여행사'][k].unsettled += agencyAmt
          }
        }
      }
    }

    // ??留?蹂묓빀
    const merged = emptyMap()
    for (const type of TYPES.map(t => t.key)) {
      const names = new Set([...Object.keys(settledMap[type]), ...Object.keys(unsettledMap[type])])
      for (const name of names) {
        const s = settledMap[type][name] || {}
        const u = unsettledMap[type][name] || {}
        merged[type][name] = {
          vendor:   name,
          color:    s.color || u.color,
          count:    (s.count || 0) + (u.count || 0),
          settled:  s.settled || 0,
          unsettled: u.unsettled || 0,
        }
      }
    }

    setRows(Object.fromEntries(TYPES.map(t => [t.key, Object.values(merged[t.key])])))
    setLoading(false)
  }, [startDate, endDate, vendors, packages])

  useEffect(() => { load() }, [load])

  const activeMeta = TYPES.find(t => t.key === activeType) || TYPES[0]
  const activeData = rows[activeType] || []
  const totalAmt = activeData.reduce((s, r) => s + r.settled + r.unsettled, 0)
  const totalUnsettled = activeData.reduce((s, r) => s + r.unsettled, 0)
  const totalSettled = activeData.reduce((s, r) => s + r.settled, 0)
  const totalCount = activeData.reduce((s, r) => s + r.count, 0)

  return (
    <div>
      {/* ???좏깮 */}
      <div className="search-bar">
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>정산 시작일</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          className="search-input"
          style={{ maxWidth: '160px' }}
          value={startDate}
          onChange={e => setStartDate(formatDateTyping(e.target.value))}
          placeholder="2026-05-01"
        />
        <span style={{ color: 'var(--text-muted)' }}>~</span>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>정산 종료일</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          className="search-input"
          style={{ maxWidth: '160px' }}
          value={endDate}
          onChange={e => setEndDate(formatDateTyping(e.target.value))}
          placeholder="2026-05-31"
        />
        <button className="btn-primary" onClick={load}>조회</button>
      </div>

      <div className="tab-bar" style={{ marginBottom: '16px' }}>
        {TYPES.map(t => {
          const data = rows[t.key] || []
          const count = data.reduce((s, r) => s + r.count, 0)
          return (
            <button
              key={t.key}
              className={`tab-btn${activeType === t.key ? ' active' : ''}`}
              onClick={() => setActiveType(t.key)}
            >
              {t.key}
              <span style={{ marginLeft: '6px', fontSize: '11px', color: activeType === t.key ? 'var(--accent)' : 'var(--text-muted)' }}>
                {count}건
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
            <div className="master-card-title">{activeMeta.title}</div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>{totalCount}건</span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                ₩{fmt(totalAmt)}
              </span>
            </div>
          </div>
          <div className="list-header" style={{ gridTemplateColumns: '1fr 70px 120px 110px 110px', fontSize: '10px' }}>
            <span>업체</span><span>건수</span><span>합계</span><span>미정산</span><span>완료</span>
          </div>
          {activeData.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              내역 없음
            </div>
          ) : activeData.map((r, i) => (
            <div key={i} className="list-row" style={{ gridTemplateColumns: '1fr 70px 120px 110px 110px', fontSize: '13px' }}>
              <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {r.color && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color, display: 'inline-block', flexShrink: 0 }} />
                )}
                {r.vendor}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{r.count}건</span>
              <span style={{ fontFamily: "'DM Mono',monospace" }}>₩{fmt(r.settled + r.unsettled)}</span>
              <span style={{ color: r.unsettled > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>₩{fmt(r.unsettled)}</span>
              <span style={{ color: r.settled > 0 ? 'var(--green)' : 'var(--text-muted)' }}>₩{fmt(r.settled)}</span>
            </div>
          ))}
          {activeData.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border2)', display: 'grid', gridTemplateColumns: '1fr 70px 120px 110px 110px', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              <span>합계</span>
              <span>{totalCount}건</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--accent)' }}>₩{fmt(totalAmt)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: totalUnsettled > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>₩{fmt(totalUnsettled)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: totalSettled > 0 ? 'var(--green)' : 'var(--text-muted)' }}>₩{fmt(totalSettled)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
