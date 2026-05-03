'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const TABS = ['구역', '체험업체', '패키지', '숙소·객실', '플랫폼·여행사', '픽업수행자', '사업명']

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

function Field({ label, required, auto, children }) {
  return (
    <div className="form-field">
      <label>{label}{required && <span className="req">*</span>}{auto && <span className="auto">자동</span>}</label>
      {children}
    </div>
  )
}

// ── 코드 자동생성 유틸
async function genZoneCode() {
  const { data } = await supabase.from('zones').select('code').like('code', 'A%')
  const nums = (data || []).map(z => parseInt(String(z.code || '').replace(/\D/g, ''), 10)).filter(n => Number.isFinite(n))
  if (!nums.length) return 'A0001'
  const n = Math.max(...nums) + 1
  return 'A' + String(n).padStart(4, '0')
}

async function genVendorKey() {
  const { data } = await supabase.from('vendors').select('key').like('key', 'V%')
  const nums = (data || []).map(v => parseInt(String(v.key || '').replace(/\D/g, ''), 10)).filter(n => Number.isFinite(n))
  if (!nums.length) return 'V001'
  const n = Math.max(...nums) + 1
  return 'V' + String(n).padStart(3, '0')
}

async function genPackageCode(zoneCode) {
  if (!zoneCode) return ''
  const prefix = `PKG-${zoneCode}-`
  const { data } = await supabase.from('packages').select('code').like('code', `${prefix}%`)
  if (!data?.length || !data[0]?.code) return `${prefix}001`
  const nums = data.map(p => parseInt(String(p.code || '').slice(prefix.length), 10)).filter(n => Number.isFinite(n))
  if (!nums.length) return `${prefix}001`
  const n = Math.max(...nums) + 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

async function genProgCode(zoneCode, vendorKey, table = 'vendor_programs') {
  if (!zoneCode || !vendorKey) return ''
  const prefix = `${zoneCode}-${vendorKey}-P`
  const { data } = await supabase.from(table).select('code').like('code', `${prefix}%`)
  if (!data?.length || !data[0]?.code) return `${prefix}01`
  const nums = data.map(p => parseInt(String(p.code || '').split('-P').pop(), 10)).filter(n => Number.isFinite(n))
  if (!nums.length) return `${prefix}01`
  const n = Math.max(...nums) + 1
  return `${prefix}${String(n).padStart(2, '0')}`
}

// ══════════════════════════════════════════════════════
// 구역 탭
// ══════════════════════════════════════════════════════
function ZonesTab() {
  const [zones, setZones] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('zones').select('*').order('code')
    setZones(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function openNew() {
    const code = await genZoneCode()
    setForm({ code, name: '' })
    setModal({ mode: 'new' })
  }

  function openEdit(z) {
    setForm({ code: z.code, name: z.name })
    setModal({ mode: 'edit', data: z })
  }

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
        <div className="section-title">구역 목록 <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{zones.length}개</span></div>
        <button className="btn-primary" onClick={openNew}>+ 구역 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{ gridTemplateColumns: '120px 1fr' }}>
          <span>코드</span><span>구역명</span>
        </div>
        {zones.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 구역 없음</div>}
        {zones.map(z => (
          <div key={z.code} className="list-row" style={{ gridTemplateColumns: '120px 1fr' }} onClick={() => openEdit(z)}>
            <span className="no-col">{z.code}</span>
            <span>{z.name}</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title={modal.mode === 'new' ? '구역 추가' : '구역 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null}>
          <div className="form-grid" style={{ gap: '12px' }}>
            <Field label="구역코드" auto={modal.mode === 'new'} required>
              <input className="form-input auto-fill" value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} disabled={modal.mode === 'edit'} />
            </Field>
            <Field label="구역명" required>
              <input className="form-input" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="금소마을" />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 체험업체 탭 — 3열 카드 그리드
// ══════════════════════════════════════════════════════
function VendorsTab() {
  const [vendors,  setVendors]  = useState([])
  const [zones,    setZones]    = useState([])
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState({})
  const [programs, setPrograms] = useState([])
  const [progForm, setProgForm] = useState({ zone_code: '', prog_name: '', unit_price: '', settle_type: 'per_person' })

  const load = useCallback(async () => {
    const [vendorR, zoneR] = await Promise.all([
      supabase.from('vendors').select('*, vendor_programs(*)').order('key'),
      supabase.from('zones').select('*').order('code'),
    ])
    setVendors(vendorR.data || [])
    setZones(zoneR.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function openNew() {
    const key = await genVendorKey()
    setForm({ key, name: '', contact: '', tel: '', color: '#4ECDC4', note: '' })
    setPrograms([])
    setProgForm({ zone_code: '', prog_name: '', unit_price: '', settle_type: 'per_person' })
    setModal({ mode: 'new' })
  }

  function openEdit(v) {
    setForm({ key: v.key, name: v.name, contact: v.contact || '', tel: v.tel || '', color: v.color || '#4ECDC4', note: v.note || '' })
    setPrograms(v.vendor_programs || [])
    setProgForm({ zone_code: '', prog_name: '', unit_price: '', settle_type: 'per_person' })
    setModal({ mode: 'edit', data: v })
  }

  async function save() {
    if (!form.name) { alert('업체명을 입력하세요.'); return }
    if (modal.mode === 'new') {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, contact: form.contact, tel: form.tel, color: form.color, note: form.note, key: form.key }),
      })
      if (!res.ok) { alert('저장 실패'); return }
    } else {
      await supabase.from('vendors').update({ name: form.name, contact: form.contact, tel: form.tel, color: form.color, note: form.note }).eq('key', modal.data.key)
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
    if (!progForm.zone_code) { alert('구역을 선택하세요.'); return }
    const vendorKey = modal.mode === 'edit' ? modal.data.key : form.key
    if (!vendorKey) { alert('업체를 먼저 저장하세요.'); return }
    const code = await genProgCode(progForm.zone_code, vendorKey)
    await supabase.from('vendor_programs').insert({ code, zone_code: progForm.zone_code, vendor_key: vendorKey, prog_name: progForm.prog_name, unit_price: Number(progForm.unit_price) || 0, settle_type: progForm.settle_type })
    setProgForm({ zone_code: '', prog_name: '', unit_price: '', settle_type: 'per_person' })
    const { data } = await supabase.from('vendor_programs').select('*').eq('vendor_key', vendorKey).order('code')
    setPrograms(data || [])
    load()
  }

  async function delProg(id) {
    await supabase.from('vendor_programs').delete().eq('id', id)
    const vk = modal.mode === 'edit' ? modal.data.key : form.key
    const { data } = await supabase.from('vendor_programs').select('*').eq('vendor_key', vk).order('code')
    setPrograms(data || [])
    load()
  }

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">체험 업체 <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{vendors.length}개 · 카카오 비즈메시지 발송 대상</span></div>
        <button className="btn-primary" onClick={openNew}>+ 업체 추가</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        {vendors.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', gridColumn: 'span 3' }}>등록된 업체 없음</div>
        )}
        {vendors.map((v, i) => {
          const progs = v.vendor_programs || []
          return (
            <div key={v.key} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border2)', borderRight: i % 3 !== 2 ? '1px solid var(--border2)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>{v.name}</span>
                  <span style={{ fontSize: '10px', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '1px 6px', color: 'var(--text-muted)' }}>{v.key}</span>
                </div>
                <button className="icon-btn" onClick={() => openEdit(v)}>✎</button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                <div>👤 {v.contact || '담당자 미입력'}</div>
                <div style={{ fontFamily: 'DM Mono,monospace' }}>📞 {v.tel || '연락처 미입력'}</div>
                {v.note && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📝 {v.note}</div>}
              </div>
              <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: '4px' }}>정산 단가</div>
                {progs.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>단가 미등록</div>}
                {progs.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--navy3)', borderRadius: '5px', marginTop: '3px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 500 }}>{p.prog_name}</span>
                      {p.code && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px', fontFamily: 'DM Mono,monospace' }}>{p.code}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px', color: 'var(--accent)' }}>₩{(p.unit_price || 0).toLocaleString()}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(78,205,196,0.08)', padding: '1px 5px', borderRadius: '4px' }}>{p.settle_type === 'fixed' ? '건당' : '1인'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {modal && (
        <Modal title={modal.mode === 'new' ? '업체 추가' : '업체 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null}>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="업체 KEY" auto>
              <input className="form-input auto-fill" value={form.key || ''} readOnly />
            </Field>
            <Field label="업체명" required>
              <input className="form-input" value={form.name || ''} onChange={e => inp('name', e.target.value)} placeholder="A업체 (애프터눈티)" />
            </Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="담당자"><input className="form-input" value={form.contact || ''} onChange={e => inp('contact', e.target.value)} /></Field>
            <Field label="연락처"><input className="form-input" value={form.tel || ''} onChange={e => inp('tel', e.target.value)} placeholder="010-0000-0000" /></Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="블록 색상">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={form.color || '#4ECDC4'} onChange={e => inp('color', e.target.value)} style={{ width: '36px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--navy3)', cursor: 'pointer' }} />
                <input className="form-input" value={form.color || ''} onChange={e => inp('color', e.target.value)} style={{ flex: 1 }} />
              </div>
            </Field>
            <Field label="비고"><input className="form-input" value={form.note || ''} onChange={e => inp('note', e.target.value)} /></Field>
          </div>

          {modal.mode === 'edit' && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                프로그램 관리 <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
              </div>
              <div className="form-grid form-grid-4" style={{ marginBottom: '8px' }}>
                <Field label="구역">
                  <select className="form-select" value={progForm.zone_code} onChange={e => setProgForm(f => ({ ...f, zone_code: e.target.value }))}>
                    <option value="">선택</option>
                    {zones.map(z => <option key={z.code} value={z.code}>{z.code} · {z.name}</option>)}
                  </select>
                </Field>
                <Field label="프로그램명"><input className="form-input" value={progForm.prog_name} onChange={e => setProgForm(f => ({ ...f, prog_name: e.target.value }))} /></Field>
                <Field label="단가(원)"><input className="form-input" type="number" value={progForm.unit_price} onChange={e => setProgForm(f => ({ ...f, unit_price: e.target.value }))} /></Field>
                <Field label="정산방식">
                  <select className="form-select" value={progForm.settle_type} onChange={e => setProgForm(f => ({ ...f, settle_type: e.target.value }))}>
                    <option value="per_person">인원당</option>
                    <option value="fixed">고정금액</option>
                  </select>
                </Field>
              </div>
              <button className="btn-add-row" onClick={addProg} style={{ marginBottom: '8px' }}>+ 프로그램 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{ gridTemplateColumns: '120px 1fr 80px 70px 36px' }}><span>코드</span><span>프로그램명</span><span>단가</span><span>방식</span><span /></div>
                {programs.length === 0 && <div className="list-box-empty">프로그램 없음</div>}
                {programs.map(p => (
                  <div key={p.id} className="list-box-row" style={{ gridTemplateColumns: '120px 1fr 80px 70px 36px' }}>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '10px', color: 'var(--text-muted)' }}>{p.code || '-'}</span>
                    <span>{p.prog_name}</span>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px' }}>{(p.unit_price || 0).toLocaleString()}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.settle_type === 'per_person' ? '인원당' : '고정'}</span>
                    <button className="icon-btn" onClick={() => delProg(p.id)}>✕</button>
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
// 패키지 탭 — 아코디언
// ══════════════════════════════════════════════════════
function PackagesTab() {
  const [packages, setPackages] = useState([])
  const [zones,    setZones]    = useState([])
  const [vendors,  setVendors]  = useState([])
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState({})
  const [progs,    setProgs]    = useState([])
  const [progForm, setProgForm] = useState({ vendor_key: '', prog_name: '', default_start: '09:00', default_end: '10:00', sort_order: 0 })
  const [expanded, setExpanded] = useState({})

  const load = useCallback(async () => {
    const [pkgR, zoneR, vendorR] = await Promise.all([
      supabase.from('packages').select('*, package_programs(*, vendors(key,name,color))').order('zone_code').order('name'),
      supabase.from('zones').select('*').order('code'),
      supabase.from('vendors').select('key,name,color').order('key'),
    ])
    setPackages(pkgR.data || [])
    setZones(zoneR.data || [])
    setVendors(vendorR.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function openNew() {
    setForm({ code: '', zone_code: '', name: '', pax_limit: 0, total_price: 0 })
    setProgs([])
    setProgForm({ vendor_key: '', prog_name: '', default_start: '09:00', default_end: '10:00', sort_order: 0 })
    setModal({ mode: 'new' })
  }

  function openEdit(p) {
    setForm({ id: p.id, code: p.code || '', zone_code: p.zone_code || '', name: p.name, pax_limit: p.pax_limit || 0, total_price: p.total_price || 0 })
    setProgs(p.package_programs || [])
    setProgForm({ vendor_key: '', prog_name: '', default_start: '09:00', default_end: '10:00', sort_order: 0 })
    setModal({ mode: 'edit', data: p })
  }

  async function onZoneChange(zoneCode) {
    if (modal?.mode === 'new' && zoneCode) {
      const code = await genPackageCode(zoneCode)
      setForm(f => ({ ...f, zone_code: zoneCode, code }))
    } else {
      setForm(f => ({ ...f, zone_code: zoneCode }))
    }
  }

  async function save() {
    if (!form.name) { alert('패키지명을 입력하세요.'); return }
    const payload = { code: form.code || null, zone_code: form.zone_code || null, name: form.name, pax_limit: Number(form.pax_limit) || 0, total_price: Number(form.total_price) || 0 }
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
    const code = await genProgCode(form.zone_code, progForm.vendor_key, 'package_programs')
    await supabase.from('package_programs').insert({ ...progForm, code, package_id: modal.data.id, sort_order: Number(progForm.sort_order) || 0 })
    const { data } = await supabase.from('package_programs').select('*, vendors(key,name,color)').eq('package_id', modal.data.id).order('sort_order')
    setProgs(data || [])
    load()
  }

  async function delProg(id) {
    await supabase.from('package_programs').delete().eq('id', id)
    const { data } = await supabase.from('package_programs').select('*, vendors(key,name,color)').eq('package_id', modal.data.id).order('sort_order')
    setProgs(data || [])
    load()
  }

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">패키지 목록 <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{packages.length}개</span></div>
        <button className="btn-primary" onClick={openNew}>+ 패키지 추가</button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        {packages.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 패키지 없음</div>}
        {packages.map(p => {
          const pp = p.package_programs || []
          const vkeys = [...new Set(pp.map(pr => pr.vendor_key))]
          const isOpen = !!expanded[p.id]
          return (
            <div key={p.id} style={{ borderBottom: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', cursor: 'pointer' }} onClick={() => toggle(p.id)}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '10px', display: 'inline-block', transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : '' }}>▶</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {p.zone_code && <span className="no-col">{p.zone_code}</span>}
                    {p.code && <span style={{ fontSize: '10px', fontFamily: 'DM Mono,monospace', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '1px 6px', color: 'var(--text-muted)' }}>{p.code}</span>}
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</span>
                    {p.pax_limit > 0 && <span style={{ fontSize: '10px', background: 'rgba(247,201,72,0.12)', color: 'var(--amber)', padding: '1px 7px', borderRadius: '10px', fontWeight: 600 }}>⚠ {p.pax_limit}명 알림</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    {vkeys.map(k => {
                      const v = vendors.find(x => x.key === k)
                      return <div key={k} style={{ width: '8px', height: '8px', borderRadius: '50%', background: v?.color || '#4ECDC4', flexShrink: 0 }} title={v?.name || k} />
                    })}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '2px' }}>프로그램 {pp.length}개 · 업체 {vkeys.length}곳</span>
                  </div>
                </div>
                <button className="icon-btn" style={{ flexShrink: 0 }} onClick={e => { e.stopPropagation(); openEdit(p) }}>✎</button>
              </div>

              {isOpen && (
                <div style={{ background: 'rgba(0,0,0,0.08)' }}>
                  {pp.length === 0 && <div style={{ padding: '12px 36px', fontSize: '12px', color: 'var(--text-muted)' }}>등록된 프로그램 없음 — 수정 모달에서 추가하세요</div>}
                  {pp.map(pr => {
                    const v = vendors.find(x => x.key === pr.vendor_key)
                    return (
                      <div key={pr.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px 9px 36px', borderTop: '1px solid var(--border2)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: v?.color || '#4ECDC4', flexShrink: 0, marginRight: '10px' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{pr.prog_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                            {pr.code && `${pr.code} · `}
                            {v?.name || pr.vendor_key}
                            {pr.default_start && ` · ${pr.default_start.slice(0, 5)}~${pr.default_end?.slice(0, 5)}`}
                          </div>
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

      {modal && (
        <Modal title={modal.mode === 'new' ? '패키지 추가' : '패키지 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null}>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="구역" required>
              <select className="form-select" value={form.zone_code || ''} onChange={e => onZoneChange(e.target.value)}>
                <option value="">선택</option>
                {zones.map(z => <option key={z.code} value={z.code}>{z.code} · {z.name}</option>)}
              </select>
            </Field>
            <Field label="패키지코드" auto={modal.mode === 'new'}>
              <input className="form-input auto-fill" value={form.code || ''} readOnly />
            </Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="패키지명" required>
              <input className="form-input" value={form.name || ''} onChange={e => inp('name', e.target.value)} placeholder="금양연화" />
            </Field>
            <Field label="인원 알림 기준">
              <input className="form-input" type="number" value={form.pax_limit || 0} onChange={e => inp('pax_limit', e.target.value)} placeholder="0=미설정" />
            </Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="총 금액(원)">
              <input className="form-input" type="number" value={form.total_price || 0} onChange={e => inp('total_price', e.target.value)} />
            </Field>
          </div>

          {modal.mode === 'edit' && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                프로그램 일정 <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
              </div>
              <div className="form-grid form-grid-3" style={{ marginBottom: '8px', gap: '8px' }}>
                <Field label="업체">
                  <select className="form-select" value={progForm.vendor_key} onChange={e => setProgForm(f => ({ ...f, vendor_key: e.target.value }))}>
                    <option value="">선택</option>
                    {vendors.map(v => <option key={v.key} value={v.key}>{v.key} · {v.name.replace(/\s*\(.*\)/, '')}</option>)}
                  </select>
                </Field>
                <Field label="프로그램명"><input className="form-input" value={progForm.prog_name} onChange={e => setProgForm(f => ({ ...f, prog_name: e.target.value }))} /></Field>
                <Field label="순서"><input className="form-input" type="number" value={progForm.sort_order} onChange={e => setProgForm(f => ({ ...f, sort_order: e.target.value }))} /></Field>
              </div>
              <div className="form-grid form-grid-2" style={{ marginBottom: '8px', gap: '8px' }}>
                <Field label="기본 시작시간"><input className="form-input" type="time" value={progForm.default_start} onChange={e => setProgForm(f => ({ ...f, default_start: e.target.value }))} /></Field>
                <Field label="기본 종료시간"><input className="form-input" type="time" value={progForm.default_end} onChange={e => setProgForm(f => ({ ...f, default_end: e.target.value }))} /></Field>
              </div>
              <button className="btn-add-row" onClick={addProg} style={{ marginBottom: '8px' }}>+ 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{ gridTemplateColumns: '30px 70px 120px 1fr 60px 60px 30px' }}><span>순</span><span>업체</span><span>코드</span><span>프로그램</span><span>시작</span><span>종료</span><span /></div>
                {progs.length === 0 && <div className="list-box-empty">프로그램 없음</div>}
                {progs.map(p => (
                  <div key={p.id} className="list-box-row" style={{ gridTemplateColumns: '30px 70px 120px 1fr 60px 60px 30px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{p.sort_order}</span>
                    <span className="no-col">{p.vendor_key}</span>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '10px', color: 'var(--text-muted)' }}>{p.code || '-'}</span>
                    <span style={{ fontSize: '12px' }}>{p.prog_name}</span>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{p.default_start?.slice(0, 5)}</span>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{p.default_end?.slice(0, 5)}</span>
                    <button className="icon-btn" onClick={() => delProg(p.id)}>✕</button>
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
// 숙소·객실 탭 — 3패널 드릴다운
// ══════════════════════════════════════════════════════
function LodgesTab() {
  const [vendors,     setVendors]     = useState([])
  const [selVendorId, setSelVendorId] = useState(null)
  const [selSpaceId,  setSelSpaceId]  = useState(null)

  const [vendorModal, setVendorModal] = useState(null)
  const [spaceModal,  setSpaceModal]  = useState(null)
  const [roomModal,   setRoomModal]   = useState(null)

  const [vendorForm, setVendorForm] = useState({})
  const [spaceForm,  setSpaceForm]  = useState({})
  const [roomForm,   setRoomForm]   = useState({})

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lodge_vendors')
      .select('*, lodges(*)')
      .order('name')
    setVendors(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const selVendor = vendors.find(v => v.id === selVendorId)
  const spaces    = selVendor?.lodges || []
  const selSpace  = spaces.find(s => s.id === selSpaceId)
  const rooms     = selSpace?.rooms || []   // [{name, price, price_type}]

  // ── 숙박업체 CRUD
  async function saveVendor() {
    if (!vendorForm.name) { alert('업체명을 입력하세요.'); return }
    if (vendorModal.mode === 'new') {
      const { error } = await supabase.from('lodge_vendors').insert({ name: vendorForm.name, color: vendorForm.color || '#4ECDC4' })
      if (error) { alert('저장 실패: ' + error.message); return }
    } else {
      await supabase.from('lodge_vendors').update({ name: vendorForm.name, color: vendorForm.color }).eq('id', vendorModal.data.id)
    }
    setVendorModal(null); load()
  }

  async function deleteVendor() {
    if (!confirm(`"${vendorModal.data.name}" 업체를 삭제하시겠습니까?\n하위 공간과 객실도 모두 삭제됩니다.`)) return
    await supabase.from('lodges').delete().eq('vendor_id', vendorModal.data.id)
    await supabase.from('lodge_vendors').delete().eq('id', vendorModal.data.id)
    if (selVendorId === vendorModal.data.id) { setSelVendorId(null); setSelSpaceId(null) }
    setVendorModal(null); load()
  }

  // ── 숙박공간 CRUD
  async function saveSpace() {
    if (!spaceForm.name) { alert('공간명을 입력하세요.'); return }
    if (spaceModal.mode === 'new') {
      await supabase.from('lodges').insert({ name: spaceForm.name, vendor_id: selVendorId, rooms: [] })
    } else {
      await supabase.from('lodges').update({ name: spaceForm.name }).eq('id', spaceModal.data.id)
    }
    setSpaceModal(null); load()
  }

  async function deleteSpace() {
    if (!confirm(`"${spaceModal.data.name}" 공간을 삭제하시겠습니까?`)) return
    await supabase.from('lodges').delete().eq('id', spaceModal.data.id)
    if (selSpaceId === spaceModal.data.id) setSelSpaceId(null)
    setSpaceModal(null); load()
  }

  // ── 객실 CRUD (jsonb mutation)
  async function saveRoom() {
    if (!roomForm.name) { alert('객실명을 입력하세요.'); return }
    const newRoom = {
      name: roomForm.name,
      price: Number(roomForm.price) || 0,
      price_type: roomForm.price_type || 'per_room',
    }
    const newRooms = roomModal.mode === 'new'
      ? [...rooms, newRoom]
      : rooms.map((r, i) => i === roomModal.idx ? newRoom : r)
    await supabase.from('lodges').update({ rooms: newRooms }).eq('id', selSpaceId)
    setRoomModal(null); load()
  }

  async function deleteRoom() {
    if (!confirm(`"${roomForm.name}" 객실을 삭제하시겠습니까?`)) return
    const newRooms = rooms.filter((_, i) => i !== roomModal.idx)
    await supabase.from('lodges').update({ rooms: newRooms }).eq('id', selSpaceId)
    setRoomModal(null); load()
  }

  const panelStyle = {
    background: 'var(--navy2)', border: '1px solid var(--border)',
    borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  }
  const headStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--navy3)',
  }
  const bodyStyle = { overflowY: 'auto', maxHeight: '420px' }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          숙소 · 객실
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>전화확인 후 수동입력</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 220px 1fr', gap: '12px', alignItems: 'start' }}>

        {/* Panel 1 — 숙박업체 */}
        <div style={panelStyle}>
          <div style={headStyle}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>숙박업체</span>
            <button className="btn-primary" style={{ height: '24px', fontSize: '11px', padding: '0 10px' }}
              onClick={() => { setVendorForm({ name: '', color: '#4ECDC4' }); setVendorModal({ mode: 'new' }) }}>+ 추가</button>
          </div>
          <div style={bodyStyle}>
            {vendors.length === 0 && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>등록된 업체 없음</div>}
            {vendors.map(v => (
              <div key={v.id} onClick={() => { setSelVendorId(v.id); setSelSpaceId(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border2)', background: selVendorId === v.id ? 'rgba(78,205,196,0.08)' : '' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '13px', fontWeight: selVendorId === v.id ? 700 : 500, color: selVendorId === v.id ? 'var(--accent)' : 'var(--text-primary)' }}>{v.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(v.lodges || []).length}개</span>
                <button className="icon-btn" onClick={e => { e.stopPropagation(); setVendorForm({ name: v.name, color: v.color }); setVendorModal({ mode: 'edit', data: v }) }}>✎</button>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2 — 숙박공간 */}
        <div style={panelStyle}>
          <div style={headStyle}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              숙박공간{selVendor ? ` — ${selVendor.name}` : ''}
            </span>
            {selVendorId && (
              <button className="btn-primary" style={{ height: '24px', fontSize: '11px', padding: '0 10px' }}
                onClick={() => { setSpaceForm({ name: '' }); setSpaceModal({ mode: 'new' }) }}>+ 추가</button>
            )}
          </div>
          <div style={bodyStyle}>
            {!selVendorId && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>← 업체를 선택하세요</div>}
            {selVendorId && spaces.length === 0 && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>등록된 공간 없음</div>}
            {spaces.map(s => (
              <div key={s.id} onClick={() => setSelSpaceId(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border2)', background: selSpaceId === s.id ? 'rgba(78,205,196,0.08)' : '' }}>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: selSpaceId === s.id ? 700 : 500, color: selSpaceId === s.id ? 'var(--accent)' : 'var(--text-primary)' }}>{s.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(s.rooms || []).length}객실</span>
                <button className="icon-btn" onClick={e => { e.stopPropagation(); setSpaceForm({ name: s.name }); setSpaceModal({ mode: 'edit', data: s }) }}>✎</button>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 3 — 객실 */}
        <div style={panelStyle}>
          <div style={headStyle}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              객실{selSpace ? ` — ${selSpace.name}` : ''}
            </span>
            {selSpaceId && (
              <button className="btn-primary" style={{ height: '24px', fontSize: '11px', padding: '0 10px' }}
                onClick={() => { setRoomForm({ name: '', price: '', price_type: 'per_room' }); setRoomModal({ mode: 'new' }) }}>+ 추가</button>
            )}
          </div>
          <div style={{ ...bodyStyle, padding: '12px' }}>
            {!selSpaceId && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>← 공간을 선택하세요</div>}
            {selSpaceId && rooms.length === 0 && <div style={{ padding: '8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>등록된 객실 없음</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {rooms.map((r, i) => (
                <div key={i}
                  onClick={() => { setRoomForm({ name: r.name, price: r.price, price_type: r.price_type || 'per_room' }); setRoomModal({ mode: 'edit', idx: i, data: r }) }}
                  style={{ background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', minWidth: '130px' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontFamily: 'DM Mono,monospace', marginTop: '2px' }}>₩{(r.price || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{(r.price_type || 'per_room') === 'per_person' ? '인원당' : '객실당'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 숙박업체 모달 */}
      {vendorModal && (
        <Modal title={vendorModal.mode === 'new' ? '숙박업체 추가' : '숙박업체 수정'} onClose={() => setVendorModal(null)} onSave={saveVendor} onDelete={vendorModal.mode === 'edit' ? deleteVendor : null}>
          <div className="form-grid" style={{ gap: '12px' }}>
            <Field label="업체명" required>
              <input className="form-input" value={vendorForm.name || ''} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="힐링펜션" />
            </Field>
            <Field label="표시 색상">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={vendorForm.color || '#4ECDC4'} onChange={e => setVendorForm(f => ({ ...f, color: e.target.value }))} style={{ width: '36px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--navy3)', cursor: 'pointer' }} />
                <input className="form-input" value={vendorForm.color || ''} onChange={e => setVendorForm(f => ({ ...f, color: e.target.value }))} style={{ flex: 1 }} />
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {/* 숙박공간 모달 */}
      {spaceModal && (
        <Modal title={spaceModal.mode === 'new' ? '숙박공간 추가' : '숙박공간 수정'} onClose={() => setSpaceModal(null)} onSave={saveSpace} onDelete={spaceModal.mode === 'edit' ? deleteSpace : null}>
          <Field label="공간명" required>
            <input className="form-input" value={spaceForm.name || ''} onChange={e => setSpaceForm(f => ({ ...f, name: e.target.value }))} placeholder="본관, 별관, 펜션동 등" />
          </Field>
        </Modal>
      )}

      {/* 객실 모달 */}
      {roomModal && (
        <Modal title={roomModal.mode === 'new' ? '객실 추가' : '객실 수정'} onClose={() => setRoomModal(null)} onSave={saveRoom} onDelete={roomModal.mode === 'edit' ? deleteRoom : null}>
          <div className="form-grid form-grid-2" style={{ gap: '12px' }}>
            <Field label="객실명" required>
              <input className="form-input" value={roomForm.name || ''} onChange={e => setRoomForm(f => ({ ...f, name: e.target.value }))} placeholder="디럭스룸" />
            </Field>
            <Field label="금액(원)">
              <input className="form-input" type="number" value={roomForm.price || ''} onChange={e => setRoomForm(f => ({ ...f, price: e.target.value }))} placeholder="150000" />
            </Field>
            <Field label="요금 유형">
              <select className="form-select" value={roomForm.price_type || 'per_room'} onChange={e => setRoomForm(f => ({ ...f, price_type: e.target.value }))}>
                <option value="per_room">객실당</option>
                <option value="per_person">인원당</option>
              </select>
            </Field>
          </div>
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

  function openNew(type = '플랫폼') { setForm({ type, name: '', contact: '', tel: '', fee_ind: 0, fee_grp: 0 }); setModal({ mode: 'new' }) }
  function openEdit(p) { setForm({ ...p }); setModal({ mode: 'edit', data: p }) }

  async function save() {
    if (!form.name) { alert('이름을 입력하세요.'); return }
    const payload = { type: form.type, name: form.name, contact: form.contact || '', tel: form.tel || '', fee_ind: Number(form.fee_ind) || 0, fee_grp: Number(form.fee_grp) || 0 }
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

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const platforms = list.filter(p => p.type === '플랫폼')
  const agencies  = list.filter(p => p.type === '여행사')

  const renderGroup = (title, type, items) => (
    <div className="list-card" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{items.length}개</span>
        </div>
        <button className="btn-primary" style={{ height: '28px', fontSize: '12px', padding: '0 12px' }} onClick={() => openNew(type)}>+ {title} 추가</button>
      </div>
      <div className="list-header" style={{ gridTemplateColumns: '1fr 80px 120px 60px 60px' }}>
        <span>이름</span><span>담당자</span><span>연락처</span><span>개인(%)</span><span>단체(%)</span>
      </div>
      {items.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 {title} 없음</div>}
      {items.map(p => (
        <div key={p.id} className="list-row" style={{ gridTemplateColumns: '1fr 80px 120px 60px 60px' }} onClick={() => openEdit(p)}>
          <span style={{ fontWeight: 500 }}>{p.name}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{p.contact || '-'}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{p.tel || '-'}</span>
          <span className="no-col">{p.fee_ind}%</span>
          <span className="no-col">{p.fee_grp}%</span>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <div className="section-header">
        <div className="section-title">플랫폼 · 여행사</div>
      </div>
      {renderGroup('플랫폼', '플랫폼', platforms)}
      {renderGroup('여행사', '여행사', agencies)}
      {modal && (
        <Modal title={modal.mode === 'new' ? `${form.type || '항목'} 추가` : `${form.type || '항목'} 수정`} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null}>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="구분" required>
              <select className="form-select" value={form.type || '플랫폼'} onChange={e => inp('type', e.target.value)}>
                <option value="플랫폼">플랫폼</option>
                <option value="여행사">여행사</option>
              </select>
            </Field>
            <Field label="이름" required><input className="form-input" value={form.name || ''} onChange={e => inp('name', e.target.value)} /></Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="담당자"><input className="form-input" value={form.contact || ''} onChange={e => inp('contact', e.target.value)} /></Field>
            <Field label="연락처"><input className="form-input" value={form.tel || ''} onChange={e => inp('tel', e.target.value)} /></Field>
          </div>
          <div className="form-grid form-grid-2">
            <Field label="개인 수수료(%)"><input className="form-input fee-input" type="number" value={form.fee_ind || 0} onChange={e => inp('fee_ind', e.target.value)} /></Field>
            <Field label="단체 수수료(%)"><input className="form-input fee-input" type="number" value={form.fee_grp || 0} onChange={e => inp('fee_grp', e.target.value)} /></Field>
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

  function openNew()   { setForm({ name: '', tel: '', affil: '자체' }); setModal({ mode: 'new' }) }
  function openEdit(d) { setForm({ ...d }); setModal({ mode: 'edit', data: d }) }

  async function save() {
    if (!form.name) { alert('이름을 입력하세요.'); return }
    const payload = { name: form.name, tel: form.tel || '', affil: form.affil || '자체' }
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

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="section-header">
        <div className="section-title">픽업수행자</div>
        <button className="btn-primary" onClick={openNew}>+ 추가</button>
      </div>
      <div style={{ padding: '8px 14px', background: 'rgba(247,201,72,0.04)', borderBottom: '1px solid var(--border2)', fontSize: '11px', color: 'var(--amber)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px' }}>
        💡 픽업비: 여행사 정산금에서 차감 후 담당자 지급
      </div>
      <div className="list-card">
        <div className="list-header" style={{ gridTemplateColumns: '1fr 130px 70px' }}>
          <span>이름</span><span>연락처</span><span>소속</span>
        </div>
        {list.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 수행자 없음</div>}
        {list.map(d => (
          <div key={d.id} className="list-row" style={{ gridTemplateColumns: '1fr 130px 70px' }} onClick={() => openEdit(d)}>
            <span style={{ fontWeight: 500 }}>{d.name}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{d.tel || '-'}</span>
            <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: d.affil === '자체' ? 'rgba(92,184,92,.1)' : 'rgba(247,201,72,.1)', color: d.affil === '자체' ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>{d.affil || '-'}</span>
          </div>
        ))}
      </div>
      {modal && (
        <Modal title={modal.mode === 'new' ? '픽업수행자 추가' : '픽업수행자 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null}>
          <div className="form-grid" style={{ gap: '12px' }}>
            <Field label="이름" required><input className="form-input" value={form.name || ''} onChange={e => inp('name', e.target.value)} /></Field>
            <Field label="연락처"><input className="form-input" value={form.tel || ''} onChange={e => inp('tel', e.target.value)} placeholder="010-0000-0000" /></Field>
            <Field label="소속">
              <select className="form-select" value={form.affil || '자체'} onChange={e => inp('affil', e.target.value)}>
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
  const [list,     setList]     = useState([])
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState({})
  const [payments, setPayments] = useState([])
  const [payForm,  setPayForm]  = useState({ type: 'pre', amount: '', note: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('biz').select('*, biz_payments(*)').order('name')
    setList(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew() {
    const now = new Date()
    setForm({ name: '', start_year: now.getFullYear(), start_month: 1, start_day: 1, end_year: now.getFullYear(), end_month: 12, end_day: 31 })
    setPayments([])
    setPayForm({ type: 'pre', amount: '', note: '' })
    setModal({ mode: 'new' })
  }

  function openEdit(b) {
    setForm({ ...b })
    setPayments(b.biz_payments || [])
    setPayForm({ type: 'pre', amount: '', note: '' })
    setModal({ mode: 'edit', data: b })
  }

  async function save() {
    if (!form.name) { alert('사업명을 입력하세요.'); return }
    const payload = { name: form.name, start_year: Number(form.start_year), start_month: Number(form.start_month), start_day: Number(form.start_day), end_year: Number(form.end_year), end_month: Number(form.end_month), end_day: Number(form.end_day) }
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
    await supabase.from('biz_payments').insert({ biz_id: modal.data.id, type: payForm.type, amount: Number(payForm.amount), note: payForm.note || '' })
    setPayForm({ type: 'pre', amount: '', note: '' })
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

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const totalBudget = payments.reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">사업명</div>
        <button className="btn-primary" onClick={openNew}>+ 사업 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{ gridTemplateColumns: '1fr 160px 110px' }}>
          <span>사업명</span><span>기간</span><span>총예산</span>
        </div>
        {list.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 사업 없음</div>}
        {list.map(b => {
          const budget = (b.biz_payments || []).reduce((s, p) => s + (p.amount || 0), 0)
          return (
            <div key={b.id} className="list-row" style={{ gridTemplateColumns: '1fr 160px 110px' }} onClick={() => openEdit(b)}>
              <span style={{ fontWeight: 500 }}>{b.name}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {b.start_year}.{String(b.start_month).padStart(2, '0')}.{String(b.start_day).padStart(2, '0')} ~ {b.end_year}.{String(b.end_month).padStart(2, '0')}.{String(b.end_day).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px' }}>{budget.toLocaleString()}원</span>
            </div>
          )
        })}
      </div>
      {modal && (
        <Modal title={modal.mode === 'new' ? '사업 추가' : '사업 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null}>
          <Field label="사업명" required><input className="form-input" value={form.name || ''} onChange={e => inp('name', e.target.value)} style={{ marginBottom: '12px' }} /></Field>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>시작일</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input className="form-input" type="number" value={form.start_year || ''} onChange={e => inp('start_year', e.target.value)} placeholder="년" style={{ width: '80px' }} />
              <input className="form-input" type="number" value={form.start_month || ''} onChange={e => inp('start_month', e.target.value)} placeholder="월" style={{ width: '60px' }} min="1" max="12" />
              <input className="form-input" type="number" value={form.start_day || ''} onChange={e => inp('start_day', e.target.value)} placeholder="일" style={{ width: '60px' }} min="1" max="31" />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>종료일</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input className="form-input" type="number" value={form.end_year || ''} onChange={e => inp('end_year', e.target.value)} placeholder="년" style={{ width: '80px' }} />
              <input className="form-input" type="number" value={form.end_month || ''} onChange={e => inp('end_month', e.target.value)} placeholder="월" style={{ width: '60px' }} min="1" max="12" />
              <input className="form-input" type="number" value={form.end_day || ''} onChange={e => inp('end_day', e.target.value)} placeholder="일" style={{ width: '60px' }} min="1" max="31" />
            </div>
          </div>
          {modal.mode === 'edit' && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                지급금 관리 <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
              </div>
              <div className="form-grid form-grid-3" style={{ marginBottom: '8px', gap: '8px' }}>
                <Field label="구분">
                  <select className="form-select" value={payForm.type} onChange={e => setPayForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="pre">선지급</option>
                    <option value="post">후지급</option>
                  </select>
                </Field>
                <Field label="금액(원)"><input className="form-input" type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></Field>
                <Field label="비고"><input className="form-input" value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} /></Field>
              </div>
              <button className="btn-add-row" onClick={addPay} style={{ marginBottom: '8px' }}>+ 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{ gridTemplateColumns: '60px 1fr 90px 30px' }}><span>구분</span><span>비고</span><span>금액</span><span /></div>
                {payments.length === 0 && <div className="list-box-empty">등록된 지급금 없음</div>}
                {payments.map(p => (
                  <div key={p.id} className="list-box-row" style={{ gridTemplateColumns: '60px 1fr 90px 30px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: p.type === 'pre' ? 'var(--accent)' : 'var(--amber)' }}>{p.type === 'pre' ? '선지급' : '후지급'}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.note || '-'}</span>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px' }}>{(p.amount || 0).toLocaleString()}</span>
                    <button className="icon-btn" onClick={() => delPay(p.id)}>✕</button>
                  </div>
                ))}
                {payments.length > 0 && (
                  <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'flex-end', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
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
  const CONTENT = [<ZonesTab />, <VendorsTab />, <PackagesTab />, <LodgesTab />, <PlatformsTab />, <DriversTab />, <BizTab />]

  return (
    <div>
      <div className="tab-bar">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      {CONTENT[tab]}
    </div>
  )
}
