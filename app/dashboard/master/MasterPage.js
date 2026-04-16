'use client'
import { useState, useEffect, useCallback } from 'react'

const COLORS = ['#4ECDC4','#F7C948','#E05C5C','#7B68EE','#5CB85C','#FF8C42','#B8B8FF','#FF6B9D']
const SETTLE_TYPES = [{ value:'per_person', label:'인원×단가' }, { value:'fixed', label:'건당고정' }]

const inp = {
  width:'100%', height:'36px', background:'var(--navy3)',
  border:'1px solid var(--border)', borderRadius:'7px',
  padding:'0 12px', fontSize:'13px', color:'var(--text-primary)', outline:'none',
}
const lbl = { fontSize:'11px', color:'var(--text-secondary)', display:'block', marginBottom:'4px', fontWeight:'600' }
const card = { background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:'12px', overflow:'hidden', marginBottom:'16px' }
const cardHdr = { padding:'13px 18px', borderBottom:'1px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }

function Modal({ open, title, onClose, onSave, onDelete, children }) {
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:'14px',
        width:'100%', maxWidth:'460px', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border2)',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'18px', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px', overflowY:'auto', flex:1 }}>{children}</div>
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border2)',
          display:'flex', justifyContent:'flex-end', gap:'8px', flexShrink:0 }}>
          {onDelete && <button onClick={onDelete} style={{ height:'36px', padding:'0 14px',
            background:'rgba(224,92,92,.1)', border:'1px solid rgba(224,92,92,.2)', borderRadius:'8px',
            color:'var(--red)', cursor:'pointer', marginRight:'auto', fontSize:'13px' }}>삭제</button>}
          <button onClick={onClose} style={{ height:'36px', padding:'0 16px', background:'none',
            border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-secondary)', cursor:'pointer' }}>닫기</button>
          <button onClick={onSave} style={{ height:'36px', padding:'0 20px', background:'var(--accent)',
            border:'none', borderRadius:'8px', color:'var(--navy)', fontWeight:'700', cursor:'pointer' }}>저장</button>
        </div>
      </div>
    </div>
  )
}

