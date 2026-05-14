'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = n => (Number(n) || 0).toLocaleString()
const pctVal = (used, total) => total ? Math.round((used / total) * 100) : 0
const pctColor = p => p >= 100 ? 'var(--red)' : p >= 80 ? 'var(--amber)' : 'var(--accent)'

const DEFAULT_BUDGET_ITEMS = [
  { id: 'default-1', category: '상품운영비', item_name: '금양연화', support_rate: 50, planned_people_count: 80, support_unit_amount: 115000, total_budget_amount: 9200000, sort_order: 10 },
  { id: 'default-2', category: '상품운영비', item_name: '삼베마을', support_rate: 40, planned_people_count: 250, support_unit_amount: 50000, total_budget_amount: 12500000, sort_order: 20 },
  { id: 'default-3', category: '상품운영비', item_name: '가보시더', support_rate: 50, planned_people_count: 80, support_unit_amount: 115000, total_budget_amount: 9200000, sort_order: 30 },
  { id: 'default-4', category: '상품운영비', item_name: '왔니껴', support_rate: 40, planned_people_count: 250, support_unit_amount: 50000, total_budget_amount: 12500000, sort_order: 40 },
  { id: 'default-5', category: '상품운영비', item_name: '암소해피2박3일', support_rate: 50, planned_people_count: 20, support_unit_amount: 200000, total_budget_amount: 4000000, sort_order: 50 },
]

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

function categoryLabel(category) {
  if (category === 'product_operation') return '상품운영비'
  if (category === 'promotion_discount') return '홍보마케팅 할인지원'
  return category || '상품운영비'
}

function usageTypeForItem(item) {
  return item.category === 'promotion_discount' ? 'promotion_discount' : 'product_operation'
}

function buildUsage(item, reservations, snapshots, budgetUsages = []) {
  const explicitUsages = budgetUsages.filter(usage =>
    String(usage.budget_item_id) === String(item.id) &&
    usage.usage_type === usageTypeForItem(item)
  )
  if (explicitUsages.length > 0) {
    const details = explicitUsages
      .map(usage => {
        const reservation = reservations.find(r => r.no === usage.reservation_no)
        if (!reservation || isCancelled(reservation)) return null
        const pax = Number(usage.people_count) || 0
        const amount = Number(usage.used_amount) || pax * (Number(usage.unit_amount) || 0)
        return {
          no: reservation.no,
          date: reservation.date,
          customer: reservation.customer,
          package_name: reservation.package_name,
          pax,
          amount,
        }
      })
      .filter(Boolean)
    const usedPeople = details.reduce((sum, row) => sum + row.pax, 0)
    const usedAmount = details.reduce((sum, row) => sum + row.amount, 0)
    return { usedPeople, usedAmount, details }
  }

  if (item.category === 'promotion_discount') {
    return { usedPeople: 0, usedAmount: 0, details: [] }
  }

  const targetPackage = item.match_package_name || item.item_name
  const targetProgram = item.match_program_name
  const details = []
  const countedReservationNos = new Set()

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
    if (countedReservationNos.has(reservation.no)) continue

    countedReservationNos.add(reservation.no)
    const pax = Number(reservation.pax) || 0
    const amount = pax * (Number(item.support_unit_amount) || 0)
    details.push({
      no: reservation.no,
      date: reservation.date,
      customer: reservation.customer,
      package_name: reservation.package_name,
      pax,
      amount,
    })
  }

  const usedPeople = details.reduce((sum, row) => sum + row.pax, 0)
  const usedAmount = details.reduce((sum, row) => sum + row.amount, 0)
  return { usedPeople, usedAmount, details }
}

