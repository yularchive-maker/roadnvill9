'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'

const fmt = n => (Number(n) || 0).toLocaleString()
const money = n => `₩${fmt(n)}`
const pctVal = (used, total) => total ? Math.round((used / total) * 100) : 0
const pctColor = p => p >= 100 ? 'var(--red)' : p >= 80 ? 'var(--amber)' : 'var(--accent)'

function norm(value) {
  return String(value || '').trim().toLowerCase()
}

function matchesName(value, target) {
  const a = norm(value)
  const b = norm(target)
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

function isCancelled(reservation) {
  return reservation?.type === 'cancelled' || reservation?.reservation_status === '취소'
}

function reimbursementStatus(total, reimbursed) {
  const paid = Number(reimbursed) || 0
  const amount = Number(total) || 0
  if (amount <= 0 || paid <= 0) return '미정산'
  if (paid >= amount) return '정산완료'
  return '일부정산'
}

function packageTarget(item) {
  return item?.match_package_name || item?.item_name || ''
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)
}

function usageDetailsFromRows(usages, reservations) {
  return usages
    .map(usage => {
      const reservation = reservations.find(r => r.no === usage.reservation_no)
      if (!reservation || isCancelled(reservation)) return null
      const people = Number(usage.people_count) || 0
      const amount = Number(usage.used_amount || usage.prepaid_total_amount) || people * (Number(usage.unit_amount || usage.prepaid_unit_amount) || 0)
      const reimbursed = Number(usage.reimbursed_amount) || 0
      return {
        no: reservation.no,
        date: reservation.date,
        customer: reservation.customer,
        package_name: usage.package_name || reservation.package_name,
        people,
        amount,
        reimbursed,
        unpaid: Math.max(amount - reimbursed, 0),
        target: usage.reimbursement_target || '',
        status: usage.reimbursement_status || reimbursementStatus(amount, reimbursed),
        memo: usage.reimbursement_memo || usage.memo || '',
      }
    })
    .filter(Boolean)
}

function autoProductUsage(item, reservations, snapshots) {
  const targetPackage = packageTarget(item)
  const targetProgram = item.match_program_name
  const details = []
  const counted = new Set()

  for (const reservation of reservations) {
    if (isCancelled(reservation)) continue
    if (item.biz_id && String(reservation.biz_id || '') !== String(item.biz_id)) continue

    const reservationSnapshots = snapshots.filter(s => s.reservation_no === reservation.no)
    const packageMatched =
      matchesName(reservation.package_name, targetPackage) ||
      reservationSnapshots.some(s => matchesName(s.package_name, targetPackage))
    const programMatched = targetProgram
      ? reservationSnapshots.some(s => matchesName(s.prog_name, targetProgram))
      : reservationSnapshots.some(s => matchesName(s.prog_name, item.item_name))

    if (!packageMatched && !programMatched) continue
    if (counted.has(reservation.no)) continue

    counted.add(reservation.no)
    const people = Number(reservation.pax) || 0
    details.push({
      no: reservation.no,
      date: reservation.date,
      customer: reservation.customer,
      package_name: reservation.package_name,
      people,
      amount: people * (Number(item.support_unit_amount) || 0),
    })
  }

  return {
    usedPeople: sum(details, 'people'),
    usedAmount: sum(details, 'amount'),
    details,
  }
}

function buildProductUsage(item, reservations, snapshots, budgetUsages) {
  const explicit = budgetUsages.filter(usage =>
    usage.usage_type === 'product_operation' &&
    String(usage.budget_item_id || '') === String(item.id || '')
  )
  if (explicit.length) {
    const details = usageDetailsFromRows(explicit, reservations)
    return { usedPeople: sum(details, 'people'), usedAmount: sum(details, 'amount'), details }
  }
  return autoProductUsage(item, reservations, snapshots)
}

function buildPromotionUsage(item, reservations, budgetUsages) {
  const explicit = budgetUsages.filter(usage =>
    usage.usage_type === 'promotion_discount' &&
    String(usage.budget_item_id || '') === String(item.id || '')
  )
  const details = usageDetailsFromRows(explicit, reservations)
  return {
    usedPeople: sum(details, 'people'),
    usedAmount: sum(details, 'amount'),
    reimbursedAmount: sum(details, 'reimbursed'),
    unpaidAmount: sum(details, 'unpaid'),
    details,
  }
}

