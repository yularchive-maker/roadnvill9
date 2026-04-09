'use client'
import { useState, useEffect, useCallback } from 'react'

const COLORS = ['#4ECDC4','#F7C948','#E05C5C','#7B68EE','#5CB85C','#FF8C42','#B8B8FF','#FF6B9D']

const inputStyle = {
  width:'100%', height:'36px', background:'#0f1923',
  border:'1px solid #2a3a4a', borderRadius:'7px',
  padding:'0 12px', fontSize:'13px', color:'#e8eaed', outline:'none',
  fontFamily:'Noto Sans KR, sans-serif'
}
const labelStyle = { fontSize:'11px', color:'#8a9ab0', display:'block', marginBottom:'4px', fontWeight:'600' }
const cardStyle  = { background:'#1a2535', border:'1px solid #2a3a4a', borderRadius:'12px', overflow:'hidden', marginBottom:'16px' }
const cardHeader = { padding:'13px 18px', borderBottom:'1px solid #2a3a4a', display:'flex', justifyContent:'space-between', alignItems:'center' }
const cardTitle  = { fontWeight:'700', fontSize:'14px', color:'#e8eaed' }

function Modal({ open, title, onClose, onSave, children }) {
  if (!open) return null
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px'
    }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#1a2535', border:'1px solid #2a3a4a', borderRadius:'14px', width:'100%', maxWidth:'420px' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #2a3a4a', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8a9ab0', fontSize:'18px', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>{children}</div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid #2a3a4a', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
          <button onClick={onClose} style={{ height:'36px', padding:'0 16px', background:'none', border:'1px solid #2a3a4a', borderRadius:'8px', color:'#8a9ab0', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif', fontSize:'13px' }}>닫기</button>
          <button onClick={onSave} style={{ height:'36px', padding:'0 20px', background:'#4ecdc4', border:'none', borderRadius:'8px', color:'#0f1923', fontWeight:'700', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif', fontSize:'13px' }}>저장</button>
        </div>
      </div>
    </div>
  )
}

export default function MasterPage() {
  const [vendors,  setVendors]  = useState([])
  const [zones,    setZones]    = useState([])
  const [packages, setPackages] = useState([])
  const [loading,  setLoading]  = useState(true)

  // 모달 상태
  const [vendorModal,  setVendorModal]  = useState({ open:false, data:null })
  const [zoneModal,    setZoneModal]    = useState({ open:false, data:null })
  const [pkgModal,     setPkgModal]     = useState({ open:false, data:null })
  const [progModal,    setProgModal]    = useState({ open:false, pkgId:null, data:null })
  const [openPkgs,     setOpenPkgs]     = useState({})

  // 폼 상태
  const [vForm, setVForm] = useState({ key:'', name:'', contact:'', tel:'', color:'#4ECDC4', note:'' })
  const [zForm, setZForm] = useState({ code:'', name:'' })
  const [pForm, setPForm] = useState({ zone:'', name:'' })
  const [prForm, setPrForm] = useState({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:30' })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [vRes, zRes, pkRes] = await Promise.all([
      fetch('/api/vendors').then(r=>r.json()),
      fetch('/api/zones').then(r=>r.json()),
      fetch('/api/packages').then(r=>r.json()),
    ])
    setVendors(Array.isArray(vRes) ? vRes : [])
    setZones(Array.isArray(zRes) ? zRes : [])
    setPackages(Array.isArray(pkRes) ? pkRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── 업체 저장
  const saveVendor = async () => {
    if (!vForm.key || !vForm.name) { alert('업체 키와 업체명을 입력하세요.'); return }
    if (vendorModal.data) {
      await fetch(`/api/vendors/${vendorModal.data.id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(vForm)
      })
    } else {
      await fetch('/api/vendors', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(vForm)
      })
    }
    setVendorModal({ open:false, data:null })
    await fetchAll()
  }

  const deleteVendor = async (id) => {
    if (!confirm('업체를 삭제하시겠습니까?')) return
    await fetch(`/api/vendors/${id}`, { method:'DELETE' })
    await fetchAll()
  }

  const openVendorEdit = (v) => {
    setVForm({ key:v.key, name:v.name, contact:v.contact||'', tel:v.tel||'', color:v.color||'#4ECDC4', note:v.note||'' })
    setVendorModal({ open:true, data:v })
  }

  const openVendorNew = () => {
    setVForm({ key:'', name:'', contact:'', tel:'', color:'#4ECDC4', note:'' })
    setVendorModal({ open:true, data:null })
  }

  // ── 구역 저장
  const saveZone = async () => {
    if (!zForm.code || !zForm.name) { alert('구역코드와 구역명을 입력하세요.'); return }
    await fetch('/api/zones', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(zForm)
    })
    setZoneModal({ open:false, data:null })
    setZForm({ code:'', name:'' })
    await fetchAll()
  }

  // ── 패키지 저장
  const savePkg = async () => {
    if (!pForm.name) { alert('패키지명을 입력하세요.'); return }
    if (pkgModal.data) {
      await fetch(`/api/packages/${pkgModal.data.id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pForm)
      })
    } else {
      await fetch('/api/packages', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pForm)
      })
    }
    setPkgModal({ open:false, data:null })
    await fetchAll()
  }

  const deletePkg = async (id) => {
    if (!confirm('패키지를 삭제하시겠습니까? (프로그램도 모두 삭제됩니다)')) return
    await fetch(`/api/packages/${id}`, { method:'DELETE' })
    await fetchAll()
  }

  // ── 프로그램 저장
  const saveProg = async () => {
    if (!prForm.vendor_key || !prForm.prog_name) { alert('업체와 프로그램명을 입력하세요.'); return }
    if (progModal.data) {
      await fetch('/api/programs', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ id:progModal.data.id, ...prForm })
      })
    } else {
      await fetch('/api/programs', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ package_id:progModal.pkgId, ...prForm })
      })
    }
    setProgModal({ open:false, pkgId:null, data:null })
    await fetchAll()
  }

  const deleteProg = async (id) => {
    if (!confirm('프로그램을 삭제하시겠습니까?')) return
    await fetch('/api/programs', {
      method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id })
    })
    await fetchAll()
  }

  const togglePkg = (id) => setOpenPkgs(p => ({ ...p, [id]: !p[id] }))

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'#8a9ab0' }}>불러오는 중...</div>

  return (
    <div style={{ maxWidth:'900px' }}>

      {/* ── 체험 업체 ── */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <span style={cardTitle}>체험 업체</span>
            <span style={{ fontSize:'11px', color:'#8a9ab0', marginLeft:'8px' }}>카카오 알림톡 발송 대상</span>
          </div>
          <button onClick={openVendorNew} style={{
            height:'30px', padding:'0 14px', background:'#4ecdc4', border:'none',
            borderRadius:'7px', color:'#0f1923', fontSize:'12px', fontWeight:'700',
            cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif'
          }}>+ 업체 추가</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0' }}>
          {vendors.length === 0 && (
            <div style={{ padding:'20px', color:'#8a9ab0', fontSize:'13px', gridColumn:'span 3', textAlign:'center' }}>
              등록된 업체가 없습니다
            </div>
          )}
          {vendors.map((v, i) => (
            <div key={v.id} style={{
              padding:'14px 16px',
              borderBottom:'1px solid #2a3a4a',
              borderRight: i%3!==2 ? '1px solid #2a3a4a' : 'none'
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:v.color||'#4ECDC4', flexShrink:0 }}/>
                  <span style={{ fontWeight:'700', fontSize:'13px' }}>{v.name}</span>
                  <span style={{
                    fontSize:'10px', padding:'1px 6px', background:'#0f1923',
                    border:'1px solid #2a3a4a', borderRadius:'4px', color:'#8a9ab0'
                  }}>{v.key}</span>
                </div>
                <div style={{ display:'flex', gap:'4px' }}>
                  <button onClick={() => openVendorEdit(v)} style={{ background:'none', border:'none', color:'#8a9ab0', cursor:'pointer', fontSize:'13px' }}>✎</button>
                  <button onClick={() => deleteVendor(v.id)} style={{ background:'none', border:'none', color:'#e05c5c', cursor:'pointer', fontSize:'13px' }}>✕</button>
                </div>
              </div>
              <div style={{ fontSize:'12px', color:'#8a9ab0', display:'flex', flexDirection:'column', gap:'2px' }}>
                <div>👤 {v.contact||'담당자 미입력'}</div>
                <div style={{ fontFamily:'monospace' }}>📞 {v.tel||'연락처 미입력'}</div>
                {v.note && <div style={{ fontSize:'11px' }}>📝 {v.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 구역 ── */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <span style={cardTitle}>구역</span>
          <button onClick={() => { setZForm({code:'',name:''}); setZoneModal({open:true,data:null}) }} style={{
            height:'30px', padding:'0 14px', background:'none', border:'1px solid #2a3a4a',
            borderRadius:'7px', color:'#8a9ab0', fontSize:'12px', cursor:'pointer',
            fontFamily:'Noto Sans KR, sans-serif'
          }}>+ 추가</button>
        </div>
        {zones.length === 0 && <div style={{ padding:'16px 18px', fontSize:'13px', color:'#8a9ab0' }}>등록된 구역이 없습니다</div>}
        {zones.map(z => (
          <div key={z.id} style={{ padding:'11px 18px', borderBottom:'1px solid #2a3a4a', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'13px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'11px', padding:'2px 8px', background:'rgba(78,205,196,0.1)', color:'#4ecdc4', borderRadius:'4px', fontFamily:'monospace' }}>{z.code}</span>
              <span style={{ fontWeight:'500' }}>{z.name}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 패키지 ── */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <span style={cardTitle}>패키지 · 프로그램</span>
          <button onClick={() => { setPForm({zone:'',name:''}); setPkgModal({open:true,data:null}) }} style={{
            height:'30px', padding:'0 14px', background:'none', border:'1px solid #2a3a4a',
            borderRadius:'7px', color:'#8a9ab0', fontSize:'12px', cursor:'pointer',
            fontFamily:'Noto Sans KR, sans-serif'
          }}>+ 패키지 추가</button>
        </div>
        {packages.length === 0 && <div style={{ padding:'16px 18px', fontSize:'13px', color:'#8a9ab0' }}>등록된 패키지가 없습니다</div>}
        {packages.map(pkg => {
          const progs = pkg.programs || []
          const vendorKeys = [...new Set(progs.map(p => p.vendor_key))]
          return (
            <div key={pkg.id} style={{ borderBottom:'1px solid #2a3a4a' }}>
              {/* 패키지 헤더 */}
              <div style={{
                padding:'12px 18px', cursor:'pointer', display:'flex',
                alignItems:'center', justifyContent:'space-between'
              }} onClick={() => togglePkg(pkg.id)}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'11px', color:'#8a9ab0', transition:'transform .2s',
                    display:'inline-block', transform: openPkgs[pkg.id]?'rotate(90deg)':'rotate(0deg)' }}>▶</span>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      {pkg.zone && <span style={{ fontSize:'10px', padding:'1px 7px', background:'rgba(78,205,196,0.1)', color:'#4ecdc4', borderRadius:'4px', fontFamily:'monospace' }}>{pkg.zone}</span>}
                      <span style={{ fontWeight:'600', fontSize:'13px' }}>{pkg.name}</span>
                    </div>
                    <div style={{ display:'flex', gap:'4px', marginTop:'4px', flexWrap:'wrap' }}>
                      {vendorKeys.map(k => {
                        const v = vendors.find(x => x.key === k)
                        return <div key={k} style={{ width:'8px', height:'8px', borderRadius:'50%', background:v?.color||'#4ECDC4' }} title={v?.name||k}/>
                      })}
                      <span style={{ fontSize:'11px', color:'#8a9ab0', marginLeft:'2px' }}>프로그램 {progs.length}개 · 업체 {vendorKeys.length}곳</span>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => {
                    setPrForm({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:30' })
                    setProgModal({ open:true, pkgId:pkg.id, data:null })
                  }} style={{
                    height:'26px', padding:'0 10px', background:'rgba(78,205,196,0.1)',
                    border:'1px solid rgba(78,205,196,0.3)', borderRadius:'6px',
                    color:'#4ecdc4', fontSize:'11px', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif'
                  }}>+ 프로그램</button>
                  <button onClick={() => {
                    setPForm({ zone:pkg.zone||'', name:pkg.name })
                    setPkgModal({ open:true, data:pkg })
                  }} style={{ background:'none', border:'none', color:'#8a9ab0', cursor:'pointer', fontSize:'13px' }}>✎</button>
                  <button onClick={() => deletePkg(pkg.id)} style={{ background:'none', border:'none', color:'#e05c5c', cursor:'pointer', fontSize:'13px' }}>✕</button>
                </div>
              </div>

              {/* 프로그램 목록 */}
              {openPkgs[pkg.id] && (
                <div style={{ background:'rgba(0,0,0,0.15)' }}>
                  {progs.length === 0 && (
                    <div style={{ padding:'12px 48px', fontSize:'12px', color:'#8a9ab0' }}>
                      프로그램이 없습니다. + 프로그램 버튼으로 추가하세요.
                    </div>
                  )}
                  {progs.map(pr => {
                    const v = vendors.find(x => x.key === pr.vendor_key)
                    return (
                      <div key={pr.id} style={{
                        padding:'10px 18px 10px 48px', borderTop:'1px solid #2a3a4a',
                        display:'flex', alignItems:'center', justifyContent:'space-between'
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:v?.color||'#4ECDC4', flexShrink:0 }}/>
                          <div>
                            <div style={{ fontSize:'13px', fontWeight:'600' }}>{pr.prog_name}</div>
                            <div style={{ fontSize:'11px', color:'#8a9ab0', marginTop:'1px' }}>
                              {v?.name||pr.vendor_key}
                              {pr.default_start && ` · ${pr.default_start}~${pr.default_end}`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:'4px' }}>
                          <button onClick={() => {
                            setPrForm({ vendor_key:pr.vendor_key, prog_name:pr.prog_name, default_start:pr.default_start||'09:00', default_end:pr.default_end||'10:30' })
                            setProgModal({ open:true, pkgId:pkg.id, data:pr })
                          }} style={{ background:'none', border:'none', color:'#8a9ab0', cursor:'pointer', fontSize:'13px' }}>✎</button>
                          <button onClick={() => deleteProg(pr.id)} style={{ background:'none', border:'none', color:'#e05c5c', cursor:'pointer', fontSize:'13px' }}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 업체 모달 ── */}
      <Modal open={vendorModal.open} title={vendorModal.data ? '업체 수정' : '업체 추가'}
        onClose={() => setVendorModal({open:false,data:null})} onSave={saveVendor}>
        <div><label style={labelStyle}>업체 키 (A, B, C...)</label>
          <input style={inputStyle} value={vForm.key} onChange={e=>setVForm(f=>({...f,key:e.target.value}))} placeholder="A" maxLength={2}/></div>
        <div><label style={labelStyle}>업체명 *</label>
          <input style={inputStyle} value={vForm.name} onChange={e=>setVForm(f=>({...f,name:e.target.value}))} placeholder="A업체 (애프터눈티)"/></div>
        <div><label style={labelStyle}>담당자 성함</label>
          <input style={inputStyle} value={vForm.contact} onChange={e=>setVForm(f=>({...f,contact:e.target.value}))} placeholder="홍길동"/></div>
        <div><label style={labelStyle}>연락처</label>
          <input style={inputStyle} value={vForm.tel} onChange={e=>setVForm(f=>({...f,tel:e.target.value}))} placeholder="010-0000-0000"/></div>
        <div><label style={labelStyle}>표시 색상</label>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <input type="color" value={vForm.color} onChange={e=>setVForm(f=>({...f,color:e.target.value}))}
              style={{ width:'40px', height:'36px', border:'1px solid #2a3a4a', borderRadius:'6px', background:'none', cursor:'pointer', padding:'2px' }}/>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              {COLORS.map(c=>(
                <div key={c} onClick={()=>setVForm(f=>({...f,color:c}))}
                  style={{ width:'24px', height:'24px', borderRadius:'50%', background:c, cursor:'pointer',
                    border: vForm.color===c ? '2px solid white' : '2px solid transparent' }}/>
              ))}
            </div>
          </div>
        </div>
        <div><label style={labelStyle}>메모</label>
          <input style={inputStyle} value={vForm.note} onChange={e=>setVForm(f=>({...f,note:e.target.value}))} placeholder=""/></div>
      </Modal>

      {/* ── 구역 모달 ── */}
      <Modal open={zoneModal.open} title="구역 추가"
        onClose={() => setZoneModal({open:false,data:null})} onSave={saveZone}>
        <div><label style={labelStyle}>구역코드 *</label>
          <input style={inputStyle} value={zForm.code} onChange={e=>setZForm(f=>({...f,code:e.target.value}))} placeholder="A0001"/></div>
        <div><label style={labelStyle}>구역명 *</label>
          <input style={inputStyle} value={zForm.name} onChange={e=>setZForm(f=>({...f,name:e.target.value}))} placeholder="금소마을"/></div>
      </Modal>

      {/* ── 패키지 모달 ── */}
      <Modal open={pkgModal.open} title={pkgModal.data ? '패키지 수정' : '패키지 추가'}
        onClose={() => setPkgModal({open:false,data:null})} onSave={savePkg}>
        <div><label style={labelStyle}>구역코드</label>
          <select style={inputStyle} value={pForm.zone} onChange={e=>setPForm(f=>({...f,zone:e.target.value}))}>
            <option value="">선택</option>
            {zones.map(z=><option key={z.id} value={z.code}>{z.code} · {z.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>패키지명 *</label>
          <input style={inputStyle} value={pForm.name} onChange={e=>setPForm(f=>({...f,name:e.target.value}))} placeholder="금양연화"/></div>
      </Modal>

      {/* ── 프로그램 모달 ── */}
      <Modal open={progModal.open} title={progModal.data ? '프로그램 수정' : '프로그램 추가'}
        onClose={() => setProgModal({open:false,pkgId:null,data:null})} onSave={saveProg}>
        <div><label style={labelStyle}>담당 업체 *</label>
          <select style={inputStyle} value={prForm.vendor_key} onChange={e=>setPrForm(f=>({...f,vendor_key:e.target.value}))}>
            <option value="">업체 선택</option>
            {vendors.map(v=><option key={v.id} value={v.key}>{v.key} — {v.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>프로그램명 *</label>
          <input style={inputStyle} value={prForm.prog_name} onChange={e=>setPrForm(f=>({...f,prog_name:e.target.value}))} placeholder="쿠킹클래스, 조식, 전통주 페어링 등"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div><label style={labelStyle}>기본 시작 시간</label>
            <input type="time" style={inputStyle} value={prForm.default_start} onChange={e=>setPrForm(f=>({...f,default_start:e.target.value}))}/></div>
          <div><label style={labelStyle}>기본 종료 시간</label>
            <input type="time" style={inputStyle} value={prForm.default_end} onChange={e=>setPrForm(f=>({...f,default_end:e.target.value}))}/></div>
        </div>
        <div style={{ padding:'10px 12px', background:'#0f1923', borderRadius:'8px', fontSize:'11px', color:'#8a9ab0', lineHeight:'1.6' }}>
          💡 같은 업체가 여러 프로그램을 담당할 수 있어요.<br/>
          예) A업체 — 조식 / A업체 — 쿠킹클래스 / A업체 — 전통주 페어링
        </div>
      </Modal>

    </div>
  )
}
