'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = n => (n || 0).toLocaleString()
const todayStr = () => new Date().toISOString().slice(0, 10)
const TYPE_COLOR = { '체험': 'var(--accent)', '숙박': 'var(--amber)', '픽업': 'var(--pickup)' }
const TYPE_BG    = { '체험': 'rgba(78,205,196,0.1)', '숙박': 'rgba(247,201,72,0.1)', '픽업': 'rgba(184,184,255,0.1)' }

function monthRange() {
  const d = new Date()
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return [`${y}-${m}-01`, `${y}-${m}-${String(last).padStart(2, '0')}`]
}

function pkgName(r) { return r.package_name || r.pkg }

function settledKey(type, vendorKey, it) {
  return [type || '', vendorKey || '', it.no || it.reservation_no || '', it.detail || '', Number(it.amt) || 0].join('|')
}

export default function SettleDetailPage() {
  const [s0, e0] = monthRange()
  const [startDate, setStartDate] = useState(s0)
  const [endDate,   setEndDate]   = useState(e0)

  const [vendors,      setVendors]      = useState([])
  const [packages,     setPackages]     = useState([])
  const [groups,       setGroups]       = useState([])
  const [history,      setHistory]      = useState([])
  const [loading,      setLoading]      = useState(false)
  const [open,         setOpen]         = useState({})
  const [dates,        setDates]        = useState({})
  const [checkedItems, setCheckedItems] = useState({}) // { [groupKey]: Set<itemIndex> }

  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*, vendor_programs(*)').order('key'),
      supabase.from('packages').select('*, package_programs(*)').order('name'),
    ]).then(([v, p]) => {
      setVendors(v.data || [])
      setPackages(p.data || [])
    })
    fetchHistory()
  }, [])

  async function fetchHistory() {
    const { data } = await supabase
      .from('settle_history')
      .select('*, settle_history_items(*), vendors(name,color)')
      .order('settled_at', { ascending: false })
    setHistory(data || [])
  }

  const compute = useCallback(async () => {
    if (!startDate || !endDate || !vendors.length || !packages.length) return
    setLoading(true)

    const { data: resv } = await supabase
      .from('reservations').select('*')
      .gte('date', startDate).lte('date', endDate)
      .neq('type', 'cancelled')

    if (!resv?.length) { setGroups([]); setCheckedItems({}); setLoading(false); return }

    const nos = resv.map(r => r.no)
    const [lcRes, rpRes, settledRes] = await Promise.all([
      supabase.from('lodge_confirms').select('*').in('reservation_no', nos),
      supabase.from('reservation_pickup').select('*, drivers(name)').in('reservation_no', nos),
      supabase
        .from('settle_history')
        .select('vendor_key, settle_type, settle_history_items(reservation_no, detail, amt)'),
    ])
    const lcs = lcRes.data || []
    const rps = rpRes.data || []
    const settled = new Set()
    ;(settledRes.data || []).forEach(h => {
      ;(h.settle_history_items || []).forEach(it => {
        settled.add(settledKey(h.settle_type, h.vendor_key, it))
      })
    })

    const vMap = {}
    for (const r of resv) {
      const pkg = packages.find(p => p.name === pkgName(r))
      if (!pkg) continue
      for (const pp of pkg.package_programs || []) {
        const vendor = vendors.find(v => v.key === pp.vendor_key)
        if (!vendor) continue
        const vp = vendor.vendor_programs?.find(x => x.prog_name === pp.prog_name)
        if (!vp) continue
        const amt = vp.settle_type === 'per_person' ? vp.unit_price * (r.pax || 0) : vp.unit_price
        const item = { no: r.no, customer: r.customer, date: r.date, pax: r.pax, detail: pp.prog_name, amt }
        if (settled.has(settledKey('체험', pp.vendor_key, item))) continue
        if (!vMap[pp.vendor_key]) {
          vMap[pp.vendor_key] = { key: pp.vendor_key, vendor: vendor.name, color: vendor.color, type: '체험', totalAmt: 0, items: [], nos: new Set() }
        }
        vMap[pp.vendor_key].items.push(item)
        vMap[pp.vendor_key].totalAmt += amt
        vMap[pp.vendor_key].nos.add(r.no)
      }
    }

    const lMap = {}
    for (const lc of lcs) {
      if (!lc.lodge_name || !lc.room_price) continue
      const r = resv.find(x => x.no === lc.reservation_no)
      if (!r) continue
      const k = lc.lodge_name
      if (!lMap[k]) lMap[k] = { key: 'lodge-' + k, vendor: k, color: 'var(--amber)', type: '숙박', totalAmt: 0, items: [], nos: new Set() }
      const item = { no: r.no, customer: r.customer, date: r.date, pax: null, detail: lc.room_name || '', amt: lc.room_price }
      if (settled.has(settledKey('숙박', null, item))) continue
      lMap[k].items.push(item)
      lMap[k].totalAmt += lc.room_price
      lMap[k].nos.add(r.no)
    }

    const pMap = {}
    for (const rp of rps) {
      if (!rp.pickup_fee) continue
      const r = resv.find(x => x.no === rp.reservation_no)
      if (!r) continue
      const k = rp.driver_id || 'unknown'
      if (!pMap[k]) pMap[k] = { key: 'pickup-' + k, vendor: rp.drivers?.name || '픽업수행자', color: 'var(--pickup)', type: '픽업', totalAmt: 0, items: [], nos: new Set() }
      const item = { no: r.no, customer: r.customer, date: r.date, pax: null, detail: rp.pickup_place || '', amt: rp.pickup_fee }
      if (settled.has(settledKey('픽업', null, item))) continue
      pMap[k].items.push(item)
      pMap[k].totalAmt += rp.pickup_fee
      pMap[k].nos.add(r.no)
    }

    const all = [...Object.values(vMap), ...Object.values(lMap), ...Object.values(pMap)]
      .filter(g => g.totalAmt > 0)
      .map(g => ({ ...g, nos: Array.from(g.nos) }))
    setGroups(all)
    setCheckedItems({})
    setLoading(false)
  }, [startDate, endDate, vendors, packages])

  useEffect(() => { compute() }, [compute])

  // 체크박스 헬퍼
  function getChecked(g) { return checkedItems[g.key] || new Set() }

  function toggleItem(groupKey, idx) {
    setCheckedItems(prev => {
      const set = new Set(prev[groupKey] || [])
      if (set.has(idx)) set.delete(idx); else set.add(idx)
      return { ...prev, [groupKey]: set }
    })
  }

  function toggleAll(g) {
    setCheckedItems(prev => {
      const set = prev[g.key] || new Set()
      const allChecked = set.size === g.items.length
      return { ...prev, [g.key]: allChecked ? new Set() : new Set(g.items.map((_, i) => i)) }
    })
  }

  // 공통 정산 처리 (선택된 items 배열 기준)
  async function doSettle(g, selectedItems, { recompute = true } = {}) {
    const selectedNos = [...new Set(selectedItems.map(it => it.no))]
    const selectedAmt = selectedItems.reduce((s, it) => s + it.amt, 0)
    const d = dates[g.key] || todayStr()
    const body = {
      settled_at: d, period_start: startDate, period_end: endDate,
      vendor_key: g.type === '체험' ? g.key : null,
      settle_type: g.type, total_amt: selectedAmt, settled_by: '관리자',
      items: selectedItems.map(it => ({ reservation_no: it.no, customer: it.customer, date: it.date, pax: it.pax || null, detail: it.detail, amt: it.amt })),
      reservation_nos: selectedNos,
    }
    const res = await fetch('/api/settle-history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) { alert('정산 처리 실패'); return }
    if (recompute) {
      await fetchHistory()
      await compute()
    }
    return true
  }

  async function settleSelected(g) {
    const checked = getChecked(g)
    if (!checked.size) { alert('정산할 항목을 선택해주세요.'); return }
    const selectedItems = g.items.filter((_, i) => checked.has(i))
    const selectedAmt = selectedItems.reduce((s, it) => s + it.amt, 0)
    const d = dates[g.key] || todayStr()
    if (!confirm(`${g.vendor} ${checked.size}건 정산 완료 처리하시겠습니까?\n정산일: ${d}\n금액: ₩${fmt(selectedAmt)}`)) return
    await doSettle(g, selectedItems)
  }

  async function settleGroup(g) {
    const d = dates[g.key] || todayStr()
    if (!confirm(`${g.vendor} 정산 완료 처리하시겠습니까?\n정산일: ${d}\n금액: ₩${fmt(g.totalAmt)}`)) return
    await doSettle(g, g.items)
  }

  async function settleAll() {
    if (!groups.length || !confirm(`미정산 ${groups.length}건 전체를 일괄 정산 완료 처리하시겠습니까?`)) return
    for (const g of groups) await doSettle(g, g.items, { recompute: false })
    await fetchHistory()
    await compute()
  }

  const total = groups.reduce((s, g) => s + g.totalAmt, 0)

  return (
    <div>
      {/* 기간 선택 바 */}
      <div className="settle-period-bar">
        <label>정산 시작일</label>
        <input type="date" className="form-input" style={{ width: '140px', height: '34px' }}
          value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span style={{ color: 'var(--text-muted)' }}>~</span>
        <label>정산 종료일</label>
        <input type="date" className="form-input" style={{ width: '140px', height: '34px' }}
          value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button className="btn-primary" style={{ height: '34px' }} onClick={compute}>조회</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>미정산 합계:</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '14px', fontWeight: 700, color: 'var(--amber)' }}>
            ₩{fmt(total)}
          </span>
        </div>
      </div>

      {/* 2단 레이아웃 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* 좌: 미정산 내역 */}
        <div>
          <div className="section-header">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              미정산 내역
              <span style={{ fontSize: '11px', background: 'rgba(247,201,72,0.15)', color: 'var(--amber)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                {groups.length}건
              </span>
            </div>
            <button className="btn-outline" style={{ height: '28px', fontSize: '11px' }} onClick={settleAll}>
              전체 정산 완료
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>조회 중...</div>
          ) : groups.length === 0 ? (
            <div className="list-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              미정산 내역이 없어요 ✓
            </div>
          ) : groups.map(g => {
            const checked = getChecked(g)
            const allChecked = g.items.length > 0 && checked.size === g.items.length
            const someChecked = checked.size > 0 && !allChecked
            const selectedAmt = g.items.filter((_, i) => checked.has(i)).reduce((s, it) => s + it.amt, 0)

            return (
              <div key={g.key} className="settle-vendor-card">
                <div className="svc-header" onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                  <div className="svc-vendor-name">{g.vendor}</div>
                  <span className="svc-type-badge" style={{ background: TYPE_BG[g.type], color: TYPE_COLOR[g.type] }}>{g.type}</span>
                  <span className="svc-amount" style={{ color: 'var(--amber)' }}>₩{fmt(g.totalAmt)}</span>
                  <span className="svc-status unsettled">미정산</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'inline-block', transform: open[g.key] ? 'rotate(180deg)' : '', transition: 'transform .2s' }}>▼</span>
                </div>
                <div className={`svc-body${open[g.key] ? ' open' : ''}`}>
                  {/* 컬럼 헤더 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 50px 1fr 90px 52px 1fr 90px', gap: '8px', padding: '8px 16px 8px 28px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border2)', background: 'var(--navy3)' }}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked }}
                      onChange={() => toggleAll(g)}
                      onClick={e => e.stopPropagation()}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px', margin: 'auto' }}
                    />
                    <span>NO</span><span>고객명</span><span>날짜</span><span>인원</span><span>내용</span><span>정산금액</span>
                  </div>
                  {/* 항목 행 */}
                  {g.items.map((it, i) => (
                    <div
                      key={i}
                      className="svc-row"
                      style={{
                        gridTemplateColumns: '28px 50px 1fr 90px 52px 1fr 90px',
                        background: checked.has(i) ? 'rgba(78,205,196,0.06)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleItem(g.key, i)}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(i)}
                        onChange={() => toggleItem(g.key, i)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px', margin: 'auto' }}
                      />
                      <span className="svc-row-no">#{it.no}</span>
                      <span style={{ fontWeight: 500 }}>{it.customer}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{it.date}</span>
                      <span style={{ fontSize: '12px' }}>{it.pax ? `${it.pax}명` : '-'}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.detail}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700 }}>₩{fmt(it.amt)}</span>
                    </div>
                  ))}
                  {/* 푸터 */}
                  <div className="svc-footer">
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {checked.size > 0 ? (
                        <>
                          선택 <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginLeft: '4px' }}>₩{fmt(selectedAmt)}</span>
                          <span style={{ color: 'var(--border2)', margin: '0 6px' }}>|</span>
                          전체 <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700, color: 'var(--amber)', marginLeft: '4px' }}>₩{fmt(g.totalAmt)}</span>
                        </>
                      ) : (
                        <>합계 <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '14px', fontWeight: 700, color: 'var(--amber)', marginLeft: '6px' }}>₩{fmt(g.totalAmt)}</span></>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="date"
                        value={dates[g.key] || todayStr()}
                        onChange={e => setDates(d => ({ ...d, [g.key]: e.target.value }))}
                        style={{ height: '30px', background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 8px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
                      />
                      <button
                        className="btn-settle-done"
                        onClick={() => settleSelected(g)}
                        disabled={checked.size === 0}
                        style={{ opacity: checked.size === 0 ? 0.4 : 1 }}
                      >
                        ✓ {checked.size > 0 ? `${checked.size}건 정산` : '선택 후 정산'}
                      </button>
                      {someChecked && (
                        <button className="btn-outline" style={{ height: '30px', fontSize: '11px' }} onClick={() => settleGroup(g)}>
                          전체 정산
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 우: 정산 완료 이력 */}
        <div>
          <div className="section-header">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              정산 완료 이력
              <span style={{ fontSize: '11px', background: 'rgba(92,184,92,0.15)', color: 'var(--green)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                {history.length}건
              </span>
            </div>
          </div>
          {history.length === 0 ? (
            <div className="list-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              정산 이력이 없어요
            </div>
          ) : history.map(h => (
            <div key={h.id} className="settle-history-card">
              <div className="shc-header">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{h.vendors?.name || h.settle_type}</div>
                  <div className="shc-date">{h.period_start} ~ {h.period_end}</div>
                </div>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: 'rgba(92,184,92,0.15)', color: 'var(--green)', fontWeight: 600 }}>정산완료</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', fontWeight: 700, color: 'var(--green)', marginLeft: '10px' }}>₩{fmt(h.total_amt)}</span>
              </div>
              {(h.settle_history_items || []).map((it, i) => (
                <div key={i} className="shc-row">
                  <span className="svc-row-no">#{it.reservation_no} {it.customer}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{it.date} · {it.detail || ''}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '12px' }}>₩{fmt(it.amt)}</span>
                </div>
              ))}
              <div style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>정산일: <span style={{ color: 'var(--text-secondary)' }}>{h.settled_at}</span></span>
                <span>처리자: {h.settled_by}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