export default function MasterPage() {
  const [vendors,  setVendors]  = useState([])
  const [zones,    setZones]    = useState([])
  const [packages, setPackages] = useState([])
  const [lodges,   setLodges]   = useState([])
  const [loading,  setLoading]  = useState(true)

  // 모달
  const [vendorModal, setVendorModal] = useState({ open:false, data:null })
  const [zoneModal,   setZoneModal]   = useState({ open:false, data:null })
  const [pkgModal,    setPkgModal]    = useState({ open:false, data:null })
  const [progModal,   setProgModal]   = useState({ open:false, pkgId:null, data:null })
  const [vpModal,     setVpModal]     = useState({ open:false, vendorId:null, data:null }) // vendor programs
  const [lodgeModal,  setLodgeModal]  = useState({ open:false, data:null })

  // 폼
  const [vForm,  setVForm]  = useState({ key:'', name:'', contact:'', tel:'', color:'#4ECDC4', note:'' })
  const [zForm,  setZForm]  = useState({ code:'', name:'' })
  const [pForm,  setPForm]  = useState({ zone:'', name:'', pax_limit:'' })
  const [prForm, setPrForm] = useState({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:30', override_price:'' })
  const [vpForm, setVpForm] = useState({ prog_name:'', unit_price:0, settle_type:'per_person' })
  const [lgForm, setLgForm] = useState({ vendor:'', color:'#5CB85C' })

  // 열기 상태
  const [openPkgs,   setOpenPkgs]   = useState({})
  const [openVendors,setOpenVendors]= useState({})

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [vRes, zRes, pkRes, lgRes] = await Promise.all([
      fetch('/api/vendors').then(r=>r.json()),
      fetch('/api/zones').then(r=>r.json()),
      fetch('/api/packages').then(r=>r.json()),
      fetch('/api/lodges').then(r=>r.json()),
    ])
    setVendors(Array.isArray(vRes) ? vRes : [])
    setZones(Array.isArray(zRes) ? zRes : [])
    setPackages(Array.isArray(pkRes) ? pkRes : [])
    setLodges(Array.isArray(lgRes) ? lgRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── 업체 저장
  const saveVendor = async () => {
    if (!vForm.key || !vForm.name) { alert('업체 키와 업체명을 입력하세요.'); return }
    if (vendorModal.data) {
      await fetch(`/api/vendors/${vendorModal.data.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(vForm) })
    } else {
      await fetch('/api/vendors', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(vForm) })
    }
    setVendorModal({ open:false, data:null }); await fetchAll()
  }
  const deleteVendor = async (id) => {
    if (!confirm('업체를 삭제하시겠습니까?')) return
    await fetch(`/api/vendors/${id}`, { method:'DELETE' }); await fetchAll()
  }

  // ── 구역 저장
  const saveZone = async () => {
    if (!zForm.code || !zForm.name) { alert('구역코드와 구역명을 입력하세요.'); return }
    if (zoneModal.data) {
      await fetch(`/api/zones`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:zoneModal.data.id, ...zForm }) })
    } else {
      await fetch('/api/zones', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(zForm) })
    }
    setZoneModal({ open:false, data:null }); setZForm({ code:'', name:'' }); await fetchAll()
  }

  // ── 패키지 저장
  const savePkg = async () => {
    if (!pForm.name) { alert('패키지명을 입력하세요.'); return }
    if (pkgModal.data) {
      await fetch(`/api/packages/${pkgModal.data.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pForm) })
    } else {
      await fetch('/api/packages', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pForm) })
    }
    setPkgModal({ open:false, data:null }); await fetchAll()
  }
  const deletePkg = async (id) => {
    if (!confirm('패키지를 삭제하시겠습니까?')) return
    await fetch(`/api/packages/${id}`, { method:'DELETE' }); await fetchAll()
  }

  // ── 프로그램 저장
  const saveProg = async () => {
    if (!prForm.vendor_key || !prForm.prog_name) { alert('업체와 프로그램명을 입력하세요.'); return }
    if (progModal.data) {
      await fetch('/api/programs', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:progModal.data.id, ...prForm }) })
    } else {
      await fetch('/api/programs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ package_id:progModal.pkgId, ...prForm }) })
    }
    setProgModal({ open:false, pkgId:null, data:null }); await fetchAll()
  }
  const deleteProg = async (id) => {
    if (!confirm('프로그램을 삭제하시겠습니까?')) return
    await fetch('/api/programs', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id }) }); await fetchAll()
  }

  // ── 업체 단가 저장 (vendors 테이블의 programs JSONB 컬럼 — 또는 별도 API)
  // vendor.programs 배열을 PUT으로 업데이트
  const saveVendorProg = async () => {
    if (!vpForm.prog_name) { alert('프로그램명을 입력하세요.'); return }
    if (!vpForm.unit_price) { alert('단가를 입력하세요.'); return }
    const vendor = vendors.find(v => v.id === vpModal.vendorId)
    if (!vendor) return
    const progs = [...(vendor.vendor_programs||[])]
    if (vpModal.data !== null && vpModal.data >= 0) {
      progs[vpModal.data] = { ...vpForm }
    } else {
      progs.push({ ...vpForm })
    }
    await fetch(`/api/vendors/${vendor.id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ vendor_programs: progs })
    })
    setVpModal({ open:false, vendorId:null, data:null }); await fetchAll()
  }
  const deleteVendorProg = async (vendorId, idx) => {
    if (!confirm('단가를 삭제하시겠습니까?')) return
    const vendor = vendors.find(v => v.id === vendorId)
    if (!vendor) return
    const progs = [...(vendor.vendor_programs||[])]
    progs.splice(idx, 1)
    await fetch(`/api/vendors/${vendor.id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ vendor_programs: progs })
    })
    await fetchAll()
  }

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>불러오는 중...</div>

  const btnAdd = (onClick) => (
    <button onClick={onClick} style={{ height:'30px', padding:'0 14px', background:'var(--accent)',
      border:'none', borderRadius:'7px', color:'var(--navy)', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
      + 추가
    </button>
  )

  return (
    <div style={{ maxWidth:'960px' }}>

      {/* ══ 체험 업체 ══ */}
      <div style={card}>
        <div style={cardHdr}>
          <div>
            <span style={{ fontWeight:'700', fontSize:'14px' }}>체험 업체</span>
            <span style={{ fontSize:'11px', color:'var(--text-muted)', marginLeft:'8px' }}>단가 등록 후 정산 자동계산</span>
          </div>
          <button onClick={() => { setVForm({ key:'', name:'', contact:'', tel:'', color:'#4ECDC4', note:'' }); setVendorModal({ open:true, data:null }) }}
            style={{ height:'30px', padding:'0 14px', background:'var(--accent)', border:'none', borderRadius:'7px',
              color:'var(--navy)', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>+ 업체 추가</button>
        </div>

        {vendors.length === 0 && (
          <div style={{ padding:'20px', color:'var(--text-muted)', fontSize:'13px', textAlign:'center' }}>등록된 업체가 없습니다</div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0' }}>
          {vendors.map((v, i) => {
            const vprogs = v.vendor_programs || []
            const isOpen = openVendors[v.id]
            return (
              <div key={v.id} style={{ borderBottom:'1px solid var(--border2)', borderRight: i%3!==2?'1px solid var(--border2)':'none' }}>
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:v.color||'#4ECDC4', flexShrink:0 }}/>
                      <span style={{ fontWeight:'700', fontSize:'13px' }}>{v.name}</span>
                      <span style={{ fontSize:'10px', padding:'1px 6px', background:'rgba(78,205,196,.1)',
                        border:'1px solid var(--border2)', borderRadius:'4px', color:'var(--text-muted)' }}>{v.key}</span>
                    </div>
                    <div style={{ display:'flex', gap:'4px' }}>
                      <button onClick={() => { setVForm({ key:v.key, name:v.name, contact:v.contact||'', tel:v.tel||'', color:v.color||'#4ECDC4', note:v.note||'' }); setVendorModal({ open:true, data:v }) }}
                        style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'13px' }}>✎</button>
                      <button onClick={() => deleteVendor(v.id)}
                        style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'13px' }}>✕</button>
                    </div>
                  </div>
                  <div style={{ fontSize:'12px', color:'var(--text-muted)', display:'flex', flexDirection:'column', gap:'2px', marginBottom:'8px' }}>
                    <div>👤 {v.contact||'담당자 미입력'}</div>
                    <div style={{ fontFamily:'monospace' }}>📞 {v.tel||'연락처 미입력'}</div>
                  </div>
                  {/* 단가 토글 */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <button onClick={() => setOpenVendors(p=>({...p,[v.id]:!p[v.id]}))}
                      style={{ height:'26px', padding:'0 10px', background:'rgba(78,205,196,.08)',
                        border:'1px solid var(--border)', borderRadius:'5px', color:'var(--accent)',
                        fontSize:'11px', cursor:'pointer' }}>
                      💰 단가 {vprogs.length}건 {isOpen?'▲':'▼'}
                    </button>
                    <button onClick={() => { setVpForm({ prog_name:'', unit_price:0, settle_type:'per_person' }); setVpModal({ open:true, vendorId:v.id, data:-1 }) }}
                      style={{ height:'26px', padding:'0 8px', background:'rgba(78,205,196,.1)',
                        border:'1px solid rgba(78,205,196,.2)', borderRadius:'5px',
                        color:'var(--accent)', fontSize:'11px', cursor:'pointer' }}>+ 단가</button>
                  </div>
                  {isOpen && vprogs.length > 0 && (
                    <div style={{ marginTop:'8px', borderRadius:'6px', overflow:'hidden', border:'1px solid var(--border2)' }}>
                      {vprogs.map((p, pi) => (
                        <div key={pi} style={{ display:'flex', alignItems:'center', padding:'7px 10px',
                          borderBottom: pi<vprogs.length-1?'1px solid var(--border2)':'none',
                          fontSize:'12px', gap:'8px' }}>
                          <span style={{ flex:1, fontWeight:'500' }}>{p.prog_name}</span>
                          <span style={{ fontFamily:'DM Mono,monospace', color:'var(--accent)' }}>₩{(p.unit_price||0).toLocaleString()}</span>
                          <span style={{ fontSize:'10px', padding:'1px 5px', borderRadius:'4px',
                            background:'rgba(78,205,196,.1)', color:'var(--accent)' }}>
                            {SETTLE_TYPES.find(t=>t.value===p.settle_type)?.label||'인원×단가'}
                          </span>
                          <button onClick={() => { setVpForm({ prog_name:p.prog_name, unit_price:p.unit_price||0, settle_type:p.settle_type||'per_person' }); setVpModal({ open:true, vendorId:v.id, data:pi }) }}
                            style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'11px' }}>✎</button>
                          <button onClick={() => deleteVendorProg(v.id, pi)}
                            style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'11px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ 구역 ══ */}
      <div style={card}>
        <div style={cardHdr}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>구역</span>
          <button onClick={() => { setZForm({code:'',name:''}); setZoneModal({open:true,data:null}) }}
            style={{ height:'30px', padding:'0 14px', background:'none', border:'1px solid var(--border)',
              borderRadius:'7px', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer' }}>+ 추가</button>
        </div>
        {zones.length === 0 && <div style={{ padding:'16px 18px', fontSize:'13px', color:'var(--text-muted)' }}>등록된 구역이 없습니다</div>}
        {zones.map(z => (
          <div key={z.id} style={{ padding:'11px 18px', borderBottom:'1px solid var(--border2)',
            display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'13px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'11px', padding:'2px 8px', background:'rgba(78,205,196,.1)',
                color:'var(--accent)', borderRadius:'4px', fontFamily:'monospace' }}>{z.code}</span>
              <span style={{ fontWeight:'500' }}>{z.name}</span>
            </div>
            <div style={{ display:'flex', gap:'4px' }}>
              <button onClick={() => { setZForm({code:z.code,name:z.name}); setZoneModal({open:true,data:z}) }}
                style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'13px' }}>✎</button>
            </div>
          </div>
        ))}
      </div>

      {/* ══ 패키지 ══ */}
      <div style={card}>
        <div style={cardHdr}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>패키지 · 프로그램</span>
          <button onClick={() => { setPForm({zone:'',name:'',pax_limit:''}); setPkgModal({open:true,data:null}) }}
            style={{ height:'30px', padding:'0 14px', background:'none', border:'1px solid var(--border)',
              borderRadius:'7px', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer' }}>+ 패키지 추가</button>
        </div>
        {packages.length === 0 && <div style={{ padding:'16px 18px', fontSize:'13px', color:'var(--text-muted)' }}>등록된 패키지가 없습니다</div>}
        {packages.map(pkg => {
          const progs = pkg.programs || []
          const vendorKeys = [...new Set(progs.map(p=>p.vendor_key))]
          return (
            <div key={pkg.id} style={{ borderBottom:'1px solid var(--border2)' }}>
              <div style={{ padding:'12px 18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                onClick={() => setOpenPkgs(p=>({...p,[pkg.id]:!p[pkg.id]}))}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'11px', color:'var(--text-muted)', display:'inline-block',
                    transform: openPkgs[pkg.id]?'rotate(90deg)':'rotate(0deg)', transition:'transform .2s' }}>▶</span>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      {pkg.zone && <span style={{ fontSize:'10px', padding:'1px 7px', background:'rgba(78,205,196,.1)',
                        color:'var(--accent)', borderRadius:'4px', fontFamily:'monospace' }}>{pkg.zone}</span>}
                      <span style={{ fontWeight:'600', fontSize:'13px' }}>{pkg.name}</span>
                      {pkg.pax_limit && <span style={{ fontSize:'11px', color:'var(--amber)' }}>인원한도 {pkg.pax_limit}명</span>}
                    </div>
                    <div style={{ display:'flex', gap:'4px', marginTop:'4px', flexWrap:'wrap' }}>
                      {vendorKeys.map(k => { const v=vendors.find(x=>x.key===k); return (
                        <div key={k} style={{ width:'8px', height:'8px', borderRadius:'50%', background:v?.color||'#4ECDC4' }} title={v?.name||k}/>
                      )})}
                      <span style={{ fontSize:'11px', color:'var(--text-muted)', marginLeft:'2px' }}>
                        프로그램 {progs.length}개 · 업체 {vendorKeys.length}곳
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px' }} onClick={e=>e.stopPropagation()}>
                  <button onClick={() => { setPrForm({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:30', override_price:'' }); setProgModal({ open:true, pkgId:pkg.id, data:null }) }}
                    style={{ height:'26px', padding:'0 10px', background:'rgba(78,205,196,.1)', border:'1px solid rgba(78,205,196,.3)',
                      borderRadius:'6px', color:'var(--accent)', fontSize:'11px', cursor:'pointer' }}>+ 프로그램</button>
                  <button onClick={() => { setPForm({ zone:pkg.zone||'', name:pkg.name, pax_limit:pkg.pax_limit||'' }); setPkgModal({ open:true, data:pkg }) }}
                    style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'13px' }}>✎</button>
                  <button onClick={() => deletePkg(pkg.id)}
                    style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'13px' }}>✕</button>
                </div>
              </div>

              {openPkgs[pkg.id] && (
                <div style={{ background:'rgba(0,0,0,.15)' }}>
                  {progs.length === 0 && (
                    <div style={{ padding:'12px 48px', fontSize:'12px', color:'var(--text-muted)' }}>프로그램이 없습니다.</div>
                  )}
                  {progs.map(pr => {
                    const v = vendors.find(x=>x.key===pr.vendor_key)
                    return (
                      <div key={pr.id} style={{ padding:'10px 18px 10px 48px', borderTop:'1px solid var(--border2)',
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:v?.color||'#4ECDC4', flexShrink:0 }}/>
                          <div>
                            <div style={{ fontSize:'13px', fontWeight:'600' }}>{pr.prog_name}</div>
                            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
                              {v?.name||pr.vendor_key}
                              {pr.default_start && ` · ${pr.default_start}~${pr.default_end}`}
                              {pr.override_price ? ` · 단가오버라이드 ₩${Number(pr.override_price).toLocaleString()}` : ''}
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:'4px' }}>
                          <button onClick={() => {
                            setPrForm({ vendor_key:pr.vendor_key, prog_name:pr.prog_name, default_start:pr.default_start||'09:00', default_end:pr.default_end||'10:30', override_price:pr.override_price||'' })
                            setProgModal({ open:true, pkgId:pkg.id, data:pr })
                          }} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'13px' }}>✎</button>
                          <button onClick={() => deleteProg(pr.id)} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'13px' }}>✕</button>
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

      {/* ══ 숙소 ══ */}
      <div style={card}>
        <div style={cardHdr}>
          <div>
            <span style={{ fontWeight:'700', fontSize:'14px' }}>숙소 · 객실</span>
            <span style={{ fontSize:'11px', color:'var(--text-muted)', marginLeft:'8px' }}>전화확인 후 수동입력</span>
          </div>
          <button onClick={() => { setLgForm({ vendor:'', color:'#5CB85C' }); setLodgeModal({ open:true, data:null }) }}
            style={{ height:'30px', padding:'0 14px', background:'none', border:'1px solid var(--border)',
              borderRadius:'7px', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer' }}>+ 숙소 추가</button>
        </div>
        {lodges.length === 0 && (
          <div style={{ padding:'16px 18px', fontSize:'13px', color:'var(--text-muted)' }}>
            등록된 숙소가 없습니다. Supabase에 lodges 테이블이 필요합니다.
          </div>
        )}
        {lodges.map(lg => (
          <div key={lg.id} style={{ borderBottom:'1px solid var(--border2)', padding:'12px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:lg.color||'var(--c5)', flexShrink:0 }}/>
                <span style={{ fontWeight:'600', fontSize:'13px' }}>{lg.vendor || lg.name}</span>
              </div>
              <button onClick={async () => {
                if (!confirm('숙소를 삭제하시겠습니까?')) return
                await fetch('/api/lodges', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:lg.id }) })
                fetchAll()
              }} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'13px' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ══ 모달들 ══ */}

      {/* 업체 모달 */}
      <Modal open={vendorModal.open} title={vendorModal.data?'업체 수정':'업체 추가'}
        onClose={() => setVendorModal({open:false,data:null})} onSave={saveVendor}
        onDelete={vendorModal.data ? () => deleteVendor(vendorModal.data.id) : null}>
        <div><label style={lbl}>업체 키 (A, B, C...)</label>
          <input style={inp} value={vForm.key} onChange={e=>setVForm(f=>({...f,key:e.target.value}))} placeholder="A" maxLength={2}/></div>
        <div><label style={lbl}>업체명 *</label>
          <input style={inp} value={vForm.name} onChange={e=>setVForm(f=>({...f,name:e.target.value}))} placeholder="A업체 (애프터눈티)"/></div>
        <div><label style={lbl}>담당자</label>
          <input style={inp} value={vForm.contact} onChange={e=>setVForm(f=>({...f,contact:e.target.value}))} placeholder="홍길동"/></div>
        <div><label style={lbl}>연락처</label>
          <input style={inp} value={vForm.tel} onChange={e=>setVForm(f=>({...f,tel:e.target.value}))} placeholder="010-0000-0000"/></div>
        <div><label style={lbl}>표시 색상</label>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <input type="color" value={vForm.color} onChange={e=>setVForm(f=>({...f,color:e.target.value}))}
              style={{ width:'40px', height:'36px', border:'1px solid var(--border)', borderRadius:'6px', background:'none', cursor:'pointer', padding:'2px' }}/>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              {COLORS.map(c=>(
                <div key={c} onClick={()=>setVForm(f=>({...f,color:c}))}
                  style={{ width:'24px', height:'24px', borderRadius:'50%', background:c, cursor:'pointer',
                    border: vForm.color===c?'2px solid white':'2px solid transparent' }}/>
              ))}
            </div>
          </div>
        </div>
        <div><label style={lbl}>메모</label>
          <input style={inp} value={vForm.note} onChange={e=>setVForm(f=>({...f,note:e.target.value}))}/></div>
      </Modal>

      {/* 업체 단가 모달 */}
      <Modal open={vpModal.open} title={vpModal.data >= 0 ? '단가 수정' : '단가 추가'}
        onClose={() => setVpModal({open:false,vendorId:null,data:null})} onSave={saveVendorProg}>
        <div><label style={lbl}>프로그램명 *</label>
          <input style={inp} value={vpForm.prog_name} onChange={e=>setVpForm(f=>({...f,prog_name:e.target.value}))} placeholder="애프터눈티, 쿠킹클래스 등"/></div>
        <div><label style={lbl}>단가 (원) *</label>
          <input type="number" style={inp} value={vpForm.unit_price} onChange={e=>setVpForm(f=>({...f,unit_price:Number(e.target.value)}))} placeholder="15000"/></div>
        <div><label style={lbl}>정산방식</label>
          <select style={inp} value={vpForm.settle_type} onChange={e=>setVpForm(f=>({...f,settle_type:e.target.value}))}>
            {SETTLE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div style={{ padding:'10px 12px', background:'var(--navy3)', borderRadius:'8px', fontSize:'11px', color:'var(--text-muted)' }}>
          💡 인원×단가: 참여인원 × 단가<br/>건당고정: 예약 1건당 고정금액
        </div>
      </Modal>

      {/* 구역 모달 */}
      <Modal open={zoneModal.open} title={zoneModal.data?'구역 수정':'구역 추가'}
        onClose={() => setZoneModal({open:false,data:null})} onSave={saveZone}>
        <div><label style={lbl}>구역코드 *</label>
          <input style={inp} value={zForm.code} onChange={e=>setZForm(f=>({...f,code:e.target.value}))} placeholder="A0001"/></div>
        <div><label style={lbl}>구역명 *</label>
          <input style={inp} value={zForm.name} onChange={e=>setZForm(f=>({...f,name:e.target.value}))} placeholder="금소마을"/></div>
      </Modal>

      {/* 패키지 모달 */}
      <Modal open={pkgModal.open} title={pkgModal.data?'패키지 수정':'패키지 추가'}
        onClose={() => setPkgModal({open:false,data:null})} onSave={savePkg}
        onDelete={pkgModal.data ? () => deletePkg(pkgModal.data.id) : null}>
        <div><label style={lbl}>구역코드</label>
          <select style={inp} value={pForm.zone} onChange={e=>setPForm(f=>({...f,zone:e.target.value}))}>
            <option value="">선택</option>
            {zones.map(z=><option key={z.id} value={z.code}>{z.code} · {z.name}</option>)}
          </select></div>
        <div><label style={lbl}>패키지명 *</label>
          <input style={inp} value={pForm.name} onChange={e=>setPForm(f=>({...f,name:e.target.value}))} placeholder="금양연화"/></div>
        <div><label style={lbl}>인원 한도 (달력 경고 기준)</label>
          <input type="number" style={inp} value={pForm.pax_limit} onChange={e=>setPForm(f=>({...f,pax_limit:e.target.value}))} placeholder="20"/></div>
      </Modal>

      {/* 프로그램 모달 */}
      <Modal open={progModal.open} title={progModal.data?'프로그램 수정':'프로그램 추가'}
        onClose={() => setProgModal({open:false,pkgId:null,data:null})} onSave={saveProg}
        onDelete={progModal.data ? () => deleteProg(progModal.data.id) : null}>
        <div><label style={lbl}>담당 업체 *</label>
          <select style={inp} value={prForm.vendor_key} onChange={e=>setPrForm(f=>({...f,vendor_key:e.target.value}))}>
            <option value="">업체 선택</option>
            {vendors.map(v=><option key={v.id} value={v.key}>{v.key} — {v.name}</option>)}
          </select></div>
        <div><label style={lbl}>프로그램명 *</label>
          <input style={inp} value={prForm.prog_name} onChange={e=>setPrForm(f=>({...f,prog_name:e.target.value}))} placeholder="애프터눈티"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div><label style={lbl}>기본 시작 시간</label>
            <input type="time" style={inp} value={prForm.default_start} onChange={e=>setPrForm(f=>({...f,default_start:e.target.value}))}/></div>
          <div><label style={lbl}>기본 종료 시간</label>
            <input type="time" style={inp} value={prForm.default_end} onChange={e=>setPrForm(f=>({...f,default_end:e.target.value}))}/></div>
        </div>
        <div><label style={lbl}>단가 오버라이드 (비워두면 업체 기본단가 사용)</label>
          <input type="number" style={inp} value={prForm.override_price} onChange={e=>setPrForm(f=>({...f,override_price:e.target.value}))} placeholder="(선택사항)"/></div>
      </Modal>

      {/* 숙소 모달 */}
      <Modal open={lodgeModal.open} title="숙소 추가" onClose={() => setLodgeModal({open:false,data:null})}
        onSave={async () => {
          if (!lgForm.vendor) { alert('숙소명을 입력하세요.'); return }
          await fetch('/api/lodges', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lgForm) })
          setLodgeModal({ open:false, data:null }); await fetchAll()
        }}>
        <div><label style={lbl}>숙소명 *</label>
          <input style={inp} value={lgForm.vendor} onChange={e=>setLgForm(f=>({...f,vendor:e.target.value}))} placeholder="길쌈, 만초고택 등"/></div>
        <div><label style={lbl}>표시 색상</label>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {COLORS.map(c=>(
              <div key={c} onClick={()=>setLgForm(f=>({...f,color:c}))}
                style={{ width:'24px', height:'24px', borderRadius:'50%', background:c, cursor:'pointer',
                  border: lgForm.color===c?'2px solid white':'2px solid transparent' }}/>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
