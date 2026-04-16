'use client'
import { useState, useEffect, useCallback } from 'react'

// 정산금액 계산: programs.unit_price × pax (or fixed)
function calcSettleAmt(prog, pax) {
  const price = prog.unit_price || prog.override_price || 0
  if (!price) return null // 단가 미등록
  const type = prog.settle_type || 'per_person'
  return type === 'fixed' ? price : price * pax
}

// 기간 내 미정산 집계
function getUnsettled(reservations, packages, vendors, startDate, endDate) {
  const inRange = r => r.date >= startDate && r.date <= endDate && r.type !== 'cancelled'
  const expMap = {}

  reservations.filter(inRange).forEach(r => {
    const pkg = packages.find(p => p.name === r.pkg)
    if (!pkg) return
    ;(pkg.programs || []).forEach(pr => {
      const v = vendors.find(x => x.key === pr.vendor_key)
      if (!v) return
      const amt = calcSettleAmt(pr, r.pax)
      if (amt === null) return // 단가 미등록 스킵
      if (!expMap[pr.vendor_key]) {
        expMap[pr.vendor_key] = {
          vendorKey: pr.vendor_key, vendor: v.name,
          type:'체험', color: v.color||'var(--c1)',
          totalAmt:0, items:[]
        }
      }
      expMap[pr.vendor_key].items.push({
        no:r.no, customer:r.customer, date:r.date,
        pax:r.pax, detail:pr.prog_name, amt
      })
      expMap[pr.vendor_key].totalAmt += amt
    })
  })
  return Object.values(expMap)
}

