'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = n => (n || 0).toLocaleString()

function pkgName(r) { return r.package_name || r.pkg }

function curMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}

const TYPES = [
  { key: '체험', title: '월별 체험 정산' },
  { key: '숙박', title: '월별 숙박 정산' },
  { key: '픽업', title: '월별 픽업 정산' },
]

export default function SettleSummaryPage() {
  const [month,    setMonth]    = useState(curMonth())
  const [loading,  setLoading]  = useState(false)
  const [vendors,  setVendors]  = useState([])
  const [packages, setPackages] = useState([])
  const [rows,     setRows]     = useState({ '체험': [], '숙박': [], '픽업': [] })

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
    setLoading(true)
    const [start, end] = monthBounds(month)

    // 정산 완료 이력 (이 달에 settled_at 기준)
    const { data: hist } = await supabase
      .from('settle_history')
      .select('*, settle_history_items(*), vendors(name,color)')
      .gte('settled_at', start).lte('settled_at', end)

    // settled 금액 집계: type → vendor → {count, amt, color}
    const settledMap = { '체험': {}, '숙박': {}, '픽업': {} }
    for (const h of hist || []) {
      const type = h.settle_type
      if (!settledMap[type]) continue
      const name = h.vendors?.name || h.settle_type
      if (!settledMap[type][name]) settledMap[type][name] = { vendor: name, color: h.vendors?.color, count: 0, settled: 0, unsettled: 0 }
      settledMap[type][name].count += (h.settle_history_items || []).length
      settledMap[type][name].settled += h.total_amt || 0
    }

    // 미정산 금액 집계 (이 달 reservations, unsettled)
    const { data: resv } = await supabase
      .from('reservations').select('*')
      .gte('date', start).lte('date', end)
      .neq('type', 'cancelled').eq('settle_status', 'unsettled')

    const unsettledMap = { '체험': {}, '숙박': {}, '픽업': {} }

    if (resv?.length) {
      const nos = resv.map(r => r.no)
      const [lcRes, rpRes] = await Promise.all([
        supabase.from('lodge_confirms').select('*').in('reservation_no', nos),
        supabase.from('reservation_pickup').select('*, drivers(name)').in('reservation_no', nos),
      ])

      // 체험 미정산
      for (const r of resv) {
        const pkg = packages.find(p => p.name === pkgName(r))
        if (!pkg) continue
        for (const pp of pkg.package_programs || []) {
          const vendor = vendors.find(v => v.key === pp.vendor_key)
          if (!vendor) continue
          const vp = vendor.vendor_programs?.find(x => x.prog_name === pp.prog_name)
          if (!vp) continue
          const amt = vp.settle_type === 'per_person' ? vp.unit_price * (r.pax || 0) : vp.unit_price
          const k = vendor.name
          if (!unsettledMap['체험'][k]) unsettledMap['체험'][k] = { vendor: k, color: vendor.color, count: 0, settled: 0, unsettled: 0 }
          unsettledMap['체험'][k].count += 1
          unsettledMap['체험'][k].unsettled += amt
        }
      }

      // 숙박 미정산
      for (const lc of lcRes.data || []) {
        if (!lc.lodge_name || !lc.room_price) continue
        const k = lc.lodge_name
        if (!unsettledMap['숙박'][k]) unsettledMap['숙박'][k] = { vendor: k, color: 'var(--amber)', count: 0, settled: 0, unsettled: 0 }
        unsettledMap['숙박'][k].count += 1
        unsettledMap['숙박'][k].unsettled += lc.room_price
      }

      // 픽업 미정산
      for (const rp of rpRes.data || []) {
        if (!rp.pickup_fee) continue
        const k = rp.drivers?.name || '픽업수행자'
        if (!unsettledMap['픽업'][k]) unsettledMap['픽업'][k] = { vendor: k, color: 'var(--pickup)', count: 0, settled: 0, unsettled: 0 }
        unsettledMap['픽업'][k].count += 1
        unsettledMap['픽업'][k].unsettled += rp.pickup_fee
      }
    }

    // 두 맵 병합
    const merged = { '체험': {}, '숙박': {}, '픽업': {} }
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

    setRows({
      '체험': Object.values(merged['체험']),
      '숙박': Object.values(merged['숙박']),
      '픽업': Object.values(merged['픽업']),
    })
    setLoading(false)
  }, [month, vendors, packages])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* 월 선택 */}
      <div className="search-bar">
        <input
          type="month"
          className="search-input"
          style={{ maxWidth: '200px' }}
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
        <button className="btn-primary" onClick={load}>조회</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>조회 중...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
          {TYPES.map(t => {
            const data = rows[t.key] || []
            const totalAmt   = data.reduce((s, r) => s + r.settled + r.unsettled, 0)
            const totalUnsettled = data.reduce((s, r) => s + r.unsettled, 0)
            const totalSettled   = data.reduce((s, r) => s + r.settled, 0)
            return (
              <div key={t.key} className="list-card">
                <div className="master-card-header">
                  <div className="master-card-title">{t.title}</div>
                  {totalAmt > 0 && (
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                      ₩{fmt(totalAmt)}
                    </span>
                  )}
                </div>
                <div className="list-header" style={{ gridTemplateColumns: '1fr 44px 90px 76px 76px', fontSize: '10px' }}>
                  <span>업체</span><span>건수</span><span>합계</span><span>미정산</span><span>완료</span>
                </div>
                {data.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                    내역 없음
                  </div>
                ) : data.map((r, i) => (
                  <div key={i} className="list-row" style={{ gridTemplateColumns: '1fr 44px 90px 76px 76px', fontSize: '12px' }}>
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
                {data.length > 0 && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border2)', display: 'grid', gridTemplateColumns: '1fr 44px 90px 76px 76px', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    <span>합계</span>
                    <span>{data.reduce((s, r) => s + r.count, 0)}건</span>
                    <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--accent)' }}>₩{fmt(totalAmt)}</span>
                    <span style={{ fontFamily: "'DM Mono',monospace", color: totalUnsettled > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>₩{fmt(totalUnsettled)}</span>
                    <span style={{ fontFamily: "'DM Mono',monospace", color: totalSettled > 0 ? 'var(--green)' : 'var(--text-muted)' }}>₩{fmt(totalSettled)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
