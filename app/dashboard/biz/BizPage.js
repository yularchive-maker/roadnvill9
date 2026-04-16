'use client'
import { useState, useEffect, useCallback } from 'react'

const S = {
  card: { background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px', overflow:'hidden', marginBottom:'14px' },
  input: { width:'100%', height:'36px', background:'var(--navy3)', border:'1px solid var(--border)',
    borderRadius:'7px', padding:'0 12px', fontSize:'13px', color:'var(--text-primary)', outline:'none' },
  label: { fontSize:'11px', color:'var(--text-secondary)', display:'block', marginBottom:'4px', fontWeight:'600' },
}

function Modal({ open, title, onClose, onSave, children }) {
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:'14px',
        width:'100%', maxWidth:'420px' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border2)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'18px', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>{children}</div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border2)', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
          <button onClick={onClose} style={{ height:'36px', padding:'0 16px', background:'none',
            border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-secondary)',
            cursor:'pointer' }}>닫기</button>
          <button onClick={onSave} style={{ height:'36px', padding:'0 20px', background:'var(--accent)',
            border:'none', borderRadius:'8px', color:'var(--navy)', fontWeight:'700', cursor:'pointer' }}>저장</button>
        </div>
      </div>
    </div>
  )
}

export default function BizPage({ reservations }) {
  const [bizList, setBizList] = useState([])
  const [loading, setLoading] = useState(true)
  const [openBiz, setOpenBiz] = useState({})

  // 모달 상태
  const [bizModal,  setBizModal]  = useState({ open:false })
  const [venModal,  setVenModal]  = useState({ open:false, bizId:null, data:null })
  const [bizForm,   setBizForm]   = useState({ name:'', period:'', status:'진행중' })
  const [venForm,   setVenForm]   = useState({ div:'체험', vendor:'', budget:0, paid:0, used:0 })

  const fetchBiz = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/biz')
    const data = await res.json()
    setBizList(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchBiz() }, [fetchBiz])

  const saveBiz = async () => {
    if (!bizForm.name) { alert('사업명을 입력하세요.'); return }
    await fetch('/api/biz', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'add_biz', ...bizForm })
    })
    setBizModal({ open:false })
    setBizForm({ name:'', period:'', status:'진행중' })
    await fetchBiz()
  }

  const saveVen = async () => {
    if (!venForm.vendor) { alert('업체명을 입력하세요.'); return }
    const action = venModal.data ? 'update_vendor' : 'add_vendor'
    const payload = venModal.data
      ? { action, id: venModal.data.id, paid: venForm.paid, used: venForm.used }
      : { action, biz_id: venModal.bizId, ...venForm }
    await fetch('/api/biz', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    })
    setVenModal({ open:false, bizId:null, data:null })
    await fetchBiz()
  }

  const deleteBiz = async (id) => {
    if (!confirm('사업을 삭제하시겠습니까?')) return
    await fetch('/api/biz', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'del_biz', id })
    })
    await fetchBiz()
  }

  const deleteVen = async (id) => {
    if (!confirm('업체 항목을 삭제하시겠습니까?')) return
    await fetch('/api/biz', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'del_ven', id })
    })
    await fetchBiz()
  }

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>불러오는 중...</div>

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <div style={{ fontSize:'13px', color:'var(--text-secondary)' }}>
          사업별 예산/집행 현황을 관리합니다.
        </div>
        <button onClick={() => { setBizForm({ name:'', period:'', status:'진행중' }); setBizModal({ open:true }) }}
          style={{ height:'34px', padding:'0 16px', background:'var(--accent)', border:'none',
            borderRadius:'7px', color:'var(--navy)', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
          + 사업 추가
        </button>
      </div>

      {bizList.length === 0 && (
        <div style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)',
          background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px' }}>
          등록된 사업이 없습니다
        </div>
      )}

      {bizList.map(biz => {
        const vendors = biz.vendors || []
        const totalBudget  = vendors.reduce((s,v) => s+(v.budget||0), 0)
        const totalPaid    = vendors.reduce((s,v) => s+(v.paid||0), 0)
        const totalUsed    = vendors.reduce((s,v) => s+(v.used||0), 0)
        const execRate     = totalBudget > 0 ? Math.round((totalPaid+totalUsed)/totalBudget*100) : 0
        const isOpen       = openBiz[biz.id]

        return (
          <div key={biz.id} style={S.card}>
            {/* 사업 헤더 */}
            <div onClick={() => setOpenBiz(p => ({ ...p, [biz.id]: !p[biz.id] }))}
              style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px',
                cursor:'pointer', borderBottom: isOpen ? '1px solid var(--border2)' : 'none',
                transition:'background .15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(78,205,196,.04)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
                  <span style={{ fontWeight:'700', fontSize:'14px' }}>{biz.name}</span>
                  <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', fontWeight:'600',
                    background: biz.status==='진행중'?'rgba(92,184,92,.15)':'rgba(90,112,128,.15)',
                    color: biz.status==='진행중'?'var(--green)':'var(--text-muted)' }}>{biz.status}</span>
                </div>
                {biz.period && <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{biz.period}</div>}
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'4px' }}>
                  집행률 <span style={{ color:'var(--accent)', fontWeight:'700' }}>{execRate}%</span>
                </div>
                <div style={{ width:'120px', height:'6px', background:'var(--navy3)', borderRadius:'3px', overflow:'hidden' }}>
                  <div style={{ width:execRate+'%', height:'100%',
                    background: execRate>90?'var(--red)':execRate>70?'var(--amber)':'var(--accent)',
                    borderRadius:'3px', transition:'width .3s' }}/>
                </div>
              </div>
              <div style={{ display:'flex', gap:'4px' }} onClick={e=>e.stopPropagation()}>
                <button onClick={() => deleteBiz(biz.id)}
                  style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'14px' }}>✕</button>
              </div>
              <span style={{ color:'var(--text-muted)', fontSize:'12px',
                transform: isOpen?'rotate(180deg)':'none', display:'inline-block', transition:'transform .2s' }}>▼</span>
            </div>

            {/* 사업 상세 */}
            {isOpen && (
              <div>
                {/* 요약 */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0',
                  borderBottom:'1px solid var(--border2)', background:'rgba(0,0,0,.1)' }}>
                  {[
                    { label:'총예산', value:'₩'+totalBudget.toLocaleString() },
                    { label:'집행액(지급+사용)', value:'₩'+(totalPaid+totalUsed).toLocaleString(), color:'var(--amber)' },
                    { label:'잔액', value:'₩'+(totalBudget-totalPaid-totalUsed).toLocaleString(), color:'var(--accent)' },
                  ].map((k,i) => (
                    <div key={i} style={{ padding:'10px 16px', borderRight: i<2?'1px solid var(--border2)':'none' }}>
                      <div style={{ fontSize:'10px', color:'var(--text-muted)', marginBottom:'3px' }}>{k.label}</div>
                      <div style={{ fontFamily:'DM Mono,monospace', fontWeight:'700', fontSize:'14px', color:k.color||'var(--text-primary)' }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* 업체 목록 헤더 */}
                <div style={{ display:'grid', gridTemplateColumns:'60px 1fr 120px 120px 120px 100px 60px',
                  gap:'8px', padding:'8px 16px', fontSize:'11px', color:'var(--text-muted)',
                  fontWeight:'600', letterSpacing:'.5px', borderBottom:'1px solid var(--border2)' }}>
                  {['구분','업체명','예산','지급액','집행액','잔액',''].map(h=><span key={h}>{h}</span>)}
                </div>

                {vendors.map(v => {
                  const remain = (v.budget||0) - (v.paid||0) - (v.used||0)
                  return (
                    <div key={v.id} style={{ display:'grid', gridTemplateColumns:'60px 1fr 120px 120px 120px 100px 60px',
                      gap:'8px', padding:'10px 16px', fontSize:'13px',
                      borderBottom:'1px solid var(--border2)', alignItems:'center' }}>
                      <span style={{ fontSize:'11px', padding:'2px 7px', borderRadius:'4px', fontWeight:'600',
                        background:v.div==='체험'?'rgba(78,205,196,.1)':v.div==='숙박'?'rgba(247,201,72,.1)':'rgba(255,140,66,.1)',
                        color:v.div==='체험'?'var(--c1)':v.div==='숙박'?'var(--c2)':'var(--c6)' }}>{v.div}</span>
                      <span style={{ fontWeight:'500' }}>{v.vendor}</span>
                      <span style={{ fontFamily:'DM Mono,monospace', fontSize:'12px' }}>₩{(v.budget||0).toLocaleString()}</span>
                      <span style={{ fontFamily:'DM Mono,monospace', fontSize:'12px', color:'var(--amber)' }}>₩{(v.paid||0).toLocaleString()}</span>
                      <span style={{ fontFamily:'DM Mono,monospace', fontSize:'12px', color:'var(--orange)' }}>₩{(v.used||0).toLocaleString()}</span>
                      <span style={{ fontFamily:'DM Mono,monospace', fontSize:'12px', color: remain<0?'var(--red)':'var(--accent)' }}>₩{remain.toLocaleString()}</span>
                      <div style={{ display:'flex', gap:'3px' }}>
                        <button onClick={() => {
                          setVenForm({ div:v.div, vendor:v.vendor, budget:v.budget||0, paid:v.paid||0, used:v.used||0 })
                          setVenModal({ open:true, bizId:biz.id, data:v })
                        }} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'12px' }}>✎</button>
                        <button onClick={() => deleteVen(v.id)}
                          style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'12px' }}>✕</button>
                      </div>
                    </div>
                  )
                })}

                {vendors.length === 0 && (
                  <div style={{ padding:'14px 16px', fontSize:'12px', color:'var(--text-muted)' }}>
                    업체 항목이 없습니다. + 업체 추가 버튼으로 등록하세요.
                  </div>
                )}

                <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border2)' }}>
                  <button onClick={() => {
                    setVenForm({ div:'체험', vendor:'', budget:0, paid:0, used:0 })
                    setVenModal({ open:true, bizId:biz.id, data:null })
                  }} style={{ height:'30px', padding:'0 14px', background:'rgba(78,205,196,.1)',
                    border:'1px solid rgba(78,205,196,.2)', borderRadius:'6px',
                    color:'var(--accent)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>
                    + 업체 추가
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* 사업 추가 모달 */}
      <Modal open={bizModal.open} title="사업 추가" onClose={() => setBizModal({open:false})} onSave={saveBiz}>
        <div><label style={S.label}>사업명 *</label>
          <input style={S.input} value={bizForm.name} onChange={e=>setBizForm(f=>({...f,name:e.target.value}))} placeholder="2026년 살아숨쉬는고택"/></div>
        <div><label style={S.label}>사업 기간</label>
          <input style={S.input} value={bizForm.period} onChange={e=>setBizForm(f=>({...f,period:e.target.value}))} placeholder="2026-01-01 ~ 2026-12-31"/></div>
        <div><label style={S.label}>상태</label>
          <select style={S.input} value={bizForm.status} onChange={e=>setBizForm(f=>({...f,status:e.target.value}))}>
            <option>진행중</option><option>완료</option><option>취소</option>
          </select>
        </div>
      </Modal>

      {/* 업체 추가/수정 모달 */}
      <Modal open={venModal.open} title={venModal.data?'집행 내역 수정':'업체 추가'} onClose={() => setVenModal({open:false,bizId:null,data:null})} onSave={saveVen}>
        {!venModal.data && <>
          <div><label style={S.label}>구분</label>
            <select style={S.input} value={venForm.div} onChange={e=>setVenForm(f=>({...f,div:e.target.value}))}>
              {['체험','숙박','픽업','기타'].map(o=><option key={o}>{o}</option>)}
            </select></div>
          <div><label style={S.label}>업체명 *</label>
            <input style={S.input} value={venForm.vendor} onChange={e=>setVenForm(f=>({...f,vendor:e.target.value}))} placeholder="A업체"/></div>
          <div><label style={S.label}>예산 (원)</label>
            <input type="number" style={S.input} value={venForm.budget} onChange={e=>setVenForm(f=>({...f,budget:Number(e.target.value)}))}/></div>
        </>}
        <div><label style={S.label}>지급액 (원)</label>
          <input type="number" style={S.input} value={venForm.paid} onChange={e=>setVenForm(f=>({...f,paid:Number(e.target.value)}))}/></div>
        <div><label style={S.label}>집행액 (원)</label>
          <input type="number" style={S.input} value={venForm.used} onChange={e=>setVenForm(f=>({...f,used:Number(e.target.value)}))}/></div>
      </Modal>
    </div>
  )
}