const S = {
  card: { background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px', overflow:'hidden', marginBottom:'14px' },
}

function VendorCard({ v, isOpen, onToggle, onSettle, typeColor, typeBg }) {
  const [settleDate, setSettleDate] = useState(new Date().toISOString().slice(0,10))
  return (
    <div style={S.card}>
      <div onClick={onToggle}
        style={{ display:'flex', alignItems:'center', gap:'10px', padding:'14px 16px',
          borderBottom: isOpen ? '1px solid var(--border2)' : 'none',
          cursor:'pointer', transition:'background .15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(78,205,196,.04)'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:v.color, flexShrink:0 }}/>
        <div style={{ flex:1, fontWeight:'700', fontSize:'14px' }}>{v.vendor}</div>
        <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px',
          background:typeBg(v.type), color:typeColor(v.type), fontWeight:'600' }}>{v.type}</span>
        <span style={{ fontFamily:'DM Mono,monospace', fontSize:'15px', fontWeight:'700', color:'var(--amber)' }}>
          ₩{v.totalAmt.toLocaleString()}</span>
        <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'10px', fontWeight:'600',
          background:'rgba(247,201,72,.15)', color:'var(--amber)' }}>미정산</span>
        <span style={{ color:'var(--text-muted)', fontSize:'12px',
          transform: isOpen?'rotate(180deg)':'none', display:'inline-block', transition:'transform .2s' }}>▼</span>
      </div>
      {isOpen && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'50px 1fr 90px 60px 1fr 90px',
            gap:'8px', padding:'8px 16px 8px 28px', fontSize:'11px', color:'var(--text-muted)',
            fontWeight:'600', letterSpacing:'.5px', background:'rgba(0,0,0,.1)',
            borderBottom:'1px solid var(--border2)' }}>
            {['NO','고객명','날짜','인원','내용','정산금액'].map(h=><span key={h}>{h}</span>)}
          </div>
          {v.items.map((item, j) => (
            <div key={j} style={{ display:'grid', gridTemplateColumns:'50px 1fr 90px 60px 1fr 90px',
              gap:'8px', padding:'10px 16px 10px 28px', fontSize:'13px',
              borderBottom:'1px solid var(--border2)', alignItems:'center' }}>
              <span style={{ fontFamily:'DM Mono,monospace', fontSize:'11px', color:'var(--text-muted)' }}>#{item.no}</span>
              <span style={{ fontWeight:'500' }}>{item.customer}</span>
              <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>{item.date}</span>
              <span style={{ fontSize:'12px' }}>{item.pax}명</span>
              <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{item.detail}</span>
              <span style={{ fontFamily:'DM Mono,monospace', fontWeight:'700' }}>₩{item.amt.toLocaleString()}</span>
            </div>
          ))}
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border2)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            background:'rgba(0,0,0,.1)' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>
              합계 <span style={{ fontFamily:'DM Mono,monospace', fontSize:'14px', fontWeight:'700',
                color:'var(--amber)', marginLeft:'6px' }}>₩{v.totalAmt.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <input type="date" value={settleDate} onChange={e=>setSettleDate(e.target.value)}
                style={{ height:'30px', background:'var(--navy3)', border:'1px solid var(--border)',
                  borderRadius:'6px', padding:'0 8px', fontSize:'12px', color:'var(--text-primary)', outline:'none' }}/>
              <button onClick={() => onSettle(v, settleDate)}
                style={{ height:'32px', padding:'0 16px', background:'rgba(92,184,92,.15)',
                  border:'1px solid rgba(92,184,92,.2)', borderRadius:'7px',
                  color:'var(--green)', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                ✓ 정산 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettleDetailPage({ reservations, packages, vendors }) {
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().slice(0,10)

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate,   setEndDate]   = useState(lastOfMonth)
  const [openCards, setOpenCards] = useState({})
  const [history,   setHistory]   = useState([])
  const [loadingH,  setLoadingH]  = useState(true)

  const unsettled = getUnsettled(reservations, packages, vendors, startDate, endDate)
  const totalUnsettled = unsettled.reduce((s,v) => s+v.totalAmt, 0)

  // 정산 이력 로드
  const fetchHistory = useCallback(async () => {
    setLoadingH(true)
    const res = await fetch('/api/settle-history')
    const data = await res.json()
    setHistory(Array.isArray(data) ? data : [])
    setLoadingH(false)
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const toggleCard = (key) => setOpenCards(p => ({ ...p, [key]: !p[key] }))

  // 정산 완료 처리
  const handleSettle = async (v, settleDate) => {
    if (!confirm(`${v.vendor} 정산 완료 처리하시겠습니까?\n정산일: ${settleDate}\n금액: ₩${v.totalAmt.toLocaleString()}`)) return

    const payload = {
      vendor_name: v.vendor,
      vendor_key:  v.vendorKey,
      type:        v.type,
      total_amt:   v.totalAmt,
      settled_at:  settleDate,
      period_start: startDate,
      period_end:   endDate,
      items:        JSON.stringify(v.items),
    }
    const res = await fetch('/api/settle-history', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      await fetchHistory()
      alert('정산 완료 처리됐습니다.')
    } else {
      alert('처리 중 오류가 발생했습니다.')
    }
  }

  const deleteHistory = async (id) => {
    if (!confirm('이 정산 이력을 삭제하시겠습니까?')) return
    await fetch('/api/settle-history', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id })
    })
    await fetchHistory()
  }

  const typeColor = (t) => t==='체험' ? 'var(--c1)' : t==='숙박' ? 'var(--c2)' : 'var(--pickup)'
  const typeBg    = (t) => t==='체험' ? 'rgba(78,205,196,.1)' : t==='숙박' ? 'rgba(247,201,72,.1)' : 'rgba(184,184,255,.1)'

  return (
    <div>
      {/* 기간 선택 바 */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'14px 16px',
        background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'10px', marginBottom:'20px', flexWrap:'wrap' }}>
        <label style={{ fontSize:'12px', color:'var(--text-muted)', fontWeight:'500' }}>정산 시작일</label>
        <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
          style={{ height:'34px', background:'var(--navy3)', border:'1px solid var(--border)', borderRadius:'7px',
            padding:'0 10px', fontSize:'13px', color:'var(--text-primary)', outline:'none' }}/>
        <span style={{ color:'var(--text-muted)' }}>~</span>
        <label style={{ fontSize:'12px', color:'var(--text-muted)', fontWeight:'500' }}>정산 종료일</label>
        <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}
          style={{ height:'34px', background:'var(--navy3)', border:'1px solid var(--border)', borderRadius:'7px',
            padding:'0 10px', fontSize:'13px', color:'var(--text-primary)', outline:'none' }}/>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>미정산 합계</span>
          <span style={{ fontSize:'14px', fontWeight:'700', color:'var(--amber)',
            fontFamily:'DM Mono,monospace' }}>₩{totalUnsettled.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

        {/* 미정산 목록 */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <div style={{ fontWeight:'700', fontSize:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              미정산 내역
              <span style={{ fontSize:'11px', background:'rgba(247,201,72,.15)', color:'var(--amber)',
                padding:'2px 8px', borderRadius:'10px', fontWeight:'600' }}>{unsettled.length}건</span>
            </div>
          </div>

          {unsettled.length === 0 && (
            <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)',
              background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px' }}>
              ✓ 선택 기간 내 미정산 항목이 없습니다
              {vendors.some(v => !(v.programs||[]).some(p=>p.unit_price)) && (
                <div style={{ marginTop:'10px', fontSize:'12px', color:'var(--amber)' }}>
                  💡 기준정보 &gt; 업체에서 프로그램 단가를 등록해야 계산됩니다
                </div>
              )}
            </div>
          )}

          {unsettled.map((v) => (
            <VendorCard
              key={v.vendorKey}
              v={v}
              isOpen={!!openCards[v.vendorKey]}
              onToggle={() => toggleCard(v.vendorKey)}
              onSettle={handleSettle}
              typeColor={typeColor}
              typeBg={typeBg}
            />
          ))}
        </div>

        {/* 정산 이력 */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <div style={{ fontWeight:'700', fontSize:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              정산 완료 이력
              <span style={{ fontSize:'11px', background:'rgba(92,184,92,.15)', color:'var(--green)',
                padding:'2px 8px', borderRadius:'10px', fontWeight:'600' }}>{history.length}건</span>
            </div>
          </div>

          {loadingH && <div style={{ padding:'20px', textAlign:'center', color:'var(--text-muted)' }}>불러오는 중...</div>}

          {!loadingH && history.length === 0 && (
            <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)',
              background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px' }}>
              정산 이력이 없습니다
            </div>
          )}

          {history.map(h => {
            const items = (() => { try { return JSON.parse(h.items||'[]') } catch { return [] } })()
            return (
              <div key={h.id} style={{ ...S.card }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px',
                  borderBottom:'1px solid var(--border2)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', fontWeight:'700' }}>{h.vendor_name}</div>
                    <div style={{ fontSize:'11px', fontFamily:'DM Mono,monospace', color:'var(--text-muted)' }}>
                      {h.period_start} ~ {h.period_end}
                    </div>
                  </div>
                  <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'10px',
                    background:'rgba(92,184,92,.15)', color:'var(--green)', fontWeight:'600' }}>정산완료</span>
                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:'13px', fontWeight:'700', color:'var(--green)' }}>
                    ₩{(h.total_amt||0).toLocaleString()}</span>
                  <button onClick={() => deleteHistory(h.id)}
                    style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'14px' }}>✕</button>
                </div>
                {items.slice(0,3).map((item,j) => (
                  <div key={j} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'7px 14px', borderBottom:'1px solid var(--border2)', fontSize:'12px' }}>
                    <span style={{ color:'var(--text-muted)' }}>#{item.no} {item.customer}</span>
                    <span style={{ fontFamily:'DM Mono,monospace' }}>₩{(item.amt||0).toLocaleString()}</span>
                  </div>
                ))}
                {items.length > 3 && <div style={{ padding:'6px 14px', fontSize:'11px', color:'var(--text-muted)' }}>외 {items.length-3}건...</div>}
                <div style={{ padding:'8px 14px', fontSize:'11px', color:'var(--text-muted)',
                  display:'flex', justifyContent:'space-between' }}>
                  <span>정산일: {h.settled_at}</span>
                  <span>처리: {h.settled_by}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