export default function BizPage() {
  const [items, setItems] = useState([])
  const [reservations, setReservations] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [budgetUsages, setBudgetUsages] = useState([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [open, setOpen] = useState({})

  async function load() {
    setLoading(true)
    const [itemRes, reservationRes, snapshotRes, usageRes] = await Promise.all([
      supabase
        .from('biz_budget_items')
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('category')
        .order('sort_order'),
      supabase
        .from('reservations')
        .select('no,date,customer,package_name,pax,type,reservation_status,biz_id,op')
        .order('date', { ascending: false }),
      supabase
        .from('reservation_program_snapshots')
        .select('reservation_no,package_name,prog_name,is_deleted')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      supabase
        .from('reservation_budget_usages')
        .select('reservation_no,budget_item_id,usage_type,people_count,unit_amount,used_amount,is_deleted')
        .or('is_deleted.is.null,is_deleted.eq.false'),
    ])

    setSchemaMissing(!!itemRes.error)
    setItems(itemRes.error ? DEFAULT_BUDGET_ITEMS : (itemRes.data || []))
    setReservations(reservationRes.data || [])
    setSnapshots(snapshotRes.data || [])
    setBudgetUsages(usageRes.error ? [] : (usageRes.data || []))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    return items
      .filter(item => item.is_active !== false)
      .map(item => {
        const usage = buildUsage(item, reservations, snapshots, budgetUsages)
        const budget = Number(item.total_budget_amount) || 0
        const remain = budget - usage.usedAmount
        const plannedPeople = Number(item.planned_people_count) || 0
        const peopleRate = plannedPeople ? Math.round((usage.usedPeople / plannedPeople) * 100) : 0
        const budgetRate = pctVal(usage.usedAmount, budget)
        return { ...item, ...usage, budget, remain, plannedPeople, peopleRate, budgetRate }
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [items, reservations, snapshots, budgetUsages])

  const totalBudget = rows.reduce((sum, row) => sum + row.budget, 0)
  const totalUsed = rows.reduce((sum, row) => sum + row.usedAmount, 0)
  const totalRemain = totalBudget - totalUsed
  const totalPlannedPeople = rows.reduce((sum, row) => sum + row.plannedPeople, 0)
  const totalUsedPeople = rows.reduce((sum, row) => sum + row.usedPeople, 0)

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>조회 중...</div>
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: '16px' }}>
        <div>
          <div className="section-title">사업비 관리</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            상품운영비 기준으로 계획 인원, 사용액, 잔액을 확인합니다.
          </div>
        </div>
        <button className="btn-outline" onClick={load}>새로고침</button>
      </div>

      {schemaMissing && (
        <div className="list-card" style={{ padding: '12px 14px', marginBottom: '14px', borderColor: 'rgba(247,201,72,.35)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', marginBottom: '4px' }}>사업비 항목 테이블이 아직 없습니다</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            현재 화면은 기본 상품운영비 계획으로 미리보기 중입니다. 실제 저장/운영 전에는 Supabase에서
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'DM Mono,monospace' }}> supabase_biz_budget_items_schema_20260513.sql </span>
            실행이 필요합니다.
          </div>
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: '18px' }}>
        <div className="kpi-card">
          <div className="kpi-label">총 예산</div>
          <div className="kpi-value" style={{ fontSize: '22px' }}>₩{fmt(totalBudget)}</div>
          <div className="kpi-sub">{rows.length}개 항목</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">사용액</div>
          <div className="kpi-value" style={{ fontSize: '22px', color: totalUsed > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>₩{fmt(totalUsed)}</div>
          <div className="kpi-sub">예산 사용률 {pctVal(totalUsed, totalBudget)}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">잔액</div>
          <div className="kpi-value" style={{ fontSize: '22px', color: totalRemain < 0 ? 'var(--red)' : 'var(--green)' }}>₩{fmt(totalRemain)}</div>
          <div className="kpi-sub">{totalRemain < 0 ? '초과 사용' : '사용 가능'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">이용 인원</div>
          <div className="kpi-value" style={{ fontSize: '22px' }}>{fmt(totalUsedPeople)}명</div>
          <div className="kpi-sub">계획 {fmt(totalPlannedPeople)}명</div>
        </div>
      </div>

      <div className="list-card" style={{ overflow: 'hidden' }}>
        <div className="list-header" style={{ gridTemplateColumns: 'minmax(130px,1.2fr) 90px 100px 110px 110px 110px 110px 86px' }}>
          <span>사업비 항목</span>
          <span>지원율</span>
          <span>계획 인원</span>
          <span>기준 단가</span>
          <span>총 예산</span>
          <span>사용액</span>
          <span>잔액</span>
          <span>집행률</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 사업비 항목이 없습니다.</div>
        ) : rows.map(row => {
          const opened = !!open[row.id]
          return (
            <div key={row.id} style={{ borderTop: '1px solid var(--border2)' }}>
              <button
                type="button"
                onClick={() => setOpen(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(130px,1.2fr) 90px 100px 110px 110px 110px 110px 86px',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '14px 18px',
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.item_name}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{categoryLabel(row.category)}</span>
                </span>
                <span>{row.support_rate ? `${Number(row.support_rate)}%` : '-'}</span>
                <span>{fmt(row.usedPeople)} / {fmt(row.plannedPeople)}명</span>
                <span style={{ fontFamily: 'DM Mono,monospace' }}>₩{fmt(row.support_unit_amount)}</span>
                <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 700 }}>₩{fmt(row.budget)}</span>
                <span style={{ fontFamily: 'DM Mono,monospace', color: row.usedAmount > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>₩{fmt(row.usedAmount)}</span>
                <span style={{ fontFamily: 'DM Mono,monospace', color: row.remain < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>₩{fmt(row.remain)}</span>
                <span>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: pctColor(row.budgetRate) }}>{row.budgetRate}%</span>
                  <span style={{ display: 'block', height: '4px', background: 'var(--navy3)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(row.budgetRate, 100)}%`, background: pctColor(row.budgetRate) }} />
                  </span>
                </span>
              </button>
              {opened && (
                <div style={{ padding: '0 18px 16px 18px' }}>
                  {row.details.length === 0 ? (
                    <div style={{ padding: '14px', border: '1px dashed var(--border2)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      아직 이 항목으로 집계된 예약이 없습니다.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div className="list-box-header" style={{ gridTemplateColumns: '80px 104px 1fr 1fr 70px 110px' }}>
                        <span>예약번호</span><span>예약일</span><span>고객명</span><span>패키지</span><span>인원</span><span>사용액</span>
                      </div>
                      {row.details.map(detail => (
                        <div key={detail.no} className="list-box-row" style={{ gridTemplateColumns: '80px 104px 1fr 1fr 70px 110px' }}>
                          <span>#{detail.no}</span>
                          <span>{detail.date || '-'}</span>
                          <span>{detail.customer || '-'}</span>
                          <span>{detail.package_name || '-'}</span>
                          <span>{fmt(detail.pax)}명</span>
                          <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--amber)' }}>₩{fmt(detail.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