function aggregateVendorRows(packageName, snapshots, reservations) {
  const activeNos = new Set(reservations.filter(r => !isCancelled(r)).map(r => r.no))
  const grouped = new Map()
  for (const snap of snapshots) {
    if (!activeNos.has(snap.reservation_no)) continue
    if (!matchesName(snap.package_name, packageName)) continue
    const key = `${snap.vendor_key || ''}|${snap.vendor_name || ''}|${snap.prog_name || ''}`
    const prev = grouped.get(key) || {
      vendor_key: snap.vendor_key,
      vendor_name: snap.vendor_name || snap.vendor_key || '-',
      prog_name: snap.prog_name || '-',
      people: 0,
      amount: 0,
    }
    prev.people += Number(snap.pax) || 0
    prev.amount += Number(snap.vendor_settle_total) || 0
    grouped.set(key, prev)
  }
  return [...grouped.values()].sort((a, b) => `${a.vendor_name}${a.prog_name}`.localeCompare(`${b.vendor_name}${b.prog_name}`))
}

export default function BizPage() {
  const [items, setItems] = useState([])
  const [reservations, setReservations] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [budgetUsages, setBudgetUsages] = useState([])
  const [bizList, setBizList] = useState([])
  const [packages, setPackages] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [tab, setTab] = useState('structure')
  const [selectedBizId, setSelectedBizId] = useState('')
  const [selectedZones, setSelectedZones] = useState([])
  const [open, setOpen] = useState({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')

  async function load() {
    setLoading(true)
    const [itemRes, reservationRes, snapshotRes, usageRes, bizRes, packageRes, zoneRes] = await Promise.all([
      supabase
        .from('biz_budget_items')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('category')
        .order('sort_order'),
      supabase
        .from('reservations')
        .select('no,date,customer,package_name,pax,type,reservation_status,biz_id,op')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('date', { ascending: false }),
      supabase
        .from('reservation_program_snapshots')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      supabase
        .from('reservation_budget_usages')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      supabase
        .from('biz')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('name'),
      supabase
        .from('packages')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('zone_code')
        .order('name'),
      supabase
        .from('zones')
        .select('*')
        .order('code'),
    ])

    setSchemaMissing(!!itemRes.error || !!usageRes.error)
    setItems(itemRes.data || [])
    setReservations(reservationRes.data || [])
    setSnapshots(snapshotRes.data || [])
    setBudgetUsages(usageRes.data || [])
    setBizList(bizRes.data || [])
    setPackages(packageRes.data || [])
    setZones(zoneRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const zoneMap = useMemo(() => {
    const map = {}
    for (const zone of zones) map[zone.code] = zone.name
    return map
  }, [zones])

  const productItems = useMemo(() => {
    return items
      .filter(item => item.is_active !== false && item.category === 'product_operation')
      .filter(item => !selectedBizId || !item.biz_id || String(item.biz_id) === String(selectedBizId))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [items, selectedBizId])

  const promotionItems = useMemo(() => {
    return items
      .filter(item => item.is_active !== false && item.category === 'promotion_discount')
      .filter(item => !selectedBizId || !item.biz_id || String(item.biz_id) === String(selectedBizId))
  }, [items, selectedBizId])

  const cards = useMemo(() => {
    return productItems.map(product => {
      const promo = promotionItems.find(item => matchesName(item.item_name, product.item_name))
      const pkg = packages.find(p => matchesName(p.name, packageTarget(product)))
      const zoneCode = pkg?.zone_code || ''
      const productUsage = buildProductUsage(product, reservations, snapshots, budgetUsages)
      const promoUsage = promo ? buildPromotionUsage(promo, reservations, budgetUsages) : { usedPeople: 0, usedAmount: 0, reimbursedAmount: 0, unpaidAmount: 0, details: [] }
      const plannedPeople = Number(product.planned_people_count) || 0
      const discountPlanPeople = Number(promo?.planned_people_count) || 0
      const normalPlanPeople = Math.max(plannedPeople - discountPlanPeople, 0)
      const totalUsedPeople = productUsage.usedPeople
      const discountUsedPeople = promoUsage.usedPeople
      const normalUsedPeople = Math.max(totalUsedPeople - discountUsedPeople, 0)
      const normalUnit = Number(product.support_unit_amount) || 0
      const discountRate = Number(promo?.support_rate) || 0
      const discountCustomerUnit = promo ? Math.round(normalUnit * (100 - discountRate) / 100) : 0
      const vendorRows = aggregateVendorRows(packageTarget(product), snapshots, reservations)

      return {
        id: product.id,
        product,
        promo,
        pkg,
        zoneCode,
        zoneName: zoneMap[zoneCode] || zoneCode || '구역 미지정',
        plannedPeople,
        normalPlanPeople,
        discountPlanPeople,
        normalUsedPeople,
        discountUsedPeople,
        totalUsedPeople,
        normalUnit,
        discountRate,
        discountCustomerUnit,
        prepaidUnit: Number(promo?.support_unit_amount) || 0,
        prepaidTotal: promoUsage.usedAmount,
        reimbursedAmount: promoUsage.reimbursedAmount,
        unpaidAmount: promoUsage.unpaidAmount,
        productUsage,
        promoUsage,
        vendorRows,
      }
    })
  }, [productItems, promotionItems, packages, reservations, snapshots, budgetUsages, zoneMap])

  const availableZones = useMemo(() => {
    const codes = [...new Set(cards.map(card => card.zoneCode).filter(Boolean))]
    return codes.map(code => ({ code, name: zoneMap[code] || code }))
  }, [cards, zoneMap])

  const visibleCards = useMemo(() => {
    if (!selectedZones.length) return cards
    return cards.filter(card => selectedZones.includes(card.zoneCode))
  }, [cards, selectedZones])

  const groupedByZone = useMemo(() => {
    const grouped = new Map()
    for (const card of visibleCards) {
      const key = card.zoneCode || 'none'
      if (!grouped.has(key)) grouped.set(key, { code: card.zoneCode, name: card.zoneName, cards: [] })
      grouped.get(key).cards.push(card)
    }
    return [...grouped.values()]
  }, [visibleCards])

  const totals = useMemo(() => {
    return {
      plannedPeople: sum(visibleCards, 'plannedPeople'),
      usedPeople: sum(visibleCards, 'totalUsedPeople'),
      discountPeople: sum(visibleCards, 'discountUsedPeople'),
      prepaid: sum(visibleCards, 'prepaidTotal'),
      unpaid: sum(visibleCards, 'unpaidAmount'),
      reimbursed: sum(visibleCards, 'reimbursedAmount'),
    }
  }, [visibleCards])

  const reimbursementRows = useMemo(() => {
    return budgetUsages
      .filter(usage => usage.usage_type === 'promotion_discount')
      .map(usage => {
        const reservation = reservations.find(r => r.no === usage.reservation_no)
        if (!reservation || isCancelled(reservation)) return null
        const prepaid = Number(usage.prepaid_total_amount || usage.used_amount) || 0
        const reimbursed = Number(usage.reimbursed_amount) || 0
        const status = usage.reimbursement_status || reimbursementStatus(prepaid, reimbursed)
        return {
          id: usage.id,
          reservation_no: usage.reservation_no,
          date: reservation.date,
          customer: reservation.customer,
          biz_name: usage.biz_name || bizList.find(b => String(b.id) === String(usage.biz_id))?.name || '-',
          zone_name: usage.zone_name || zoneMap[usage.zone_code] || usage.zone_code || '-',
          package_name: usage.package_name || reservation.package_name || '-',
          discount_label: usage.discount_label || `${Number(usage.discount_rate) || 0}% 할인`,
          people: Number(usage.people_count) || 0,
          target: usage.reimbursement_target || '-',
          prepaid,
          reimbursed,
          unpaid: Math.max(prepaid - reimbursed, 0),
          status,
        }
      })
      .filter(Boolean)
      .filter(row => !dateFrom || row.date >= dateFrom)
      .filter(row => !dateTo || row.date <= dateTo)
      .filter(row => statusFilter === '전체' || row.status === statusFilter)
  }, [budgetUsages, reservations, bizList, zoneMap, dateFrom, dateTo, statusFilter])

  function toggleZone(code) {
    setSelectedZones(prev => prev.includes(code) ? prev.filter(item => item !== code) : [...prev, code])
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>조회 중...</div>
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: '14px' }}>
        <div>
          <div className="section-title">사업비 관리</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            사업비명, 구역, 패키지별로 이용 인원과 선지급·재정산 금액을 확인합니다.
          </div>
        </div>
        <button className="btn-outline" onClick={load}>새로고침</button>
      </div>

      {schemaMissing && (
        <div className="list-card" style={{ padding: '12px 14px', marginBottom: '14px', borderColor: 'rgba(247,201,72,.35)' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--amber)', marginBottom: '4px' }}>사업비 사용 내역 테이블 확인 필요</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Supabase에서 `supabase_reservation_budget_usages_schema_20260514.sql` 실행 여부를 확인하세요.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button className={tab === 'structure' ? 'btn-primary' : 'btn-outline'} onClick={() => setTab('structure')}>사업비 구조 현황</button>
        <button className={tab === 'reimburse' ? 'btn-primary' : 'btn-outline'} onClick={() => setTab('reimburse')}>선지급 정산 내역</button>
      </div>

      {tab === 'structure' ? (
        <>
          <div className="list-card" style={{ padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'start' }}>
              <div className="form-field" style={{ margin: 0 }}>
                <label>사업비명</label>
                <select className="form-select" value={selectedBizId} onChange={e => setSelectedBizId(e.target.value)}>
                  <option value="">전체 / 미지정 포함</option>
                  {bizList.map(biz => <option key={biz.id} value={biz.id}>{biz.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>구역 체크</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className={!selectedZones.length ? 'btn-primary' : 'btn-outline'} style={{ height: '30px', padding: '0 10px', fontSize: '12px' }} onClick={() => setSelectedZones([])}>전체</button>
                  {availableZones.map(zone => (
                    <button
                      key={zone.code}
                      className={selectedZones.includes(zone.code) ? 'btn-primary' : 'btn-outline'}
                      style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
                      onClick={() => toggleZone(zone.code)}
                    >
                      {zone.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="kpi-grid" style={{ marginBottom: '16px' }}>
            <div className="kpi-card">
              <div className="kpi-label">총 계획 인원</div>
              <div className="kpi-value" style={{ fontSize: '22px' }}>{fmt(totals.plannedPeople)}명</div>
              <div className="kpi-sub">선택 구역 기준</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">실제 이용 인원</div>
              <div className="kpi-value" style={{ fontSize: '22px', color: totals.usedPeople > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{fmt(totals.usedPeople)}명</div>
              <div className="kpi-sub">할인/비할인 합산</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">할인 적용 인원</div>
              <div className="kpi-value" style={{ fontSize: '22px', color: totals.discountPeople > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{fmt(totals.discountPeople)}명</div>
              <div className="kpi-sub">명시 연결된 예약 기준</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">미정산 선지급액</div>
              <div className="kpi-value" style={{ fontSize: '22px', color: totals.unpaid > 0 ? 'var(--red)' : 'var(--green)' }}>{money(totals.unpaid)}</div>
              <div className="kpi-sub">선지급 {money(totals.prepaid)} / 정산완료 {money(totals.reimbursed)}</div>
            </div>
          </div>

          {groupedByZone.length === 0 ? (
            <div className="list-card" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>표시할 사업비 패키지가 없습니다.</div>
          ) : groupedByZone.map(group => (
            <div key={group.code || 'none'} style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 900 }}>{group.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{group.cards.length}개 패키지</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '12px' }}>
                {group.cards.map(card => {
                  const opened = !!open[card.id]
                  const progress = pctVal(card.totalUsedPeople, card.plannedPeople)
                  return (
                    <div key={card.id} className="list-card" style={{ padding: '14px', borderColor: opened ? 'rgba(78,205,196,.45)' : 'var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => setOpen(prev => ({ ...prev, [card.id]: !prev[card.id] }))}
                        style={{ width: '100%', border: 0, background: 'transparent', color: 'inherit', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '15px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.product.item_name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{card.zoneName}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '15px', fontWeight: 900 }}>총 {fmt(card.totalUsedPeople)} / {fmt(card.plannedPeople)}명</div>
                            <div style={{ fontSize: '11px', color: pctColor(progress), marginTop: '3px' }}>진행률 {progress}%</div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: '7px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '82px 82px 1fr', gap: '8px', alignItems: 'center', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '7px', padding: '8px 10px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>할인 없음</span>
                            <span style={{ fontSize: '12px', fontWeight: 800 }}>{fmt(card.normalUsedPeople)} / {fmt(card.normalPlanPeople)}명</span>
                            <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px', color: 'var(--accent)' }}>고객가 {money(card.normalUnit)}</span>
                          </div>
                          {card.promo && (
                            <div style={{ display: 'grid', gridTemplateColumns: '82px 82px 1fr auto', gap: '8px', alignItems: 'center', background: 'rgba(247,201,72,.08)', border: '1px solid rgba(247,201,72,.22)', borderRadius: '7px', padding: '8px 10px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--amber)' }}>{Number(card.discountRate)}% 할인</span>
                              <span style={{ fontSize: '12px', fontWeight: 800 }}>{fmt(card.discountUsedPeople)} / {fmt(card.discountPlanPeople)}명</span>
                              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px' }}>고객가 {money(card.discountCustomerUnit)}</span>
                              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px', color: 'var(--amber)', whiteSpace: 'nowrap' }}>선지급 {money(card.prepaidTotal)}</span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', fontSize: '11px' }}>
                          <span style={{ color: 'var(--amber)' }}>선지급 {money(card.prepaidTotal)}</span>
                          <span style={{ color: card.unpaidAmount > 0 ? 'var(--red)' : 'var(--green)' }}>미정산 {money(card.unpaidAmount)}</span>
                          <span style={{ color: 'var(--green)' }}>정산완료 {money(card.reimbursedAmount)}</span>
                        </div>
                      </button>

                      {opened && (
                        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border2)', paddingTop: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '8px' }}>패키지 구성 프로그램</div>
                          <div className="list-box" style={{ marginBottom: '12px' }}>
                            <div className="list-box-header" style={{ gridTemplateColumns: '1fr 1fr 80px 110px' }}>
                              <span>업체</span><span>프로그램</span><span>이용</span><span>업체 정산액</span>
                            </div>
                            {card.vendorRows.length === 0 ? (
                              <div className="list-box-empty">정산 스냅샷이 없습니다.</div>
                            ) : card.vendorRows.map(row => (
                              <div key={`${row.vendor_key}-${row.prog_name}`} className="list-box-row" style={{ gridTemplateColumns: '1fr 1fr 80px 110px' }}>
                                <span>{row.vendor_name}</span>
                                <span>{row.prog_name}</span>
                                <span>{fmt(row.people)}명</span>
                                <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--amber)' }}>{money(row.amount)}</span>
                              </div>
                            ))}
                          </div>

                          <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '8px' }}>선지급·재정산</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                            {[
                              ['선지급 단가', money(card.prepaidUnit)],
                              ['선지급 총액', money(card.prepaidTotal)],
                              ['정산완료액', money(card.reimbursedAmount)],
                              ['미정산액', money(card.unpaidAmount)],
                            ].map(([label, value]) => (
                              <div key={label} style={{ border: '1px solid var(--border2)', borderRadius: '8px', padding: '10px', background: 'rgba(255,255,255,.02)' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '5px' }}>{label}</div>
                                <div style={{ fontFamily: 'DM Mono,monospace', fontSize: '13px', fontWeight: 900 }}>{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="list-card" style={{ padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 150px 150px auto', gap: '10px', alignItems: 'end' }}>
              <div className="form-field" style={{ margin: 0 }}>
                <label>정산 시작일</label>
                <input className="form-input" value={dateFrom} onChange={e => setDateFrom(formatDateTyping(e.target.value))} placeholder="2026-05-01" maxLength={10} inputMode="numeric" />
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label>정산 종료일</label>
                <input className="form-input" value={dateTo} onChange={e => setDateTo(formatDateTyping(e.target.value))} placeholder="2026-05-31" maxLength={10} inputMode="numeric" />
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label>상태</label>
                <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  {['전체', '미정산', '일부정산', '정산완료'].map(value => <option key={value}>{value}</option>)}
                </select>
              </div>
              <button className="btn-outline" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter('전체') }}>초기화</button>
            </div>
          </div>

          <div className="list-card" style={{ overflow: 'hidden' }}>
            <div className="list-header" style={{ gridTemplateColumns: '86px 104px 1fr 1fr 1fr 90px 110px 110px 110px 86px' }}>
              <span>예약번호</span><span>예약일</span><span>재정산 받을 곳</span><span>사업비</span><span>패키지</span><span>인원</span><span>선지급</span><span>정산완료</span><span>미정산</span><span>상태</span>
            </div>
            {reimbursementRows.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>선지급 정산 내역이 없습니다.</div>
            ) : reimbursementRows.map(row => (
              <div key={row.id} className="list-row" style={{ gridTemplateColumns: '86px 104px 1fr 1fr 1fr 90px 110px 110px 110px 86px' }}>
                <span>#{row.reservation_no}</span>
                <span>{row.date || '-'}</span>
                <span>{row.target}</span>
                <span>{row.biz_name}</span>
                <span>{row.package_name}</span>
                <span>{fmt(row.people)}명</span>
                <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--amber)' }}>{money(row.prepaid)}</span>
                <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--green)' }}>{money(row.reimbursed)}</span>
                <span style={{ fontFamily: 'DM Mono,monospace', color: row.unpaid > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{money(row.unpaid)}</span>
                <span>{row.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
