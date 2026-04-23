'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = n => (n || 0).toLocaleString()
const pctVal  = (used, total) => total ? Math.round(used / total * 100) : 0
const pctColor = p => p >= 90 ? 'var(--red)' : p >= 70 ? 'var(--amber)' : 'var(--accent)'

function pkgName(r) { return r.package_name || r.pkg }

function bizPeriod(biz) {
  const pad = n => String(n || 1).padStart(2, '0')
  return `${biz.start_year}-${pad(biz.start_month)}-${pad(biz.start_day)} ~ ${biz.end_year}-${pad(biz.end_month)}-${pad(biz.end_day)}`
}

export default function BizPage() {
  const [bizList,  setBizList]  = useState([])
  const [execMap,  setExecMap]  = useState({})  // biz_id → 집행금액
  const [loading,  setLoading]  = useState(true)
  const [open,     setOpen]     = useState({})

  useEffect(() => {
    async function load() {
      const [bizRes, vRes, pRes, resvRes] = await Promise.all([
        supabase.from('biz').select('*, biz_payments(*)').order('name'),
        supabase.from('vendors').select('*, vendor_programs(*)').order('key'),
        supabase.from('packages').select('*, package_programs(*)').order('name'),
        supabase.from('reservations').select('*').eq('op', '사업비').neq('type', 'cancelled'),
      ])
      const bizData  = bizRes.data  || []
      const vendors  = vRes.data    || []
      const packages = pRes.data    || []
      const resvData = resvRes.data || []

      // biz_id가 있는 예약만
      const bizResv = resvData.filter(r => r.biz_id)
      const nos = bizResv.map(r => r.no)

      let lcs = [], rps = []
      if (nos.length) {
        const [lcRes, rpRes] = await Promise.all([
          supabase.from('lodge_confirms').select('*').in('reservation_no', nos),
          supabase.from('reservation_pickup').select('*').in('reservation_no', nos),
        ])
        lcs = lcRes.data || []
        rps = rpRes.data || []
      }

      // biz_id별 집행금액 계산
      const eMap = {}
      for (const biz of bizData) eMap[biz.id] = 0

      for (const r of bizResv) {
        if (!r.biz_id || eMap[r.biz_id] === undefined) continue
        const pkg = packages.find(p => p.name === pkgName(r))
        if (!pkg) continue
        for (const pp of pkg.package_programs || []) {
          const vendor = vendors.find(v => v.key === pp.vendor_key)
          if (!vendor) continue
          const vp = vendor.vendor_programs?.find(x => x.prog_name === pp.prog_name)
          if (!vp) continue
          const amt = vp.settle_type === 'per_person' ? vp.unit_price * (r.pax || 0) : vp.unit_price
          eMap[r.biz_id] += amt
        }
      }
      for (const lc of lcs) {
        const r = bizResv.find(x => x.no === lc.reservation_no)
        if (!r?.biz_id || !lc.room_price || eMap[r.biz_id] === undefined) continue
        eMap[r.biz_id] += lc.room_price
      }
      for (const rp of rps) {
        const r = bizResv.find(x => x.no === rp.reservation_no)
        if (!r?.biz_id || !rp.pickup_fee || eMap[r.biz_id] === undefined) continue
        eMap[r.biz_id] += rp.pickup_fee
      }

      setBizList(bizData)
      setExecMap(eMap)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</div>

  const totalBudgetAll = bizList.reduce((s, b) => s + (b.biz_payments || []).reduce((a, p) => a + (p.amount || 0), 0), 0)
  const totalExecAll   = bizList.reduce((s, b) => s + (execMap[b.id] || 0), 0)

  return (
    <div>
      {/* KPI 요약 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          {[
            ['총 사업수',  bizList.length,  'var(--accent)'],
            ['총 예산',    totalBudgetAll,  'var(--text-primary)', true],
            ['총 집행액',  totalExecAll,    'var(--amber)', true],
            ['총 잔액',    totalBudgetAll - totalExecAll, totalBudgetAll - totalExecAll < 0 ? 'var(--red)' : 'var(--green)', true],
          ].map(([label, val, color, isMoney]) => (
            <div key={label}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
              <div style={{ fontSize: isMoney ? '16px' : '22px', fontWeight: 700, color, fontFamily: isMoney ? "'DM Mono',monospace" : 'inherit' }}>
                {isMoney ? `₩${fmt(val)}` : val}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 컬럼 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 120px 120px 120px 120px 80px', gap: '8px', padding: '9px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
        <span /><span>사업명</span><span>총예산</span><span>선지급금</span><span>집행금액</span><span>잔액</span><span>집행율</span>
      </div>

      {bizList.length === 0 ? (
        <div className="list-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          등록된 사업이 없어요 — 기준 정보에서 사업명을 추가해주세요
        </div>
      ) : bizList.map(biz => {
        const payments    = biz.biz_payments || []
        const totalBudget = payments.reduce((s, p) => s + (p.amount || 0), 0)
        const prePaid     = payments.filter(p => p.type === 'pre').reduce((s, p) => s + (p.amount || 0), 0)
        const exec        = execMap[biz.id] || 0
        const remain      = totalBudget - exec
        const p           = pctVal(exec, totalBudget)

        return (
          <div key={biz.id} className="list-card" style={{ marginBottom: '10px', overflow: 'hidden' }}>
            {/* 사업 행 (클릭 → 아코디언) */}
            <div
              onClick={() => setOpen(o => ({ ...o, [biz.id]: !o[biz.id] }))}
              style={{ display: 'grid', gridTemplateColumns: '28px 1fr 120px 120px 120px 120px 80px', gap: '8px', padding: '14px 16px', alignItems: 'center', cursor: 'pointer', fontSize: '13px', transition: 'background .15s' }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(78,205,196,0.04)'}
              onMouseOut={e => e.currentTarget.style.background = ''}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', transform: open[biz.id] ? 'rotate(90deg)' : '', transition: 'transform .2s', display: 'inline-block' }}>▶</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{biz.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {bizPeriod(biz)} &nbsp;·&nbsp; 지급 {payments.length}건
                </div>
              </div>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>₩{fmt(totalBudget)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--text-secondary)' }}>₩{fmt(prePaid)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace" }}>₩{fmt(exec)}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: remain < 0 ? 'var(--red)' : 'var(--accent)', fontWeight: 700 }}>
                {remain < 0 ? '-' : ''}₩{fmt(Math.abs(remain))}
              </span>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: pctColor(p) }}>{p}%</div>
                <div style={{ height: '4px', background: 'var(--navy3)', borderRadius: '2px', marginTop: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(p, 100)}%`, borderRadius: '2px', background: pctColor(p), transition: 'width .4s' }} />
                </div>
              </div>
            </div>

            {/* 상세 (아코디언 열림) */}
            {open[biz.id] && (
              <div style={{ borderTop: '1px solid var(--border2)', background: 'rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderBottom: '1px solid var(--border2)' }}>

                  {/* 지급 내역 */}
                  <div style={{ padding: '14px 16px', borderRight: '1px solid var(--border2)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.5px' }}>지급 내역</div>
                    {payments.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>지급 내역 없음</div>
                    ) : payments.map(pay => (
                      <div key={pay.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '7px 0', borderBottom: '1px solid var(--border2)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: pay.type === 'pre' ? 'rgba(78,205,196,0.1)' : 'rgba(247,201,72,0.1)', color: pay.type === 'pre' ? 'var(--accent)' : 'var(--amber)' }}>
                            {pay.type === 'pre' ? '선지급' : '후지급'}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{pay.note || ''}</span>
                        </span>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>₩{fmt(pay.amount)}</span>
                      </div>
                    ))}
                  </div>

                  {/* 예산 현황 */}
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.5px' }}>예산 현황</div>
                    {[
                      ['총 예산',   totalBudget, 'var(--text-primary)'],
                      ['선지급금',  prePaid,     'var(--text-secondary)'],
                      ['집행금액',  exec,        exec > totalBudget ? 'var(--red)' : 'var(--text-primary)'],
                      ['잔액',      remain,      remain < 0 ? 'var(--red)' : 'var(--accent)'],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '7px 0', borderBottom: '1px solid var(--border2)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600, color }}>
                          {val < 0 ? '-' : ''}₩{fmt(Math.abs(val))}
                        </span>
                      </div>
                    ))}
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        <span>집행율</span><span style={{ fontWeight: 700, color: pctColor(p) }}>{p}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--navy3)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(p, 100)}%`, borderRadius: '3px', background: pctColor(p), transition: 'width .4s' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
