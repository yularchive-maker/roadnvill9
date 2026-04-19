'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const TABS = ['업체', '구역', '패키지', '플랫폼·여행사', '픽업수행자', '사업명']

// ── 공통 모달 래퍼
function Modal({ title, onClose, onSave, onDelete, children }) {
  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          {onDelete && <button className="btn-danger" onClick={onDelete}>삭제</button>}
          <button className="btn-outline" onClick={onClose}>닫기</button>
          <button className="btn-primary" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 폼 필드 헬퍼
function Field({ label, required, auto, children }) {
  return (
    <div className="form-field">
      <label>{label}{required && <span className="req">*</span>}{auto && <span className="auto">자동</span>}</label>
      {children}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 업체 탭
// ══════════════════════════════════════════════════════
function VendorsTab() {
  const [vendors, setVendors] = useState([])
  const [modal, setModal]     = useState(null)  // null | { mode:'new'|'edit', data }
  const [form,  setForm]      = useState({})
  const [programs, setPrograms] = useState([])  // 선택 업체의 프로그램
  const [progForm, setProgForm] = useState({ prog_name:'', unit_price:'', settle_type:'per_person' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('vendors').select('*, vendor_programs(*)').order('key')
    setVendors(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew() {
    setForm({ name:'', contact:'', tel:'', color:'#4ECDC4', note:'' })
    setPrograms([])
    setProgForm({ prog_name:'', unit_price:'', settle_type:'per_person' })
    setModal({ mode:'new' })
  }

  function openEdit(v) {
    setForm({ name: v.name, contact: v.contact, tel: v.tel, color: v.color, note: v.note, key: v.key })
    setPrograms(v.vendor_programs || [])
    setProgForm({ prog_name:'', unit_price:'', settle_type:'per_person' })
    setModal({ mode:'edit', data: v })
  }

  async function save() {
    if (!form.name) { alert('업체명을 입력하세요.'); return }
    if (modal.mode === 'new') {
      const { data, error } = await supabase.rpc
        ? null : null  // key 자동생성은 API 통해서
      const res = await fetch('/api/vendors', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) })
      if (!res.ok) { alert('저장 실패'); return }
    } else {
      await supabase.from('vendors').update(form).eq('key', modal.data.key)
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}" 업체를 삭제하시겠습니까?`)) return
    await supabase.from('vendors').delete().eq('key', modal.data.key)
    setModal(null); load()
  }

  async function addProg() {
    if (!progForm.prog_name) { alert('프로그램명을 입력하세요.'); return }
    const vendorKey = modal.data?.key
    if (!vendorKey) { alert('업체를 먼저 저장하세요.'); return }
    await supabase.from('vendor_programs').insert({ ...progForm, unit_price: Number(progForm.unit_price)||0, vendor_key: vendorKey })
    setProgForm({ prog_name:'', unit_price:'', settle_type:'per_person' })
    const { data } = await supabase.from('vendor_programs').select('*').eq('vendor_key', vendorKey)
    setPrograms(data || [])
    load()
  }

  async function delProg(id) {
    await supabase.from('vendor_programs').delete().eq('id', id)
    const vk = modal.data?.key
    const { data } = await supabase.from('vendor_programs').select('*').eq('vendor_key', vk)
    setPrograms(data || [])
    load()
  }

  const inp = (k,v) => setForm(f => ({...f,[k]:v}))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">업체 목록 <span style={{fontSize:'12px',fontWeight:400,color:'var(--text-muted)'}}>{vendors.length}개</span></div>
        <button className="btn-primary" onClick={openNew}>+ 업체 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'50px 1fr 80px 120px 120px 80px'}}>
          <span>KEY</span><span>업체명</span><span>색상</span><span>담당자</span><span>연락처</span><span>프로그램</span>
        </div>
        {vendors.length === 0 && <div style={{padding:'30px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>등록된 업체 없음</div>}
        {vendors.map(v => (
          <div key={v.key} className="list-row" style={{gridTemplateColumns:'50px 1fr 80px 120px 120px 80px'}} onClick={() => openEdit(v)}>
            <span className="no-col">{v.key}</span>
            <span style={{fontWeight:500}}>{v.name}</span>
            <span><div style={{width:'18px',height:'18px',borderRadius:'4px',background:v.color,display:'inline-block'}}/></span>
            <span style={{color:'var(--text-secondary)',fontSize:'12px'}}>{v.contact||'-'}</span>
            <span style={{color:'var(--text-secondary)',fontSize:'12px'}}>{v.tel||'-'}</span>
            <span style={{color:'var(--text-muted)',fontSize:'12px'}}>{(v.vendor_programs||[]).length}개</span>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode==='new' ? '업체 추가' : '업체 수정'} onClose={()=>setModal(null)} onSave={save} onDelete={modal.mode==='edit' ? del : null}>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            {modal.mode==='edit' && (
              <Field label="업체 KEY" auto><input className="form-input auto-fill" value={form.key||''} readOnly/></Field>
            )}
            <Field label="업체명" required><input className="form-input" value={form.name||''} onChange={e=>inp('name',e.target.value)} placeholder="A업체 (애프터눈티)"/></Field>
          </div>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            <Field label="담당자"><input className="form-input" value={form.contact||''} onChange={e=>inp('contact',e.target.value)}/></Field>
            <Field label="연락처"><input className="form-input" value={form.tel||''} onChange={e=>inp('tel',e.target.value)} placeholder="010-0000-0000"/></Field>
          </div>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            <Field label="블록 색상">
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input type="color" value={form.color||'#4ECDC4'} onChange={e=>inp('color',e.target.value)} style={{width:'36px',height:'36px',padding:'2px',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--navy3)',cursor:'pointer'}}/>
                <input className="form-input" value={form.color||''} onChange={e=>inp('color',e.target.value)} style={{flex:1}}/>
              </div>
            </Field>
            <Field label="비고"><input className="form-input" value={form.note||''} onChange={e=>inp('note',e.target.value)}/></Field>
          </div>

          {/* 프로그램 서브 CRUD — 수정 모드에서만 */}
          {modal.mode === 'edit' && (
            <div style={{marginTop:'16px'}}>
              <div style={{fontSize:'10px',fontWeight:600,color:'var(--accent)',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'10px',display:'flex',alignItems:'center',gap:'8px'}}>
                프로그램 관리 <span style={{flex:1,height:'1px',background:'var(--border)',display:'block'}}/>
              </div>
              <div className="form-grid form-grid-3" style={{marginBottom:'8px'}}>
                <Field label="프로그램명"><input className="form-input" value={progForm.prog_name} onChange={e=>setProgForm(f=>({...f,prog_name:e.target.value}))}/></Field>
                <Field label="단가(원)"><input className="form-input" type="number" value={progForm.unit_price} onChange={e=>setProgForm(f=>({...f,unit_price:e.target.value}))}/></Field>
                <Field label="정산방식">
                  <select className="form-select" value={progForm.settle_type} onChange={e=>setProgForm(f=>({...f,settle_type:e.target.value}))}>
                    <option value="per_person">인원당</option>
                    <option value="fixed">고정금액</option>
                  </select>
                </Field>
              </div>
              <button className="btn-add-row" onClick={addProg} style={{marginBottom:'8px'}}>+ 프로그램 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{gridTemplateColumns:'1fr 80px 80px 40px'}}><span>프로그램명</span><span>단가</span><span>방식</span><span/></div>
                {programs.length === 0 && <div className="list-box-empty">프로그램 없음</div>}
                {programs.map(p => (
                  <div key={p.id} className="list-box-row" style={{gridTemplateColumns:'1fr 80px 80px 40px'}}>
                    <span>{p.prog_name}</span>
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px'}}>{(p.unit_price||0).toLocaleString()}</span>
                    <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{p.settle_type==='per_person'?'인원당':'고정'}</span>
                    <button className="icon-btn" onClick={()=>delProg(p.id)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 구역 탭
// ══════════════════════════════════════════════════════
function ZonesTab() {
  const [zones, setZones] = useState([])
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('zones').select('*').order('code')
    setZones(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew()  { setForm({ code:'', name:'' }); setModal({ mode:'new' }) }
  function openEdit(z){ setForm({ code: z.code, name: z.name }); setModal({ mode:'edit', data: z }) }

  async function save() {
    if (!form.code || !form.name) { alert('구역코드와 구역명을 입력하세요.'); return }
    if (modal.mode === 'new') {
      const { error } = await supabase.from('zones').insert(form)
      if (error) { alert('저장 실패: ' + error.message); return }
    } else {
      await supabase.from('zones').update({ name: form.name }).eq('code', form.code)
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}" 구역을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('zones').delete().eq('code', modal.data.code)
    if (error) { alert('삭제 실패: 이 구역을 참조하는 패키지나 예약이 있습니다.'); return }
    setModal(null); load()
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">구역 목록</div>
        <button className="btn-primary" onClick={openNew}>+ 구역 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'100px 1fr'}}>
          <span>코드</span><span>구역명</span>
        </div>
        {zones.length === 0 && <div style={{padding:'30px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>등록된 구역 없음</div>}
        {zones.map(z => (
          <div key={z.code} className="list-row" style={{gridTemplateColumns:'100px 1fr'}} onClick={() => openEdit(z)}>
            <span className="no-col">{z.code}</span>
            <span>{z.name}</span>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode==='new' ? '구역 추가' : '구역 수정'} onClose={()=>setModal(null)} onSave={save} onDelete={modal.mode==='edit' ? del : null}>
          <div className="form-grid" style={{gap:'12px'}}>
            <Field label="구역코드" required><input className="form-input" value={form.code||''} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="A0001" disabled={modal.mode==='edit'}/></Field>
            <Field label="구역명" required><input className="form-input" value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="금소마을"/></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 패키지 탭
// ══════════════════════════════════════════════════════
function PackagesTab() {
  const [packages, setPackages] = useState([])
  const [zones,    setZones]    = useState([])
  const [vendors,  setVendors]  = useState([])
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState({})
  const [progs,    setProgs]    = useState([])  // package_programs
  const [progForm, setProgForm] = useState({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:00', sort_order:0 })

  const load = useCallback(async () => {
    const [pkgR, zoneR, vendorR] = await Promise.all([
      supabase.from('packages').select('*, package_programs(*, vendors(key,name))').order('name'),
      supabase.from('zones').select('*').order('code'),
      supabase.from('vendors').select('key,name').order('key'),
    ])
    setPackages(pkgR.data || [])
    setZones(zoneR.data || [])
    setVendors(vendorR.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew() {
    setForm({ zone_code:'', name:'', pax_limit:0, total_price:0 })
    setProgs([])
    setProgForm({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:00', sort_order:0 })
    setModal({ mode:'new' })
  }

  function openEdit(p) {
    setForm({ id:p.id, zone_code:p.zone_code, name:p.name, pax_limit:p.pax_limit, total_price:p.total_price })
    setProgs(p.package_programs || [])
    setProgForm({ vendor_key:'', prog_name:'', default_start:'09:00', default_end:'10:00', sort_order:0 })
    setModal({ mode:'edit', data:p })
  }

  async function save() {
    if (!form.name) { alert('패키지명을 입력하세요.'); return }
    const payload = { zone_code: form.zone_code, name: form.name, pax_limit: Number(form.pax_limit)||0, total_price: Number(form.total_price)||0 }
    if (modal.mode === 'new') {
      const { error } = await supabase.from('packages').insert(payload)
      if (error) { alert('저장 실패: ' + error.message); return }
    } else {
      await supabase.from('packages').update(payload).eq('id', form.id)
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}" 패키지를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('packages').delete().eq('id', modal.data.id)
    if (error) { alert('삭제 실패: 이 패키지를 참조하는 예약이 있습니다.'); return }
    setModal(null); load()
  }

  async function addProg() {
    if (!modal.data?.id) { alert('패키지를 먼저 저장하세요.'); return }
    if (!progForm.vendor_key || !progForm.prog_name) { alert('업체와 프로그램명을 입력하세요.'); return }
    await supabase.from('package_programs').insert({ ...progForm, package_id: modal.data.id, sort_order: Number(progForm.sort_order)||0 })
    const { data } = await supabase.from('package_programs').select('*, vendors(key,name)').eq('package_id', modal.data.id).order('sort_order')
    setProgs(data || [])
    load()
  }

  async function delProg(id) {
    await supabase.from('package_programs').delete().eq('id', id)
    const { data } = await supabase.from('package_programs').select('*, vendors(key,name)').eq('package_id', modal.data.id).order('sort_order')
    setProgs(data || [])
    load()
  }

  const inp = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">패키지 목록</div>
        <button className="btn-primary" onClick={openNew}>+ 패키지 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'1fr 80px 90px 90px 80px'}}>
          <span>패키지명</span><span>구역</span><span>인원기준</span><span>총금액</span><span>프로그램</span>
        </div>
        {packages.length === 0 && <div style={{padding:'30px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>등록된 패키지 없음</div>}
        {packages.map(p => (
          <div key={p.id} className="list-row" style={{gridTemplateColumns:'1fr 80px 90px 90px 80px'}} onClick={() => openEdit(p)}>
            <span style={{fontWeight:500}}>{p.name}</span>
            <span className="no-col">{p.zone_code||'-'}</span>
            <span style={{fontSize:'12px'}}>{p.pax_limit ? `${p.pax_limit}명` : '-'}</span>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:'12px'}}>{(p.total_price||0).toLocaleString()}</span>
            <span style={{color:'var(--text-muted)',fontSize:'12px'}}>{(p.package_programs||[]).length}개</span>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode==='new' ? '패키지 추가' : '패키지 수정'} onClose={()=>setModal(null)} onSave={save} onDelete={modal.mode==='edit' ? del : null}>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            <Field label="패키지명" required><input className="form-input" value={form.name||''} onChange={e=>inp('name',e.target.value)} placeholder="금양연화"/></Field>
            <Field label="구역">
              <select className="form-select" value={form.zone_code||''} onChange={e=>inp('zone_code',e.target.value)}>
                <option value="">선택</option>
                {zones.map(z => <option key={z.code} value={z.code}>{z.code} · {z.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            <Field label="총 금액(원)"><input className="form-input" type="number" value={form.total_price||0} onChange={e=>inp('total_price',e.target.value)}/></Field>
            <Field label="인원 알림 기준"><input className="form-input" type="number" value={form.pax_limit||0} onChange={e=>inp('pax_limit',e.target.value)} placeholder="0=미설정"/></Field>
          </div>

          {modal.mode === 'edit' && (
            <div style={{marginTop:'16px'}}>
              <div style={{fontSize:'10px',fontWeight:600,color:'var(--accent)',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'10px',display:'flex',alignItems:'center',gap:'8px'}}>
                프로그램 일정 <span style={{flex:1,height:'1px',background:'var(--border)',display:'block'}}/>
              </div>
              <div className="form-grid form-grid-3" style={{marginBottom:'8px',gap:'8px'}}>
                <Field label="업체">
                  <select className="form-select" value={progForm.vendor_key} onChange={e=>setProgForm(f=>({...f,vendor_key:e.target.value}))}>
                    <option value="">선택</option>
                    {vendors.map(v => <option key={v.key} value={v.key}>{v.key} · {v.name.replace(/\s*\(.*\)/,'')}</option>)}
                  </select>
                </Field>
                <Field label="프로그램명"><input className="form-input" value={progForm.prog_name} onChange={e=>setProgForm(f=>({...f,prog_name:e.target.value}))}/></Field>
                <Field label="순서"><input className="form-input" type="number" value={progForm.sort_order} onChange={e=>setProgForm(f=>({...f,sort_order:e.target.value}))}/></Field>
              </div>
              <div className="form-grid form-grid-2" style={{marginBottom:'8px',gap:'8px'}}>
                <Field label="기본 시작시간"><input className="form-input" type="time" value={progForm.default_start} onChange={e=>setProgForm(f=>({...f,default_start:e.target.value}))}/></Field>
                <Field label="기본 종료시간"><input className="form-input" type="time" value={progForm.default_end} onChange={e=>setProgForm(f=>({...f,default_end:e.target.value}))}/></Field>
              </div>
              <button className="btn-add-row" onClick={addProg} style={{marginBottom:'8px'}}>+ 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{gridTemplateColumns:'30px 80px 1fr 70px 70px 30px'}}><span>순</span><span>업체</span><span>프로그램</span><span>시작</span><span>종료</span><span/></div>
                {progs.length === 0 && <div className="list-box-empty">프로그램 없음</div>}
                {progs.map(p => (
                  <div key={p.id} className="list-box-row" style={{gridTemplateColumns:'30px 80px 1fr 70px 70px 30px'}}>
                    <span style={{color:'var(--text-muted)',fontSize:'11px'}}>{p.sort_order}</span>
                    <span className="no-col">{p.vendor_key}</span>
                    <span style={{fontSize:'12px'}}>{p.prog_name}</span>
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px',color:'var(--text-muted)'}}>{p.default_start?.slice(0,5)}</span>
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px',color:'var(--text-muted)'}}>{p.default_end?.slice(0,5)}</span>
                    <button className="icon-btn" onClick={()=>delProg(p.id)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 플랫폼·여행사 탭
// ══════════════════════════════════════════════════════
function PlatformsTab() {
  const [list,  setList]  = useState([])
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('platforms').select('*').order('type').order('name')
    setList(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew()  { setForm({ type:'플랫폼', name:'', contact:'', tel:'', fee_ind:0, fee_grp:0 }); setModal({ mode:'new' }) }
  function openEdit(p){ setForm({...p}); setModal({ mode:'edit', data:p }) }

  async function save() {
    if (!form.name) { alert('이름을 입력하세요.'); return }
    const payload = { type:form.type, name:form.name, contact:form.contact||'', tel:form.tel||'', fee_ind:Number(form.fee_ind)||0, fee_grp:Number(form.fee_grp)||0 }
    if (modal.mode === 'new') {
      const { error } = await supabase.from('platforms').insert(payload)
      if (error) { alert('저장 실패'); return }
    } else {
      await supabase.from('platforms').update(payload).eq('id', form.id)
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}"을 삭제하시겠습니까?`)) return
    await supabase.from('platforms').delete().eq('id', modal.data.id)
    setModal(null); load()
  }

  const inp = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">플랫폼 · 여행사</div>
        <button className="btn-primary" onClick={openNew}>+ 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'70px 1fr 80px 100px 60px 60px'}}>
          <span>구분</span><span>이름</span><span>담당자</span><span>연락처</span><span>개인(%)</span><span>단체(%)</span>
        </div>
        {list.length === 0 && <div style={{padding:'30px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>등록된 항목 없음</div>}
        {list.map(p => (
          <div key={p.id} className="list-row" style={{gridTemplateColumns:'70px 1fr 80px 100px 60px 60px'}} onClick={() => openEdit(p)}>
            <span style={{fontSize:'11px',padding:'2px 6px',borderRadius:'4px',background: p.type==='플랫폼' ? 'rgba(78,205,196,.1)' : 'rgba(247,201,72,.1)', color: p.type==='플랫폼' ? 'var(--accent)' : 'var(--amber)',fontWeight:600}}>{p.type}</span>
            <span style={{fontWeight:500}}>{p.name}</span>
            <span style={{color:'var(--text-secondary)',fontSize:'12px'}}>{p.contact||'-'}</span>
            <span style={{color:'var(--text-secondary)',fontSize:'12px'}}>{p.tel||'-'}</span>
            <span className="no-col">{p.fee_ind}%</span>
            <span className="no-col">{p.fee_grp}%</span>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode==='new' ? '추가' : '수정'} onClose={()=>setModal(null)} onSave={save} onDelete={modal.mode==='edit' ? del : null}>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            <Field label="구분" required>
              <select className="form-select" value={form.type||'플랫폼'} onChange={e=>inp('type',e.target.value)}>
                <option value="플랫폼">플랫폼</option>
                <option value="여행사">여행사</option>
              </select>
            </Field>
            <Field label="이름" required><input className="form-input" value={form.name||''} onChange={e=>inp('name',e.target.value)}/></Field>
          </div>
          <div className="form-grid form-grid-2" style={{marginBottom:'12px'}}>
            <Field label="담당자"><input className="form-input" value={form.contact||''} onChange={e=>inp('contact',e.target.value)}/></Field>
            <Field label="연락처"><input className="form-input" value={form.tel||''} onChange={e=>inp('tel',e.target.value)}/></Field>
          </div>
          <div className="form-grid form-grid-2">
            <Field label="개인 수수료(%)"><input className="form-input fee-input" type="number" value={form.fee_ind||0} onChange={e=>inp('fee_ind',e.target.value)}/></Field>
            <Field label="단체 수수료(%)"><input className="form-input fee-input" type="number" value={form.fee_grp||0} onChange={e=>inp('fee_grp',e.target.value)}/></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 픽업수행자 탭
// ══════════════════════════════════════════════════════
function DriversTab() {
  const [list,  setList]  = useState([])
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('drivers').select('*').order('name')
    setList(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew()  { setForm({ name:'', tel:'', affil:'자체' }); setModal({ mode:'new' }) }
  function openEdit(d){ setForm({...d}); setModal({ mode:'edit', data:d }) }

  async function save() {
    if (!form.name) { alert('이름을 입력하세요.'); return }
    const payload = { name:form.name, tel:form.tel||'', affil:form.affil||'자체' }
    if (modal.mode === 'new') {
      await supabase.from('drivers').insert(payload)
    } else {
      await supabase.from('drivers').update(payload).eq('id', form.id)
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}"을 삭제하시겠습니까?`)) return
    await supabase.from('drivers').delete().eq('id', modal.data.id)
    setModal(null); load()
  }

  const inp = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">픽업수행자</div>
        <button className="btn-primary" onClick={openNew}>+ 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'1fr 120px 80px'}}>
          <span>이름</span><span>연락처</span><span>소속</span>
        </div>
        {list.length === 0 && <div style={{padding:'30px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>등록된 수행자 없음</div>}
        {list.map(d => (
          <div key={d.id} className="list-row" style={{gridTemplateColumns:'1fr 120px 80px'}} onClick={() => openEdit(d)}>
            <span style={{fontWeight:500}}>{d.name}</span>
            <span style={{color:'var(--text-secondary)',fontSize:'12px'}}>{d.tel||'-'}</span>
            <span style={{fontSize:'11px',padding:'2px 6px',borderRadius:'4px',background: d.affil==='자체' ? 'rgba(92,184,92,.1)' : 'rgba(247,201,72,.1)', color: d.affil==='자체' ? 'var(--green)' : 'var(--amber)',fontWeight:600}}>{d.affil||'-'}</span>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode==='new' ? '픽업수행자 추가' : '픽업수행자 수정'} onClose={()=>setModal(null)} onSave={save} onDelete={modal.mode==='edit' ? del : null}>
          <div className="form-grid" style={{gap:'12px'}}>
            <Field label="이름" required><input className="form-input" value={form.name||''} onChange={e=>inp('name',e.target.value)}/></Field>
            <Field label="연락처"><input className="form-input" value={form.tel||''} onChange={e=>inp('tel',e.target.value)} placeholder="010-0000-0000"/></Field>
            <Field label="소속">
              <select className="form-select" value={form.affil||'자체'} onChange={e=>inp('affil',e.target.value)}>
                <option value="자체">자체</option>
                <option value="외부">외부</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 사업명 탭
// ══════════════════════════════════════════════════════
function BizTab() {
  const [list,  setList]  = useState([])
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({})
  const [payments, setPayments] = useState([])
  const [payForm,  setPayForm]  = useState({ type:'pre', amount:'', note:'' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('biz').select('*, biz_payments(*)').order('name')
    setList(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew() {
    const now = new Date()
    setForm({ name:'', start_year:now.getFullYear(), start_month:1, start_day:1, end_year:now.getFullYear(), end_month:12, end_day:31 })
    setPayments([])
    setPayForm({ type:'pre', amount:'', note:'' })
    setModal({ mode:'new' })
  }

  function openEdit(b) {
    setForm({...b})
    setPayments(b.biz_payments || [])
    setPayForm({ type:'pre', amount:'', note:'' })
    setModal({ mode:'edit', data:b })
  }

  async function save() {
    if (!form.name) { alert('사업명을 입력하세요.'); return }
    const payload = { name:form.name, start_year:Number(form.start_year), start_month:Number(form.start_month), start_day:Number(form.start_day), end_year:Number(form.end_year), end_month:Number(form.end_month), end_day:Number(form.end_day) }
    if (modal.mode === 'new') {
      const { error } = await supabase.from('biz').insert(payload)
      if (error) { alert('저장 실패: ' + error.message); return }
    } else {
      await supabase.from('biz').update(payload).eq('id', form.id)
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}" 사업을 삭제하시겠습니까?`)) return
    await supabase.from('biz').delete().eq('id', modal.data.id)
    setModal(null); load()
  }

  async function addPay() {
    if (!modal.data?.id) { alert('사업을 먼저 저장하세요.'); return }
    if (!payForm.amount) { alert('금액을 입력하세요.'); return }
    await supabase.from('biz_payments').insert({ biz_id: modal.data.id, type: payForm.type, amount: Number(payForm.amount), note: payForm.note||'' })
    setPayForm({ type:'pre', amount:'', note:'' })
    const { data } = await supabase.from('biz_payments').select('*').eq('biz_id', modal.data.id)
    setPayments(data || [])
    load()
  }

  async function delPay(id) {
    await supabase.from('biz_payments').delete().eq('id', id)
    const { data } = await supabase.from('biz_payments').select('*').eq('biz_id', modal.data.id)
    setPayments(data || [])
    load()
  }

  const inp = (k,v) => setForm(f=>({...f,[k]:v}))
  const totalBudget = payments.reduce((s,p) => s+(p.amount||0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">사업명</div>
        <button className="btn-primary" onClick={openNew}>+ 사업 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'1fr 140px 100px'}}>
          <span>사업명</span><span>기간</span><span>총예산</span>
        </div>
        {list.length === 0 && <div style={{padding:'30px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>등록된 사업 없음</div>}
        {list.map(b => {
          const budget = (b.biz_payments||[]).reduce((s,p)=>s+(p.amount||0),0)
          return (
            <div key={b.id} className="list-row" style={{gridTemplateColumns:'1fr 140px 100px'}} onClick={()=>openEdit(b)}>
              <span style={{fontWeight:500}}>{b.name}</span>
              <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>{b.start_year}.{String(b.start_month).padStart(2,'0')}.{String(b.start_day).padStart(2,'0')} ~ {b.end_year}.{String(b.end_month).padStart(2,'0')}.{String(b.end_day).padStart(2,'0')}</span>
              <span style={{fontFamily:'DM Mono,monospace',fontSize:'12px'}}>{budget.toLocaleString()}원</span>
            </div>
          )
        })}
      </div>

      {modal && (
        <Modal title={modal.mode==='new' ? '사업 추가' : '사업 수정'} onClose={()=>setModal(null)} onSave={save} onDelete={modal.mode==='edit' ? del : null}>
          <Field label="사업명" required><input className="form-input" value={form.name||''} onChange={e=>inp('name',e.target.value)} style={{marginBottom:'12px'}}/></Field>
          <div style={{marginBottom:'12px'}}>
            <label style={{display:'block',fontSize:'11px',fontWeight:500,color:'var(--text-secondary)',marginBottom:'6px'}}>시작일</label>
            <div style={{display:'flex',gap:'6px'}}>
              <input className="form-input" type="number" value={form.start_year||''} onChange={e=>inp('start_year',e.target.value)} placeholder="년" style={{width:'80px'}}/>
              <input className="form-input" type="number" value={form.start_month||''} onChange={e=>inp('start_month',e.target.value)} placeholder="월" style={{width:'60px'}} min="1" max="12"/>
              <input className="form-input" type="number" value={form.start_day||''} onChange={e=>inp('start_day',e.target.value)} placeholder="일" style={{width:'60px'}} min="1" max="31"/>
            </div>
          </div>
          <div style={{marginBottom:'16px'}}>
            <label style={{display:'block',fontSize:'11px',fontWeight:500,color:'var(--text-secondary)',marginBottom:'6px'}}>종료일</label>
            <div style={{display:'flex',gap:'6px'}}>
              <input className="form-input" type="number" value={form.end_year||''} onChange={e=>inp('end_year',e.target.value)} placeholder="년" style={{width:'80px'}}/>
              <input className="form-input" type="number" value={form.end_month||''} onChange={e=>inp('end_month',e.target.value)} placeholder="월" style={{width:'60px'}} min="1" max="12"/>
              <input className="form-input" type="number" value={form.end_day||''} onChange={e=>inp('end_day',e.target.value)} placeholder="일" style={{width:'60px'}} min="1" max="31"/>
            </div>
          </div>

          {modal.mode === 'edit' && (
            <div>
              <div style={{fontSize:'10px',fontWeight:600,color:'var(--accent)',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'10px',display:'flex',alignItems:'center',gap:'8px'}}>
                지급금 관리 <span style={{flex:1,height:'1px',background:'var(--border)',display:'block'}}/>
              </div>
              <div className="form-grid form-grid-3" style={{marginBottom:'8px',gap:'8px'}}>
                <Field label="구분">
                  <select className="form-select" value={payForm.type} onChange={e=>setPayForm(f=>({...f,type:e.target.value}))}>
                    <option value="pre">선지급</option>
                    <option value="post">후지급</option>
                  </select>
                </Field>
                <Field label="금액(원)"><input className="form-input" type="number" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))}/></Field>
                <Field label="비고"><input className="form-input" value={payForm.note} onChange={e=>setPayForm(f=>({...f,note:e.target.value}))}/></Field>
              </div>
              <button className="btn-add-row" onClick={addPay} style={{marginBottom:'8px'}}>+ 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{gridTemplateColumns:'60px 1fr 80px 30px'}}><span>구분</span><span>비고</span><span>금액</span><span/></div>
                {payments.length === 0 && <div className="list-box-empty">등록된 지급금 없음</div>}
                {payments.map(p => (
                  <div key={p.id} className="list-box-row" style={{gridTemplateColumns:'60px 1fr 80px 30px'}}>
                    <span style={{fontSize:'11px',fontWeight:600,color: p.type==='pre' ? 'var(--accent)' : 'var(--amber)'}}>{p.type==='pre'?'선지급':'후지급'}</span>
                    <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>{p.note||'-'}</span>
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px'}}>{(p.amount||0).toLocaleString()}</span>
                    <button className="icon-btn" onClick={()=>delPay(p.id)}>✕</button>
                  </div>
                ))}
                {payments.length > 0 && (
                  <div style={{padding:'8px 12px',borderTop:'1px solid var(--border2)',display:'flex',justifyContent:'flex-end',fontSize:'12px',fontWeight:700,color:'var(--accent)'}}>
                    총 예산: {totalBudget.toLocaleString()}원
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 메인 페이지
// ══════════════════════════════════════════════════════
export default function MasterPage() {
  const [tab, setTab] = useState(0)

  const CONTENT = [<VendorsTab/>, <ZonesTab/>, <PackagesTab/>, <PlatformsTab/>, <DriversTab/>, <BizTab/>]

  return (
    <div>
      <div className="tab-bar">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn${tab===i?' active':''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      {CONTENT[tab]}
    </div>
  )
}
