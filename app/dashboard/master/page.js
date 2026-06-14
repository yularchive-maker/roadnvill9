'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { numberInputValue, numberInputChange } from '@/lib/number-format'

function activePackagePrograms(programs) {
  return (programs || []).filter(program => program && program.is_deleted !== true)
}

function activeVendorPrograms(programs) {
  return (programs || []).filter(program => program && program.is_deleted !== true)
}

const TABS = ['구역', '체험업체', '일반 패키지', '숙소·객실', '플랫폼·여행사', '픽업수행자', '사업비 패키지']

// ── 공통 모달 래퍼
function Modal({ title, onClose, onSave, onDelete, children, maxWidth = '480px' }) {
  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(92vw, 760px)', maxWidth }}>
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

  const activePackagePrograms = programs => (programs || []).filter(program => program && program.is_deleted !== true)

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
    const { error } = await supabase.from('zones').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('code', modal.data.code)
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
  const [originalPrograms, setOriginalPrograms] = useState([])
  const emptyProgForm = { zone_code: '', prog_name: '', customer_price: '', vendor_settle_price: '', settle_type: 'per_person' }
  const [progForm, setProgForm] = useState(emptyProgForm)
  const [telegramUpdates, setTelegramUpdates] = useState([])
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [telegramError, setTelegramError] = useState('')
  const [telegramFilter, setTelegramFilter] = useState('all')
  const [webhookInfo, setWebhookInfo] = useState(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookError, setWebhookError] = useState('')

  const load = useCallback(async () => {
    const [vendorR, zoneR] = await Promise.all([
      supabase.from('vendors').select('*, vendor_programs(*)').order('key'),
      supabase.from('zones').select('*').order('code'),
    ])
    setVendors((vendorR.data || []).map(vendor => ({
      ...vendor,
      vendor_programs: activeVendorPrograms(vendor.vendor_programs),
    })))
    setZones(zoneR.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function openNew() {
    const key = await genVendorKey()
    setForm({ key, name: '', contact: '', tel: '', color: '#4ECDC4', note: '', telegram_chat_id: '', telegram_username: '' })
    setPrograms([])
    setOriginalPrograms([])
    setProgForm(emptyProgForm)
    setModal({ mode: 'new' })
  }

  function openEdit(v) {
    setForm({
      key: v.key,
      name: v.name,
      contact: v.contact || '',
      tel: v.tel || '',
      color: v.color || '#4ECDC4',
      note: v.note || '',
      telegram_chat_id: v.telegram_chat_id || '',
      telegram_username: v.telegram_username || '',
    })
    const activePrograms = activeVendorPrograms(v.vendor_programs)
    setPrograms(activePrograms)
    setOriginalPrograms(activePrograms)
    setProgForm(emptyProgForm)
    setModal({ mode: 'edit', data: v })
  }

  function programSavePayload(program) {
    const vendorSettlePrice = Number(program.vendor_settle_price ?? program.unit_price) || 0
    return {
      customer_price: Number(program.customer_price) || 0,
      vendor_settle_price: vendorSettlePrice,
      unit_price: vendorSettlePrice,
      settle_type: program.settle_type || 'per_person',
    }
  }

  function isProgramChanged(program) {
    const original = originalPrograms.find(item => item.id === program.id)
    if (!original) return false
    const currentPayload = programSavePayload(program)
    const originalPayload = programSavePayload(original)
    return currentPayload.customer_price !== originalPayload.customer_price
      || currentPayload.vendor_settle_price !== originalPayload.vendor_settle_price
      || currentPayload.settle_type !== originalPayload.settle_type
  }

  async function saveChangedPrograms(vendorKey) {
    const changedPrograms = programs.filter(program => program.id && isProgramChanged(program))
    if (changedPrograms.length === 0) return []
    const savedPrograms = []
    for (const program of changedPrograms) {
      const payload = programSavePayload(program)
      const { data, error } = await supabase.from('vendor_programs').update(payload).eq('id', program.id).select('*').single()
      if (error) throw new Error(`${program.prog_name || '프로그램'} 금액 저장 실패: ${error.message}`)
      savedPrograms.push(data || { ...program, ...payload })
    }
    setPrograms(list => list.map(item => savedPrograms.find(saved => saved.id === item.id) || item))
    setOriginalPrograms(list => list.map(item => savedPrograms.find(saved => saved.id === item.id) || item))
    setVendors(list => list.map(vendor => vendor.key === vendorKey
      ? { ...vendor, vendor_programs: (vendor.vendor_programs || []).map(item => savedPrograms.find(saved => saved.id === item.id) || item) }
      : vendor
    ))
    return savedPrograms
  }

  async function save() {
    if (!form.name) { alert('업체명을 입력하세요.'); return }
    if (modal.mode === 'new') {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          contact: form.contact,
          tel: form.tel,
          color: form.color,
          note: form.note,
          key: form.key,
          telegram_chat_id: form.telegram_chat_id || null,
          telegram_username: form.telegram_username || null,
        }),
      })
      if (!res.ok) { alert('저장 실패'); return }
    } else {
      await supabase.from('vendors').update({
        name: form.name,
        contact: form.contact,
        tel: form.tel,
        color: form.color,
        note: form.note,
        telegram_chat_id: form.telegram_chat_id || null,
        telegram_username: form.telegram_username || null,
        telegram_linked_at: form.telegram_chat_id ? (modal.data.telegram_linked_at || new Date().toISOString()) : null,
      }).eq('key', modal.data.key)
    }
    try {
      await saveChangedPrograms(modal.mode === 'edit' ? modal.data.key : form.key)
    } catch (error) {
      alert(error.message)
      return
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}" 업체를 삭제하시겠습니까?`)) return
    await supabase.from('vendors').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('key', modal.data.key)
    setModal(null); load()
  }

  async function addProg() {
    if (!progForm.prog_name) { alert('프로그램명을 입력하세요.'); return }
    if (!progForm.zone_code) { alert('구역을 선택하세요.'); return }
    const vendorKey = modal.mode === 'edit' ? modal.data.key : form.key
    if (!vendorKey) { alert('업체를 먼저 저장하세요.'); return }
    const code = await genProgCode(progForm.zone_code, vendorKey)
    const vendorSettlePrice = Number(progForm.vendor_settle_price) || 0
    await supabase.from('vendor_programs').insert({
      code,
      zone_code: progForm.zone_code,
      vendor_key: vendorKey,
      prog_name: progForm.prog_name,
      customer_price: Number(progForm.customer_price) || 0,
      vendor_settle_price: vendorSettlePrice,
      unit_price: vendorSettlePrice,
      settle_type: progForm.settle_type,
    })
    setProgForm(emptyProgForm)
    const { data } = await supabase.from('vendor_programs').select('*').eq('vendor_key', vendorKey).or('is_deleted.is.null,is_deleted.eq.false').order('code')
    setPrograms(data || [])
    setOriginalPrograms(data || [])
    load()
  }

  async function delProg(id) {
    if (!confirm('이 프로그램을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('vendor_programs').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('프로그램 삭제 실패: ' + error.message); return }
    const vk = modal.mode === 'edit' ? modal.data.key : form.key
    const { data } = await supabase.from('vendor_programs').select('*').eq('vendor_key', vk).or('is_deleted.is.null,is_deleted.eq.false').order('code')
    setPrograms(data || [])
    setOriginalPrograms(data || [])
    setVendors(list => list.map(vendor => vendor.key === vk
      ? { ...vendor, vendor_programs: (vendor.vendor_programs || []).filter(program => program.id !== id) }
      : vendor
    ))
    setModal(current => current?.mode === 'edit' && current.data.key === vk
      ? { ...current, data: { ...current.data, vendor_programs: (current.data.vendor_programs || []).filter(program => program.id !== id) } }
      : current
    )
    load()
  }

  function updateProgramLocal(id, patch) {
    setPrograms(list => list.map(program => program.id === id ? { ...program, ...patch } : program))
  }

  async function saveProgramPrice(programId) {
    const program = programs.find(item => item.id === programId)
    if (!program) return
    const payload = programSavePayload(program)
    const { data, error } = await supabase.from('vendor_programs').update(payload).eq('id', programId).select('*').single()
    if (error) { alert('프로그램 금액 저장 실패: ' + error.message); return }
    const vk = modal.mode === 'edit' ? modal.data.key : form.key
    const savedProgram = data || { ...program, ...payload }
    setPrograms(list => list.map(item => item.id === programId ? savedProgram : item))
    setOriginalPrograms(list => list.map(item => item.id === programId ? savedProgram : item))
    setVendors(list => list.map(vendor => vendor.key === vk
      ? { ...vendor, vendor_programs: (vendor.vendor_programs || []).map(item => item.id === programId ? savedProgram : item) }
      : vendor
    ))
    setModal(current => current?.mode === 'edit' && current.data.key === vk
      ? { ...current, data: { ...current.data, vendor_programs: (current.data.vendor_programs || []).map(item => item.id === programId ? savedProgram : item) } }
      : current
    )
  }

  async function loadTelegramUpdates() {
    setTelegramLoading(true)
    setTelegramError('')
    try {
      const res = await fetch('/api/telegram/updates', { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || '최근 메시지를 불러오지 못했습니다.')
      setTelegramUpdates(payload.updates || [])
    } catch (err) {
      setTelegramUpdates([])
      setTelegramError(err.message || '최근 메시지를 불러오지 못했습니다.')
    } finally {
      setTelegramLoading(false)
    }
  }

  async function copyTelegramChatId(chatId) {
    if (!chatId) return
    try {
      await navigator.clipboard.writeText(chatId)
      alert(`chat_id를 복사했습니다: ${chatId}`)
    } catch {
      alert(`chat_id: ${chatId}`)
    }
  }

  async function loadWebhookInfo() {
    setWebhookLoading(true)
    setWebhookError('')
    try {
      const res = await fetch('/api/telegram/webhook-settings', { cache: 'no-store' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'webhook 상태를 불러오지 못했습니다.')
      setWebhookInfo(payload.webhook || null)
    } catch (err) {
      setWebhookInfo(null)
      setWebhookError(err.message || 'webhook 상태를 불러오지 못했습니다.')
    } finally {
      setWebhookLoading(false)
    }
  }

  async function registerWebhook() {
    if (!confirm('현재 배포 주소 기준으로 Telegram webhook을 등록할까요?')) return
    setWebhookLoading(true)
    setWebhookError('')
    try {
      const res = await fetch('/api/telegram/webhook-settings', { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'webhook 등록에 실패했습니다.')
      alert(`webhook을 등록했습니다.\n${payload.webhook_url || ''}`)
      await loadWebhookInfo()
    } catch (err) {
      setWebhookError(err.message || 'webhook 등록에 실패했습니다.')
    } finally {
      setWebhookLoading(false)
    }
  }

  async function deleteWebhook() {
    if (!confirm('Telegram webhook을 해제할까요? 운영 중에는 업체 버튼 회신이 자동 저장되지 않을 수 있습니다.')) return
    setWebhookLoading(true)
    setWebhookError('')
    try {
      const res = await fetch('/api/telegram/webhook-settings', { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'webhook 해제에 실패했습니다.')
      alert('webhook을 해제했습니다.')
      await loadWebhookInfo()
    } catch (err) {
      setWebhookError(err.message || 'webhook 해제에 실패했습니다.')
    } finally {
      setWebhookLoading(false)
    }
  }

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const connectedVendors = vendors.filter(v => !!v.telegram_chat_id)
  const disconnectedVendors = vendors.filter(v => !v.telegram_chat_id)
  const filteredVendors = telegramFilter === 'connected'
    ? connectedVendors
    : telegramFilter === 'disconnected'
      ? disconnectedVendors
      : vendors
  const telegramFilterButtons = [
    { key: 'all', label: '전체', count: vendors.length },
    { key: 'connected', label: '연결됨', count: connectedVendors.length },
    { key: 'disconnected', label: '미연결', count: disconnectedVendors.length },
  ]

  return (
    <div>
      <div className="section-header">
        <div className="section-title">체험 업체 <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{vendors.length}개 · Telegram/Kakao 발송 대상</span></div>
        <button className="btn-primary" onClick={openNew}>+ 업체 추가</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>전체 업체</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{vendors.length}</div>
        </div>
        <div style={{ border: '1px solid rgba(78,205,196,0.3)', borderRadius: '8px', padding: '12px 14px', background: 'rgba(78,205,196,0.07)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Telegram 연결됨</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#4ECDC4' }}>{connectedVendors.length}</div>
        </div>
        <div style={{ border: '1px solid rgba(255,193,7,0.28)', borderRadius: '8px', padding: '12px 14px', background: 'rgba(255,193,7,0.06)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Telegram 미연결</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#ffc107' }}>{disconnectedVendors.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {telegramFilterButtons.map(button => {
            const active = telegramFilter === button.key
            return (
              <button
                key={button.key}
                className={active ? 'btn-primary' : 'btn-outline'}
                onClick={() => setTelegramFilter(button.key)}
                style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
              >
                {button.label} {button.count}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {filteredVendors.length}개 표시
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 360px))', justifyContent: 'start', gap: '10px' }}>
        {filteredVendors.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', gridColumn: '1 / -1', border: '1px solid var(--border)', borderRadius: '10px' }}>등록된 업체 없음</div>
        )}
        {filteredVendors.map(v => {
          const progs = v.vendor_programs || []
          const previewPrograms = progs.slice(0, 3)
          const extraProgramCount = Math.max(progs.length - previewPrograms.length, 0)
          return (
            <div key={v.key} style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: '10px', background: 'rgba(255,255,255,0.015)', minHeight: '188px', display: 'flex', flexDirection: 'column' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: v.telegram_chat_id ? '#4ECDC4' : 'var(--text-muted)',
                    background: v.telegram_chat_id ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${v.telegram_chat_id ? 'rgba(78,205,196,0.35)' : 'var(--border2)'}`,
                    borderRadius: '999px',
                    padding: '2px 7px',
                  }}>
                    {v.telegram_chat_id ? '텔레그램 연결됨' : '텔레그램 미연결'}
                  </span>
                  {v.telegram_chat_id && (
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                      chat {v.telegram_chat_id}
                    </span>
                  )}
                </div>
                {v.note && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📝 {v.note}</div>}
              </div>
              <div style={{ borderTop: '1px solid var(--border2)', paddingTop: '10px', marginTop: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.5px', textTransform: 'uppercase' }}>체험 · 판매/정산</div>
                  {extraProgramCount > 0 && (
                    <button className="btn-outline" onClick={() => openEdit(v)} style={{ height: '24px', padding: '0 8px', fontSize: '10px' }}>
                      전체보기
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '76px' }}>
                  {previewPrograms.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>등록된 체험 없음</span>
                  )}
                  {previewPrograms.map(program => (
                    <div key={program.id || `${v.key}-${program.prog_name}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 118px) auto auto auto', justifyContent: 'start', alignItems: 'center', gap: '7px', width: 'fit-content', maxWidth: '100%', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '6px', padding: '5px 7px' }}>
                      <span style={{ minWidth: 0, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{program.prog_name || '-'}</span>
                      <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>판매 ₩{Number(program.customer_price || 0).toLocaleString()}</span>
                      <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px', color: 'var(--amber)', whiteSpace: 'nowrap' }}>정산 ₩{Number(program.vendor_settle_price ?? program.unit_price ?? 0).toLocaleString()}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(78,205,196,0.08)', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap' }}>{program.settle_type === 'fixed' ? '건당' : '1인'}</span>
                    </div>
                  ))}
                  {extraProgramCount > 0 && (
                    <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', paddingTop: '2px' }}>
                      외 {extraProgramCount}개는 전체보기에서 확인
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border2)' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800 }}>최근 봇 메시지</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>업체가 봇에 /start를 보낸 뒤 chat_id를 확인해서 업체 수정 화면에 입력합니다.</div>
          </div>
          <button className="btn-outline" onClick={loadTelegramUpdates} disabled={telegramLoading}>
            {telegramLoading ? '확인 중' : '최근 메시지 확인'}
          </button>
        </div>
        {telegramError && (
          <div style={{ padding: '12px 14px', color: '#ff6b6b', fontSize: '12px', borderBottom: '1px solid var(--border2)' }}>{telegramError}</div>
        )}
        {telegramUpdates.length === 0 && !telegramError && (
          <div style={{ padding: '18px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            아직 불러온 메시지가 없습니다.
          </div>
        )}
        {telegramUpdates.length > 0 && (
          <div>
            <div className="list-box-header" style={{ gridTemplateColumns: '160px 130px 1fr 160px 70px', padding: '8px 14px' }}>
              <span>chat_id</span><span>사용자</span><span>메시지</span><span>수신시간</span><span>작업</span>
            </div>
            {telegramUpdates.map(update => (
              <div key={update.update_id} className="list-box-row" style={{ gridTemplateColumns: '160px 130px 1fr 160px 70px', padding: '9px 14px' }}>
                <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--accent)', fontSize: '11px' }}>{update.chat_id}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {update.username ? `@${update.username}` : [update.first_name, update.last_name].filter(Boolean).join(' ') || '-'}
                </span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{update.text || '-'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  {update.date ? new Date(update.date).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                </span>
                <button className="btn-outline" onClick={() => copyTelegramChatId(update.chat_id)} style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}>복사</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 14px', borderBottom: '1px solid var(--border2)' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800 }}>Telegram webhook 운영 상태</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>배포 후 업체 버튼 회신을 자동 저장하려면 webhook이 운영 URL로 등록되어 있어야 합니다.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn-outline" onClick={loadWebhookInfo} disabled={webhookLoading} style={{ height: '30px', padding: '0 10px', fontSize: '11px' }}>{webhookLoading ? '확인 중' : '상태 확인'}</button>
            <button className="btn-primary" onClick={registerWebhook} disabled={webhookLoading} style={{ height: '30px', padding: '0 10px', fontSize: '11px' }}>webhook 등록</button>
            <button className="btn-outline" onClick={deleteWebhook} disabled={webhookLoading} style={{ height: '30px', padding: '0 10px', fontSize: '11px', color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.35)' }}>해제</button>
          </div>
        </div>
        {webhookError && (
          <div style={{ padding: '12px 14px', color: '#ff6b6b', fontSize: '12px', borderBottom: '1px solid var(--border2)' }}>{webhookError}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: '8px 12px', padding: '12px 14px', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-muted)' }}>등록 상태</span>
          <span style={{ color: webhookInfo?.url ? '#4ECDC4' : 'var(--text-muted)', fontWeight: 700 }}>{webhookInfo?.url ? '등록됨' : '상태 미확인 또는 미등록'}</span>
          <span style={{ color: 'var(--text-muted)' }}>Webhook URL</span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Mono,monospace' }} title={webhookInfo?.url || ''}>{webhookInfo?.url || '-'}</span>
          <span style={{ color: 'var(--text-muted)' }}>대기 업데이트</span>
          <span>{webhookInfo?.pending_update_count ?? '-'}</span>
          <span style={{ color: 'var(--text-muted)' }}>마지막 오류</span>
          <span style={{ minWidth: 0, color: webhookInfo?.last_error_message ? '#ff6b6b' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={webhookInfo?.last_error_message || ''}>{webhookInfo?.last_error_message || '-'}</span>
        </div>
      </div>

      {modal && (
        <Modal title={modal.mode === 'new' ? '업체 추가' : '업체 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null} maxWidth="560px">
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
            <Field label="텔레그램 chat_id">
              <input className="form-input" value={form.telegram_chat_id || ''} onChange={e => inp('telegram_chat_id', e.target.value.trim())} placeholder="8751418592" />
            </Field>
            <Field label="텔레그램 username">
              <input className="form-input" value={form.telegram_username || ''} onChange={e => inp('telegram_username', e.target.value.trim())} placeholder="@vendor_name" />
            </Field>
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
              <div className="form-grid form-grid-3" style={{ marginBottom: '8px' }}>
                <Field label="구역">
                  <select className="form-select" value={progForm.zone_code} onChange={e => setProgForm(f => ({ ...f, zone_code: e.target.value }))}>
                    <option value="">선택</option>
                    {zones.map(z => <option key={z.code} value={z.code}>{z.code} · {z.name}</option>)}
                  </select>
                </Field>
                <Field label="프로그램명"><input className="form-input" value={progForm.prog_name} onChange={e => setProgForm(f => ({ ...f, prog_name: e.target.value }))} /></Field>
                <Field label="정산방식">
                  <select className="form-select" value={progForm.settle_type} onChange={e => setProgForm(f => ({ ...f, settle_type: e.target.value }))}>
                    <option value="per_person">인원당</option>
                    <option value="fixed">고정금액</option>
                  </select>
                </Field>
              </div>
              <div className="form-grid form-grid-2" style={{ marginBottom: '8px' }}>
                <Field label="고객 판매가">
                  <input className="form-input" inputMode="numeric" value={numberInputValue(progForm.customer_price)} onChange={e => setProgForm(f => ({ ...f, customer_price: numberInputChange(e.target.value) }))} placeholder="30,000" />
                </Field>
                <Field label="업체 정산단가">
                  <input className="form-input" inputMode="numeric" value={numberInputValue(progForm.vendor_settle_price)} onChange={e => setProgForm(f => ({ ...f, vendor_settle_price: numberInputChange(e.target.value) }))} placeholder="20,000" />
                </Field>
              </div>
              <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                고객 판매가는 고객에게 받는 체험 판매금이고, 업체 정산단가는 해당 업체에 지급할 금액입니다. 기존 정산 호환을 위해 업체 정산단가가 기존 단가로도 저장됩니다.
              </div>
              <button className="btn-add-row" onClick={addProg} style={{ marginBottom: '8px' }}>+ 프로그램 추가</button>
              <div className="list-box" style={{ overflowX: 'hidden', width: '100%', maxWidth: '100%' }}>
                <div className="list-box-header" style={{ gridTemplateColumns: 'minmax(112px, 1fr) 86px 94px 70px 72px', alignItems: 'center', gap: '6px' }}>
                  <span>프로그램</span><span>판매가</span><span>정산단가</span><span>방식</span><span>작업</span>
                </div>
                {programs.length === 0 && <div className="list-box-empty">프로그램 없음</div>}
                {programs.map(p => (
                  <div key={p.id} className="list-box-row" style={{ gridTemplateColumns: 'minmax(112px, 1fr) 86px 94px 70px 72px', alignItems: 'center', gap: '6px' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.prog_name}</span>
                      <span style={{ display: 'block', fontFamily: 'DM Mono,monospace', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.code || '-'}</span>
                    </span>
                    <input className="form-input" inputMode="numeric" value={numberInputValue(p.customer_price || '')} onChange={e => updateProgramLocal(p.id, { customer_price: numberInputChange(e.target.value) })} placeholder="판매가" style={{ height: '30px', fontSize: '11px', padding: '0 6px', minWidth: 0 }} />
                    <input className="form-input" inputMode="numeric" value={numberInputValue(p.vendor_settle_price ?? p.unit_price ?? '')} onChange={e => updateProgramLocal(p.id, { vendor_settle_price: numberInputChange(e.target.value) })} placeholder="정산단가" style={{ height: '30px', fontSize: '11px', padding: '0 6px', minWidth: 0 }} />
                    <select className="form-select" value={p.settle_type || 'per_person'} onChange={e => updateProgramLocal(p.id, { settle_type: e.target.value })} style={{ height: '30px', fontSize: '11px', padding: '0 4px', minWidth: 0 }}>
                      <option value="per_person">인원당</option>
                      <option value="fixed">고정</option>
                    </select>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                      <button className="btn-outline" onClick={() => saveProgramPrice(p.id)} style={{ height: '30px', fontSize: '11px', padding: '0 6px', whiteSpace: 'nowrap', flex: '1 1 auto' }}>저장</button>
                      <button className="icon-btn" onClick={() => delProg(p.id)} style={{ width: '30px', height: '30px', flex: '0 0 30px' }}>✕</button>
                    </span>
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
function PackagesTab({ packageType = 'general', title = '패키지 목록', addLabel = '+ 패키지 추가', emptyText = '등록된 패키지 없음' } = {}) {
  const [packages, setPackages] = useState([])
  const [zones,    setZones]    = useState([])
  const [vendors,  setVendors]  = useState([])
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState({})
  const [progs,    setProgs]    = useState([])
  const emptyPackageProgForm = { zone_code: '', vendor_key: '', prog_name: '', default_start: '09:00', default_end: '10:00', sort_order: 1, vendor_settle_price: '', settle_type: 'per_person', price_note: '' }
  const [progForm, setProgForm] = useState(emptyPackageProgForm)
  const [editingProgId, setEditingProgId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [businessPackageOptions, setBusinessPackageOptions] = useState([])
  const [businessPackageLinks, setBusinessPackageLinks] = useState([])

  const load = useCallback(async () => {
    const [pkgR, zoneR, vendorR, bizItemR, linkR] = await Promise.all([
      supabase.from('packages').select('*, package_zones(*), package_programs(*, vendors(key,name,color))').order('zone_code').order('name'),
      supabase.from('zones').select('*').order('code'),
      supabase.from('vendors').select('key,name,color,vendor_programs(prog_name,vendor_settle_price,unit_price,settle_type,is_deleted)').order('key'),
      packageType === 'business'
        ? supabase.from('biz_budget_items').select('id,biz_id,item_name,support_unit_amount,planned_people_count').eq('category', 'product_operation').eq('sale_type', 'package').or('is_deleted.is.null,is_deleted.eq.false').order('sort_order')
        : Promise.resolve({ data: [] }),
      packageType === 'business'
        ? supabase.from('biz_budget_item_packages').select('*').or('is_deleted.is.null,is_deleted.eq.false')
        : Promise.resolve({ data: [] }),
    ])
    setPackages((pkgR.data || []).filter(pkg => (pkg.package_type || 'general') === packageType && pkg.is_deleted !== true))
    setZones(zoneR.data || [])
    setVendors((vendorR.data || []).map(vendor => ({
      ...vendor,
      vendor_programs: activeVendorPrograms(vendor.vendor_programs),
    })))
    setBusinessPackageOptions(bizItemR.data || [])
    setBusinessPackageLinks(linkR.data || [])
  }, [packageType])
  useEffect(() => { load() }, [load])

  const packageZoneCodes = pkg => {
    const linked = (pkg?.package_zones || []).filter(z => z && z.is_deleted !== true).map(z => z.zone_code).filter(Boolean)
    return linked.length ? [...new Set(linked)] : (pkg?.zone_code ? [pkg.zone_code] : [])
  }
  const packageZoneLabel = pkg => {
    const codes = packageZoneCodes(pkg)
    if (!codes.length) return '-'
    const names = codes.map(code => zones.find(z => z.code === code)?.name || code)
    return names.length <= 2 ? names.join(' · ') : `${names.length}구역`
  }

  async function openNew() {
    setForm({ code: '', zone_code: '', zone_codes: [], name: '', pax_limit: 0, total_price: 0, package_type: packageType, budget_item_id: '' })
    setProgs([])
    setProgForm(emptyPackageProgForm)
    setEditingProgId(null)
    setModal({ mode: 'new' })
  }

  function openEdit(p) {
    const zoneCodes = packageZoneCodes(p)
    const activeProgs = activePackagePrograms(p.package_programs)
    setForm({ id: p.id, code: p.code || '', zone_code: p.zone_code || zoneCodes[0] || '', zone_codes: zoneCodes, name: p.name, pax_limit: p.pax_limit || 0, total_price: p.total_price || 0, package_type: p.package_type || packageType, budget_item_id: linkedBudgetItemIdForPackage(p.id) })
    setProgs(activeProgs)
    setProgForm(nextPackageProgForm(activeProgs, zoneCodes[0] || ''))
    setEditingProgId(null)
    setModal({ mode: 'edit', data: p })
  }

  function nextPackageProgramSortOrder(items = progs) {
    const orders = (items || []).map(item => Number(item.sort_order) || 0).filter(order => order > 0)
    return orders.length ? Math.max(...orders) + 1 : 1
  }

  function nextPackageProgForm(items = progs, zoneCode = progForm.zone_code || '') {
    return {
      ...emptyPackageProgForm,
      zone_code: zoneCode,
      sort_order: nextPackageProgramSortOrder(items),
    }
  }

  async function togglePackageZone(zoneCode) {
    const current = Array.isArray(form.zone_codes) ? form.zone_codes : []
    const nextZones = current.includes(zoneCode)
      ? current.filter(code => code !== zoneCode)
      : [...current, zoneCode]
    const primaryZone = nextZones[0] || ''
    if (modal?.mode === 'new' && primaryZone && !form.code) {
      const code = await genPackageCode(primaryZone)
      setForm(f => ({ ...f, zone_codes: nextZones, zone_code: primaryZone, code }))
    } else {
      setForm(f => ({ ...f, zone_codes: nextZones, zone_code: primaryZone }))
    }
    setProgForm(f => ({
      ...f,
      zone_code: nextZones.includes(f.zone_code) ? f.zone_code : primaryZone,
    }))
  }

  async function syncPackageZones(packageId, zoneCodes) {
    if (!packageId) return
    const now = new Date().toISOString()
    await supabase.from('package_zones').update({ is_deleted: true, deleted_at: now, updated_at: now }).eq('package_id', packageId)
    const rows = [...new Set(zoneCodes || [])].filter(Boolean).map(zone_code => ({
      package_id: packageId,
      zone_code,
      is_deleted: false,
      deleted_at: null,
      updated_at: now,
    }))
    if (rows.length) {
      const { error } = await supabase.from('package_zones').insert(rows)
      if (error) throw error
    }
  }

  const linkedBudgetItemIdForPackage = packageId => {
    const link = businessPackageLinks.find(item =>
      String(item.package_id || '') === String(packageId || '') &&
      item.is_deleted !== true
    )
    return link?.budget_item_id ? String(link.budget_item_id) : ''
  }

  async function syncBusinessPackageBudgetItem(packageId, budgetItemId) {
    if (packageType !== 'business' || !packageId) return
    const now = new Date().toISOString()
    await supabase
      .from('biz_budget_item_packages')
      .update({ is_deleted: true, deleted_at: now, updated_at: now })
      .eq('package_id', packageId)
    if (!budgetItemId) return
    const { error } = await supabase.from('biz_budget_item_packages').insert({
      budget_item_id: Number(budgetItemId),
      package_id: packageId,
      is_primary: true,
    })
    if (error) throw error
  }

  async function save() {
    if (!form.name) { alert('패키지명을 입력하세요.'); return }
    const packageName = String(form.name || '').trim()
    const duplicate = packages.find(pkg =>
      String(pkg.id || '') !== String(form.id || '') &&
      (pkg.package_type || 'general') === packageType &&
      String(pkg.name || '').trim().toLowerCase() === packageName.toLowerCase()
    )
    if (duplicate) {
      const typeLabel = packageType === 'business' ? '하위 사업비 패키지' : '일반 패키지'
      alert(`"${packageName}" ${typeLabel}가 이미 있습니다.\n\n새로 만들지 말고 기존 패키지를 수정하세요. 사업비 패키지는 하위 패키지 수정 화면에서 상위 사업비 상품을 선택해 연결합니다.`)
      return
    }
    const zoneCodes = Array.isArray(form.zone_codes) ? form.zone_codes.filter(Boolean) : (form.zone_code ? [form.zone_code] : [])
    const payload = { code: form.code || null, zone_code: zoneCodes[0] || null, name: packageName, pax_limit: Number(form.pax_limit) || 0, total_price: Number(form.total_price) || 0, package_type: packageType }
    let packageId = form.id
    if (modal.mode === 'new') {
      const { data, error } = await supabase.from('packages').insert(payload).select('id').single()
      if (error) {
        if (error.code === '23505' || String(error.message || '').includes('packages_name_type_active_uidx')) {
          alert(`"${packageName}" 패키지가 이미 있습니다. 기존 패키지를 수정하거나 사업비 상품에 연결해 주세요.`)
        } else {
          alert('저장 실패: ' + error.message)
        }
        return
      }
      packageId = data?.id
    } else {
      const { error } = await supabase.from('packages').update(payload).eq('id', form.id)
      if (error) {
        if (error.code === '23505' || String(error.message || '').includes('packages_name_type_active_uidx')) {
          alert(`"${packageName}" 패키지가 이미 있습니다. 다른 이름을 사용하거나 기존 패키지를 수정해 주세요.`)
        } else {
          alert('저장 실패: ' + error.message)
        }
        return
      }
    }
    try {
      await syncPackageZones(packageId, zoneCodes)
      await syncBusinessPackageBudgetItem(packageId, form.budget_item_id)
    } catch (error) {
      alert('구역 저장 실패: ' + error.message)
      return
    }
    setModal(null); load()
  }

  async function del() {
    if (!confirm(`"${modal.data.name}" 패키지를 삭제하시겠습니까?`)) return
    const now = new Date().toISOString()
    await supabase.from('package_zones').update({ is_deleted: true, deleted_at: now, updated_at: now }).eq('package_id', modal.data.id)
    await supabase.from('package_programs').update({ is_deleted: true, deleted_at: now }).eq('package_id', modal.data.id)
    if (packageType === 'business') {
      await supabase.from('biz_budget_item_packages').update({ is_deleted: true, deleted_at: now, updated_at: now }).eq('package_id', modal.data.id)
    }
    const { error } = await supabase.from('packages').update({ is_deleted: true, deleted_at: now }).eq('id', modal.data.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setModal(null); load()
  }

  async function addProg() {
    if (!modal.data?.id) { alert('패키지를 먼저 저장하세요.'); return }
    if (!progForm.vendor_key || !progForm.prog_name) { alert('업체와 프로그램명을 입력하세요.'); return }
    const programZoneCode = progForm.zone_code || (form.zone_codes || [])[0] || form.zone_code
    if (!programZoneCode) { alert('프로그램 구역을 선택하세요.'); return }
    const { zone_code, ...programFormPayload } = progForm
    const payload = {
      ...programFormPayload,
      package_id: modal.data.id,
      sort_order: Number(progForm.sort_order) || nextPackageProgramSortOrder(),
      vendor_settle_price: Number(progForm.vendor_settle_price) || 0,
      settle_type: progForm.settle_type || 'per_person',
      price_note: progForm.price_note || null,
    }
    if (editingProgId) {
      const current = progs.find(item => item.id === editingProgId)
      const currentZoneCode = String(current?.code || '').split('-')[0]
      if (currentZoneCode !== programZoneCode || current?.vendor_key !== progForm.vendor_key) {
        payload.code = await genProgCode(programZoneCode, progForm.vendor_key, 'package_programs')
      }
      const { error } = await supabase.from('package_programs').update(payload).eq('id', editingProgId)
      if (error) { alert('수정 실패: ' + error.message); return }
    } else {
      const code = await genProgCode(programZoneCode, progForm.vendor_key, 'package_programs')
      const { error } = await supabase.from('package_programs').insert({ ...payload, code })
      if (error) { alert('추가 실패: ' + error.message); return }
    }
    const { data } = await supabase.from('package_programs').select('*, vendors(key,name,color)').eq('package_id', modal.data.id).or('is_deleted.is.null,is_deleted.eq.false').order('sort_order')
    setProgs(data || [])
    setProgForm(nextPackageProgForm(data || [], programZoneCode))
    setEditingProgId(null)
    load()
  }

  function editProg(p) {
    const codePrefix = String(p.code || '').split('-')[0]
    setEditingProgId(p.id)
    setProgForm({
      zone_code: zones.some(z => z.code === codePrefix) ? codePrefix : ((form.zone_codes || [])[0] || form.zone_code || ''),
      vendor_key: p.vendor_key || '',
      prog_name: p.prog_name || '',
      default_start: p.default_start?.slice(0, 5) || '09:00',
      default_end: p.default_end?.slice(0, 5) || '10:00',
      sort_order: p.sort_order || 0,
      vendor_settle_price: packageProgramSettlePrice(p) || '',
      settle_type: p.settle_type || 'per_person',
      price_note: p.price_note || '',
    })
  }

  function cancelProgEdit() {
    setEditingProgId(null)
    setProgForm(nextPackageProgForm())
  }

  async function delProg(id) {
    const { error } = await supabase.from('package_programs').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setProgs(prev => prev.filter(program => program.id !== id))
    if (editingProgId === id) cancelProgEdit()
    else setProgForm(f => ({ ...f, sort_order: nextPackageProgramSortOrder(progs.filter(program => program.id !== id)) }))
    load()
  }

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))
  const handlePackageNameSelect = name => {
    const item = businessPackageOptions.find(option => option.item_name === name)
    setForm(f => ({
      ...f,
      total_price: item ? Number(item.support_unit_amount) || f.total_price || 0 : f.total_price,
      pax_limit: item ? Number(item.planned_people_count) || f.pax_limit || 0 : f.pax_limit,
    }))
  }
  const vendorProgramOptions = vendorKey => vendors.find(v => v.key === vendorKey)?.vendor_programs || []
  const findVendorProgram = (vendorKey, progName) => vendorProgramOptions(vendorKey).find(p => p.prog_name === progName)
  const vendorProgramSettlePrice = (vendorKey, progName) => {
    const vendorProgram = findVendorProgram(vendorKey, progName)
    return Number(vendorProgram?.vendor_settle_price ?? vendorProgram?.unit_price ?? 0) || 0
  }
  const packageProgramSettlePrice = packageProgram => {
    const storedPrice = Number(packageProgram?.vendor_settle_price) || 0
    return storedPrice || vendorProgramSettlePrice(packageProgram?.vendor_key, packageProgram?.prog_name)
  }
  const packageProgramZoneCode = packageProgram => String(packageProgram?.code || '').split('-')[0]
  const zoneTone = zoneCode => {
    const tones = ['#4ECDC4', '#F7C948', '#7B68EE', '#FF8C42', '#5CB85C', '#B8B8FF']
    const index = Math.max(0, (form.zone_codes || []).indexOf(zoneCode))
    return tones[index % tones.length]
  }
  const packageProgramZoneName = packageProgram => {
    const codePrefix = packageProgramZoneCode(packageProgram)
    return zones.find(z => z.code === codePrefix)?.name || codePrefix || '-'
  }
  const groupedPackagePrograms = () => {
    const selectedCodes = form.zone_codes || []
    const groups = selectedCodes.map(code => ({ code, name: zones.find(z => z.code === code)?.name || code, programs: [] }))
    const fallback = { code: 'none', name: '구역 미지정', programs: [] }
    for (const program of progs) {
      const code = packageProgramZoneCode(program)
      const group = groups.find(item => item.code === code)
      if (group) group.programs.push(program)
      else fallback.programs.push(program)
    }
    return fallback.programs.length ? [...groups, fallback] : groups
  }
  const applyVendorProgramDefaults = (vendorKey, progName) => {
    const vendorProgram = findVendorProgram(vendorKey, progName)
    return {
      vendor_settle_price: vendorProgram ? Number(vendorProgram.vendor_settle_price ?? vendorProgram.unit_price ?? 0) : '',
      settle_type: vendorProgram?.settle_type || 'per_person',
    }
  }
  const handleProgVendorChange = vendorKey => {
    setProgForm(f => ({ ...f, vendor_key: vendorKey, prog_name: '', vendor_settle_price: '', settle_type: 'per_person' }))
  }
  const handleProgNameChange = progName => {
    setProgForm(f => ({ ...f, prog_name: progName, ...applyVendorProgramDefaults(f.vendor_key, progName) }))
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">{title} <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{packages.length}개</span></div>
        <button className="btn-primary" onClick={openNew}>{addLabel}</button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        {packages.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{emptyText}</div>}
        {packages.map(p => {
          const pp = activePackagePrograms(p.package_programs)
          const vkeys = [...new Set(pp.map(pr => pr.vendor_key))]
          const isOpen = !!expanded[p.id]
          return (
            <div key={p.id} style={{ borderBottom: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', cursor: 'pointer' }} onClick={() => toggle(p.id)}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '10px', display: 'inline-block', transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : '' }}>▶</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="no-col">{packageZoneLabel(p)}</span>
                    {p.code && <span style={{ fontSize: '10px', fontFamily: 'DM Mono,monospace', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '1px 6px', color: 'var(--text-muted)' }}>{p.code}</span>}
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</span>
                    {Number(p.total_price) > 0 && <span style={{ fontSize: '10px', background: 'rgba(78,205,196,0.1)', color: 'var(--accent)', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>판매 ₩{Number(p.total_price).toLocaleString()}</span>}
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{pr.prog_name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--amber)', fontFamily: 'DM Mono,monospace', whiteSpace: 'nowrap' }}>
                              정산 ₩{packageProgramSettlePrice(pr).toLocaleString()}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(78,205,196,0.08)', borderRadius: '4px', padding: '1px 5px' }}>
                              {pr.settle_type === 'fixed' ? '고정' : '1인당'}
                            </span>
                          </div>
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
        <Modal title={modal.mode === 'new' ? '패키지 추가' : '패키지 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null} maxWidth="640px">
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="구역" required>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {zones.map(z => {
                  const active = (form.zone_codes || []).includes(z.code)
                  return (
                    <button
                      key={z.code}
                      type="button"
                      className={active ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
                      onClick={() => togglePackageZone(z.code)}
                      style={{ height: '32px', minWidth: '86px', justifyContent: 'center' }}
                    >
                      {z.name}
                    </button>
                  )
                })}
              </div>
              <select className="form-select" style={{ display: 'none' }} value={form.zone_code || ''} onChange={e => togglePackageZone(e.target.value)}>
                <option value="">선택</option>
                {zones.map(z => <option key={z.code} value={z.code}>{z.code} · {z.name}</option>)}
              </select>
            </Field>
            <Field label="패키지코드" auto={modal.mode === 'new'}>
              <input className="form-input auto-fill" value={form.code || ''} readOnly />
            </Field>
            <Field label={packageType === 'business' ? '하위 사업비 패키지명' : '패키지명'} required>
              <input className="form-input" value={form.name || ''} onChange={e => inp('name', e.target.value)} placeholder={packageType === 'business' ? '예: 금소베케이션, 금양연화 변형A' : '금양연화'} />
            </Field>
            <Field label="인원 알림 기준">
              <input className="form-input" type="number" value={form.pax_limit || 0} onChange={e => inp('pax_limit', e.target.value)} placeholder="0=미설정" />
            </Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            {packageType === 'business' && (
              <Field label="상위 사업비 상품">
                <select className="form-select" value={form.budget_item_id || ''} onChange={e => inp('budget_item_id', e.target.value)}>
                  <option value="">연결 안 함</option>
                  {businessPackageOptions.map(item => (
                    <option key={item.id} value={item.id}>{item.item_name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="패키지 판매가(원)">
              <input className="form-input" inputMode="numeric" value={numberInputValue(form.total_price)} onChange={e => inp('total_price', numberInputChange(e.target.value))} />
            </Field>
          </div>

          {modal.mode === 'edit' && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingProgId ? '프로그램 일정 수정' : '프로그램 일정'} <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
              </div>
              <div className="form-grid form-grid-3" style={{ marginBottom: '8px', gap: '8px' }}>
                <Field label="구성 구역">
                  <select className="form-select" value={progForm.zone_code || ''} onChange={e => setProgForm(f => ({ ...f, zone_code: e.target.value }))}>
                    <option value="">패키지 구역 선택</option>
                    {(form.zone_codes || []).map(code => {
                      const zone = zones.find(z => z.code === code)
                      return <option key={code} value={code}>{zone?.name || code}</option>
                    })}
                  </select>
                </Field>
                <Field label="업체">
                  <select className="form-select" value={progForm.vendor_key} onChange={e => handleProgVendorChange(e.target.value)}>
                    <option value="">선택</option>
                    {vendors.map(v => <option key={v.key} value={v.key}>{v.key} · {v.name.replace(/\s*\(.*\)/, '')}</option>)}
                  </select>
                </Field>
                <Field label="프로그램명">
                  {(() => {
                    const vProgs = vendorProgramOptions(progForm.vendor_key)
                    return vProgs.length > 0 ? (
                      <select className="form-select" value={progForm.prog_name} onChange={e => handleProgNameChange(e.target.value)}>
                        <option value="">선택</option>
                        {vProgs.map(p => <option key={p.prog_name} value={p.prog_name}>{p.prog_name}</option>)}
                      </select>
                    ) : (
                      <input className="form-input" placeholder={progForm.vendor_key ? '프로그램 없음' : '업체 먼저 선택'} value={progForm.prog_name} onChange={e => setProgForm(f => ({ ...f, prog_name: e.target.value }))} />
                    )
                  })()}
                </Field>
                <Field label="순서"><input className="form-input" type="number" value={progForm.sort_order} onChange={e => setProgForm(f => ({ ...f, sort_order: e.target.value }))} /></Field>
              </div>
              <div className="form-grid form-grid-2" style={{ marginBottom: '8px', gap: '8px' }}>
                <Field label="기본 시작시간"><input className="form-input" type="time" value={progForm.default_start} onChange={e => setProgForm(f => ({ ...f, default_start: e.target.value }))} /></Field>
                <Field label="기본 종료시간"><input className="form-input" type="time" value={progForm.default_end} onChange={e => setProgForm(f => ({ ...f, default_end: e.target.value }))} /></Field>
              </div>
              <div className="form-grid form-grid-3" style={{ marginBottom: '8px', gap: '8px' }}>
                <Field label="업체 정산단가">
                  <input className="form-input" inputMode="numeric" value={numberInputValue(progForm.vendor_settle_price)} onChange={e => setProgForm(f => ({ ...f, vendor_settle_price: numberInputChange(e.target.value) }))} placeholder="20,000" />
                </Field>
                <Field label="정산방식">
                  <select className="form-select" value={progForm.settle_type} onChange={e => setProgForm(f => ({ ...f, settle_type: e.target.value }))}>
                    <option value="per_person">인원당</option>
                    <option value="fixed">고정금액</option>
                  </select>
                </Field>
                <Field label="가격 메모">
                  <input className="form-input" value={progForm.price_note || ''} onChange={e => setProgForm(f => ({ ...f, price_note: e.target.value }))} placeholder="패키지 특별단가 등" />
                </Field>
              </div>
              <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                일반 패키지는 고객에게 패키지 판매가로 받고, 구성 프로그램별 업체 정산단가만 따로 저장합니다.
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button className="btn-add-row" onClick={addProg} style={{ flex: 1 }}>{editingProgId ? '수정 저장' : '+ 추가'}</button>
                {editingProgId && <button className="btn-outline" onClick={cancelProgEdit} style={{ height: '34px' }}>취소</button>}
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                {progs.length === 0 && <div className="list-box-empty">프로그램 없음</div>}
                {groupedPackagePrograms().map(group => {
                  const tone = zoneTone(group.code)
                  return (
                    <div key={group.code} style={{ border: '1px solid var(--border2)', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,.015)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', background: 'rgba(255,255,255,.025)', borderBottom: '1px solid var(--border2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: tone, flexShrink: 0 }} />
                          <span style={{ color: tone, fontWeight: 900, fontSize: '12px' }}>{group.name}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{group.programs.length}개</span>
                        </div>
                      </div>
                      {group.programs.length === 0 ? (
                        <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>이 구역에 등록된 프로그램 없음</div>
                      ) : (
                        <div className="list-box" style={{ border: 0, borderRadius: 0 }}>
                          <div className="list-box-header" style={{ gridTemplateColumns: '28px 54px 92px minmax(106px,1fr) 72px 48px 46px 28px', gap: '6px' }}><span>순</span><span>업체</span><span>코드</span><span>프로그램</span><span>정산단가</span><span>방식</span><span>시간</span><span /></div>
                          {group.programs.map(p => (
                            <div key={p.id} className="list-box-row" onClick={() => editProg(p)} style={{ gridTemplateColumns: '28px 54px 92px minmax(106px,1fr) 72px 48px 46px 28px', gap: '6px', cursor: 'pointer', background: editingProgId === p.id ? 'rgba(78,205,196,0.08)' : undefined }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{p.sort_order}</span>
                              <span className="no-col">{p.vendor_key}</span>
                              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.code || '-'}</span>
                              <span style={{ fontSize: '12px' }}>{p.prog_name}</span>
                              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '11px', color: 'var(--amber)' }}>₩{packageProgramSettlePrice(p).toLocaleString()}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.settle_type === 'fixed' ? '고정' : '1인'}</span>
                              <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '10px', color: 'var(--text-muted)' }}>{p.default_start?.slice(0, 5)}</span>
                              <button className="icon-btn" onClick={e => { e.stopPropagation(); delProg(p.id) }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
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
    await supabase.from('lodges').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('vendor_id', vendorModal.data.id)
    await supabase.from('lodge_vendors').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', vendorModal.data.id)
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
    await supabase.from('lodges').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', spaceModal.data.id)
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
              <input className="form-input" inputMode="numeric" value={numberInputValue(roomForm.price)} onChange={e => setRoomForm(f => ({ ...f, price: numberInputChange(e.target.value) }))} placeholder="150,000" />
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
    await supabase.from('platforms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', modal.data.id)
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
    await supabase.from('drivers').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', modal.data.id)
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
function OldBizTab() {
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
    await supabase.from('biz').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', modal.data.id)
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
    await supabase.from('biz_payments').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
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
                <Field label="금액(원)"><input className="form-input" inputMode="numeric" value={numberInputValue(payForm.amount)} onChange={e => setPayForm(f => ({ ...f, amount: numberInputChange(e.target.value) }))} /></Field>
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

function BizTab() {
  const [bizList, setBizList] = useState([])
  const [items, setItems] = useState([])
  const [itemPackageLinks, setItemPackageLinks] = useState([])
  const [budgetUsages, setBudgetUsages] = useState([])
  const [reservations, setReservations] = useState([])
  const [zones, setZones] = useState([])
  const [packages, setPackages] = useState([])
  const [vendors, setVendors] = useState([])
  const [modal, setModal] = useState(null)
  const [bizModal, setBizModal] = useState(null)
  const [form, setForm] = useState({})
  const [bizForm, setBizForm] = useState({})
  const [selectedBizId, setSelectedBizId] = useState('')

  const load = useCallback(async () => {
    const [bizR, itemR, zoneR, pkgR, vendorR, linkR, usageR, reservationR] = await Promise.all([
      supabase.from('biz').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('name'),
      supabase.from('biz_budget_items').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('sort_order'),
      supabase.from('zones').select('*').order('code'),
      supabase.from('packages').select('*, package_zones(*), package_programs(*, vendors(key,name,color))').or('is_deleted.is.null,is_deleted.eq.false').order('zone_code').order('name'),
      supabase.from('vendors').select('key,name,color,vendor_programs(prog_name,customer_price,vendor_settle_price,unit_price,settle_type,is_deleted)').or('is_deleted.is.null,is_deleted.eq.false').order('key'),
      supabase.from('biz_budget_item_packages').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('reservation_budget_usages').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('reservations').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
    ])
    setBizList(bizR.data || [])
    setItems(itemR.data || [])
    setZones(zoneR.data || [])
    setPackages((pkgR.data || []).filter(pkg => (pkg.package_type || 'general') === 'business'))
    setItemPackageLinks(linkR.data || [])
    setBudgetUsages(usageR.data || [])
    setReservations(reservationR.data || [])
    setVendors((vendorR.data || []).map(vendor => ({
      ...vendor,
      vendor_programs: activeVendorPrograms(vendor.vendor_programs),
    })))
  }, [])
  useEffect(() => { load() }, [load])

  const products = items
    .filter(item => item.category === 'product_operation' && item.is_active !== false)
    .filter(item => !selectedBizId || String(item.biz_id || '') === String(selectedBizId))
  const findPromo = product => items.find(item =>
    item.category === 'promotion_discount' &&
    item.item_name === product.item_name &&
    (item.sale_type || 'package') === (product.sale_type || 'package') &&
    String(item.biz_id || '') === String(product.biz_id || '') &&
    item.is_active !== false
  )
  const money = value => `₩${Number(value || 0).toLocaleString()}`
  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const bizInp = (k, v) => setBizForm(f => ({ ...f, [k]: v }))
  const packageZoneCodes = pkg => {
    const linked = (pkg?.package_zones || []).filter(z => z && z.is_deleted !== true).map(z => z.zone_code).filter(Boolean)
    return linked.length ? [...new Set(linked)] : (pkg?.zone_code ? [pkg.zone_code] : [])
  }
  const packageMatchesZone = (pkg, zoneCode) => !zoneCode || packageZoneCodes(pkg).includes(zoneCode)
  const packageZoneLabel = pkg => {
    const codes = packageZoneCodes(pkg)
    if (!codes.length) return '-'
    const names = codes.map(code => zones.find(z => z.code === code)?.name || code)
    return names.length <= 2 ? names.join(' · ') : `${names.length}구역`
  }
  const linkedPackageIdsForProduct = productId => {
    const ids = itemPackageLinks
      .filter(link => String(link.budget_item_id) === String(productId) && link.is_deleted !== true)
      .map(link => String(link.package_id))
      .filter(Boolean)
    return [...new Set(ids)]
  }
  const selectedLinkedPackageIds = () => {
    const ids = Array.isArray(form.package_ids) ? form.package_ids.map(String).filter(Boolean) : []
    return [...new Set(ids)]
  }
  const normalUnit = Number(form.support_unit_amount) || 0
  const plannedPeople = Number(form.planned_people_count) || 0
  const discountRate = Number(form.discount_rate) || 0
  const discountPeople = Number(form.discount_people_count) || 0
  const prepaidUnit = Math.round(normalUnit * discountRate / 100)
  const productBudget = plannedPeople * normalUnit
  const promoBudget = discountPeople * prepaidUnit

  const activeBudgetUsages = budgetUsages.filter(usage =>
    usage &&
    usage.is_deleted !== true &&
    usage.operation_type === 'business'
  )

  const sumRows = (rows, picker) => rows.reduce((total, row) => total + (Number(picker(row)) || 0), 0)

  function groupBudgetRowsByReservation(rows) {
    const grouped = new Map()
    for (const row of rows || []) {
      const key = String(row.reservation_no || '')
      if (!key) continue
      const prev = grouped.get(key)
      if (!prev || (Number(row.people_count) || 0) > (Number(prev.people_count) || 0)) {
        grouped.set(key, { ...row })
        continue
      }
      if (prev) {
        prev.zone_codes = [...new Set([...(prev.zone_codes || []), ...(row.zone_codes || [])].filter(Boolean))]
        if (!prev.zone_code && row.zone_code) prev.zone_code = row.zone_code
        if (!prev.zone_name && row.zone_name) prev.zone_name = row.zone_name
      }
    }
    return [...grouped.values()]
  }

  function usageStatsForProduct(product) {
    const promo = findPromo(product)
    const rawProductRows = activeBudgetUsages.filter(usage =>
      usage.usage_type === 'product_operation' &&
      String(usage.budget_item_id || '') === String(product?.id || '')
    )
    const rawPromoRows = activeBudgetUsages.filter(usage =>
      usage.usage_type === 'promotion_discount' &&
      String(usage.budget_item_id || '') === String(promo?.id || '')
    )
    const productRows = groupBudgetRowsByReservation(rawProductRows)
    const promoRows = groupBudgetRowsByReservation(rawPromoRows)
    const usedPeople = sumRows(productRows, row => row.people_count)
    const discountUsedPeople = sumRows(promoRows, row => row.people_count)
    const supportUsedAmount = sumRows(promoRows, row => row.used_amount || row.prepaid_total_amount)
    const reimbursedAmount = sumRows(promoRows, row => row.reimbursed_amount)
    const supportBudget = Number(promo?.total_budget_amount) || 0
    const usageRows = productRows
      .map(row => {
        const promoRow = promoRows.find(promoRow =>
          String(promoRow.reservation_no || '') === String(row.reservation_no || '') &&
          (
            (promoRow.component_uid && row.component_uid && String(promoRow.component_uid) === String(row.component_uid)) ||
            (promoRow.package_id && row.package_id && String(promoRow.package_id) === String(row.package_id)) ||
            (promoRow.item_name && row.item_name && String(promoRow.item_name) === String(row.item_name)) ||
            promoRows.length === 1
          )
        )
        const reservation = reservations.find(reservation => String(reservation.no || '') === String(row.reservation_no || ''))
        const supportAmount = Number(promoRow?.used_amount || promoRow?.prepaid_total_amount) || 0
        const reimbursed = Number(promoRow?.reimbursed_amount) || 0
        return {
          key: `${row.reservation_no || 'no'}-${row.component_uid || row.id}`,
          reservationNo: row.reservation_no || '-',
          date: reservation?.date || row.reservation_date || '-',
          customerName: reservation?.name || reservation?.customer_name || row.customer_name || '-',
          itemName: row.package_name || row.item_name || '-',
          people: Number(row.people_count) || 0,
          supportAmount,
          unpaidSupportAmount: Math.max(supportAmount - reimbursed, 0),
          appliedSupport: supportAmount > 0,
        }
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.reservationNo).localeCompare(String(b.reservationNo)))
    return {
      promo,
      usedPeople,
      discountUsedPeople,
      supportUsedAmount,
      reimbursedAmount,
      unpaidSupportAmount: Math.max(supportUsedAmount - reimbursedAmount, 0),
      remainingSupportBudget: Math.max(supportBudget - supportUsedAmount, 0),
      productRowCount: productRows.length,
      promoRowCount: promoRows.length,
      usageRows,
    }
  }

  const modalUsageStats = form.product_id
    ? usageStatsForProduct({ ...form, id: form.product_id, sale_type: 'package' })
    : null

  function blankForm() {
    return {
      sale_type: 'package',
      biz_id: '',
      zone_code: '',
      item_name: '',
      package_id: '',
      package_ids: [],
      planned_people_count: 0,
      support_unit_amount: 0,
      discount_rate: 0,
      discount_people_count: 0,
      default_reimbursement_target: '',
      memo: '',
    }
  }

  function openNew() {
    setForm({ ...blankForm(), biz_id: selectedBizId || '' })
    setModal({ mode: 'new' })
  }

  function openNewBiz() {
    const now = new Date()
    setBizForm({
      name: '',
      start_year: now.getFullYear(),
      start_month: 1,
      start_day: 1,
      end_year: now.getFullYear(),
      end_month: 12,
      end_day: 31,
    })
    setBizModal({ mode: 'new' })
  }

  function openEditBiz(biz) {
    setBizForm({ ...biz })
    setBizModal({ mode: 'edit', data: biz })
  }

  function toggleBizFilter(bizId) {
    setSelectedBizId(current => current === String(bizId) ? '' : String(bizId))
  }

  function openEdit(product) {
    const promo = findPromo(product)
    setForm({
      product_id: product.id,
      promo_id: promo?.id || null,
      sale_type: 'package',
      biz_id: product.biz_id || '',
      zone_code: product.zone_code || '',
      item_name: product.item_name || '',
      package_id: product.package_id || '',
      package_ids: linkedPackageIdsForProduct(product.id).length
        ? linkedPackageIdsForProduct(product.id)
        : (product.package_id ? [String(product.package_id)] : []),
      planned_people_count: Number(product.planned_people_count) || 0,
      support_unit_amount: Number(product.support_unit_amount) || 0,
      discount_rate: Number(promo?.support_rate) || 0,
      discount_people_count: Number(promo?.planned_people_count) || 0,
      default_reimbursement_target: promo?.default_reimbursement_target || product.default_reimbursement_target || '',
      memo: product.memo || '',
    })
    setModal({ mode: 'edit', data: product })
  }

  async function save() {
    if (!form.item_name) { alert('사업비 상품명을 입력하세요.'); return }
    const itemName = form.item_name.trim()
    const base = {
      biz_id: form.biz_id || null,
      zone_code: form.zone_code || null,
      item_name: itemName,
      sale_type: 'package',
      package_id: null,
      vendor_key: null,
      prog_name: null,
      vendor_settle_price: 0,
      settle_type: form.settle_type || 'per_person',
      match_package_name: itemName,
      match_program_name: null,
      default_reimbursement_target: form.default_reimbursement_target || null,
      memo: form.memo || null,
      is_active: true,
      is_deleted: false,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }
    const productPayload = {
      ...base,
      category: 'product_operation',
      support_rate: 0,
      planned_people_count: plannedPeople,
      support_unit_amount: normalUnit,
      total_budget_amount: productBudget,
      sort_order: Number(form.product_id) || 100,
    }
    const promoPayload = {
      ...base,
      category: 'promotion_discount',
      support_rate: discountRate,
      planned_people_count: discountPeople,
      support_unit_amount: prepaidUnit,
      total_budget_amount: promoBudget,
      sort_order: (Number(form.product_id) || 100) + 100,
    }

    let productId = form.product_id
    if (form.product_id) {
      const { error } = await supabase.from('biz_budget_items').update(productPayload).eq('id', form.product_id)
      if (error) { alert('사업비 상품 저장 실패: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('biz_budget_items').insert(productPayload).select('id').single()
      if (error) { alert('사업비 상품 저장 실패: ' + error.message); return }
      productId = data?.id
    }

    if (discountRate > 0 && discountPeople > 0) {
      if (form.promo_id) {
        const { error } = await supabase.from('biz_budget_items').update(promoPayload).eq('id', form.promo_id)
        if (error) { alert('지원금 기준 저장 실패: ' + error.message); return }
      } else {
        const { error } = await supabase.from('biz_budget_items').insert(promoPayload)
        if (error) { alert('지원금 기준 저장 실패: ' + error.message); return }
      }
    } else if (form.promo_id) {
      await supabase.from('biz_budget_items').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', form.promo_id)
    }

    setModal(null)
    load()
  }

  async function del() {
    if (!confirm(`"${form.item_name}" 사업비 패키지를 삭제하시겠습니까?`)) return
    const now = new Date().toISOString()
    if (form.product_id) await supabase.from('biz_budget_items').update({ is_deleted: true, is_active: false, deleted_at: now }).eq('id', form.product_id)
    if (form.promo_id) await supabase.from('biz_budget_items').update({ is_deleted: true, is_active: false, deleted_at: now }).eq('id', form.promo_id)
    setModal(null)
    load()
  }

  async function saveBiz() {
    if (!bizForm.name) { alert('사업명을 입력하세요.'); return }
    const payload = {
      name: bizForm.name,
      start_year: Number(bizForm.start_year) || new Date().getFullYear(),
      start_month: Number(bizForm.start_month) || 1,
      start_day: Number(bizForm.start_day) || 1,
      end_year: Number(bizForm.end_year) || new Date().getFullYear(),
      end_month: Number(bizForm.end_month) || 12,
      end_day: Number(bizForm.end_day) || 31,
      is_deleted: false,
      deleted_at: null,
    }

    if (bizModal.mode === 'new') {
      const { error } = await supabase.from('biz').insert(payload)
      if (error) { alert('사업명 저장 실패: ' + error.message); return }
    } else {
      const { error } = await supabase.from('biz').update(payload).eq('id', bizForm.id)
      if (error) { alert('사업명 저장 실패: ' + error.message); return }
    }
    setBizModal(null)
    load()
  }

  async function deleteBiz() {
    if (!confirm(`"${bizForm.name}" 사업명을 삭제하시겠습니까? 연결된 사업비 패키지는 사업명 미지정으로 보일 수 있습니다.`)) return
    const { error } = await supabase
      .from('biz')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', bizForm.id)
    if (error) { alert('사업명 삭제 실패: ' + error.message); return }
    setBizModal(null)
    load()
  }

  return (
    <div>
      <div className="list-card" style={{ padding: '14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>사업명 관리</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>예: 로컬크리에이트. 사업명을 먼저 만들고, 아래 사업비 상품과 하위 패키지를 연결합니다.</div>
          </div>
          <button className="btn-outline btn-sm" onClick={openNewBiz}>+ 사업명 추가</button>
        </div>
        {bizList.length === 0 ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            등록된 사업명이 없습니다. + 사업명 추가로 로컬크리에이트를 먼저 등록하세요.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {bizList.map(biz => {
              const active = selectedBizId === String(biz.id)
              return (
                <div key={biz.id} style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${active ? 'rgba(78,205,196,.65)' : 'var(--border)'}`, borderRadius: '7px', overflow: 'hidden', background: active ? 'rgba(78,205,196,.14)' : 'transparent' }}>
                  <button
                    className={active ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
                    onClick={() => toggleBizFilter(biz.id)}
                    style={{ height: '32px', padding: '0 12px', border: 0, borderRadius: 0 }}
                  >
                    {biz.name}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => openEditBiz(biz)}
                    title="사업명 수정"
                    style={{ width: '30px', height: '32px', border: 0, borderLeft: '1px solid var(--border2)', borderRadius: 0 }}
                  >
                    ✎
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="section-header">
        <div>
          <div className="section-title">사업비 상품 <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{products.length}개</span></div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>계획 인원, 정상 기준가, 총 지원 예산, 지원금 정산 기준을 관리하는 상위 기준입니다.</div>
        </div>
        <button className="btn-primary" onClick={openNew}>+ 사업비 상품 추가</button>
      </div>
      <div className="list-card">
        <div className="list-header" style={{ gridTemplateColumns: '.85fr 1.1fr .8fr .7fr .72fr .82fr .86fr .86fr 36px', gap: '10px' }}>
          <span>사업명</span><span>상품명</span><span>총 지원예산</span><span>체험인원</span><span>할인인원</span><span>사용지원금</span><span>남은지원예산</span><span>미정산지원금</span><span />
        </div>
        {products.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 사업비 상품 없음</div>}
        {products.map(product => {
          const promo = findPromo(product)
          const stats = usageStatsForProduct(product)
          const biz = bizList.find(b => String(b.id) === String(product.biz_id))
          const supportBudget = Number(promo?.total_budget_amount || 0)
          return (
            <div key={product.id} className="list-row" style={{ gridTemplateColumns: '.85fr 1.1fr .8fr .7fr .72fr .82fr .86fr .86fr 36px', gap: '10px', cursor: 'default' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{biz?.name || '-'}</span>
              <span style={{ fontWeight: 700 }}>{product.item_name}</span>
              <span className="mono" style={{ fontSize: '12px', color: promo ? 'var(--amber)' : 'var(--text-muted)' }}>{money(supportBudget)}</span>
              <span style={{ fontSize: '12px', color: stats.usedPeople > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{stats.usedPeople.toLocaleString()}명</span>
              <span style={{ fontSize: '12px', color: stats.discountUsedPeople > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{stats.discountUsedPeople.toLocaleString()}명</span>
              <span className="mono" style={{ fontSize: '12px', color: stats.supportUsedAmount > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{money(stats.supportUsedAmount)}</span>
              <span className="mono" style={{ fontSize: '12px', color: promo ? 'var(--green)' : 'var(--text-muted)' }}>{money(stats.remainingSupportBudget)}</span>
              <span className="mono" style={{ fontSize: '12px', color: stats.unpaidSupportAmount > 0 ? 'var(--red)' : 'var(--green)' }}>{money(stats.unpaidSupportAmount)}</span>
              <button className="icon-btn" onClick={() => openEdit(product)}>✎</button>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: '18px' }}>
        <PackagesTab
          packageType="business"
          title="하위 사업비 패키지 목록"
          addLabel="+ 하위 패키지 추가"
          emptyText="등록된 하위 사업비 패키지 없음"
        />
      </div>
      {modal && (
        <Modal title={modal.mode === 'new' ? '사업비 상품 추가' : '사업비 상품 수정'} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === 'edit' ? del : null} maxWidth="820px">
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="사업명">
              <select className="form-select" value={form.biz_id || ''} onChange={e => inp('biz_id', e.target.value)}>
                <option value="">선택 안 함</option>
                {bizList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="사업비 상품명" required><input className="form-input" value={form.item_name || ''} onChange={e => inp('item_name', e.target.value)} placeholder="금양연화" /></Field>
          </div>
          <div className="form-grid form-grid-2" style={{ marginBottom: '12px' }}>
            <Field label="지원금 정산 받을 곳 기본값"><input className="form-input" value={form.default_reimbursement_target || ''} onChange={e => inp('default_reimbursement_target', e.target.value)} placeholder="예: 길과마을" /></Field>
          </div>
          <div className="form-grid form-grid-4" style={{ marginBottom: '12px' }}>
            <Field label="정상 기준가"><input className="form-input" inputMode="numeric" value={numberInputValue(form.support_unit_amount)} onChange={e => inp('support_unit_amount', numberInputChange(e.target.value))} /></Field>
            <Field label="전체 계획 인원"><input className="form-input" type="number" value={form.planned_people_count || 0} onChange={e => inp('planned_people_count', e.target.value)} /></Field>
            <Field label="할인율(%)"><input className="form-input" type="number" value={form.discount_rate || 0} onChange={e => inp('discount_rate', e.target.value)} /></Field>
            <Field label="할인 적용 인원"><input className="form-input" type="number" value={form.discount_people_count || 0} onChange={e => inp('discount_people_count', e.target.value)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '8px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>정상가 기준 총액<b style={{ display: 'block', marginTop: '4px' }}>{money(productBudget)}</b></div>
            <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>고객 결제가<b style={{ display: 'block', marginTop: '4px', color: 'var(--accent)' }}>{money(normalUnit - prepaidUnit)}</b></div>
            <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>인당 지원금<b style={{ display: 'block', marginTop: '4px', color: 'var(--amber)' }}>{money(prepaidUnit)}</b></div>
            <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>총 지원 예산<b style={{ display: 'block', marginTop: '4px', color: 'var(--amber)' }}>{money(promoBudget)}</b></div>
          </div>
          {modalUsageStats && (
            <div style={{ border: '1px solid var(--border2)', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '8px' }}>예약 사용 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: '8px' }}>
                <div style={{ background: 'rgba(78,205,196,.07)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  체험 인원
                  <b style={{ display: 'block', marginTop: '4px', color: 'var(--accent)' }}>{modalUsageStats.usedPeople.toLocaleString()}명</b>
                  <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', fontSize: '10px' }}>계획 {plannedPeople.toLocaleString()}명</span>
                </div>
                <div style={{ background: 'rgba(247,201,72,.08)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  할인 적용 인원
                  <b style={{ display: 'block', marginTop: '4px', color: 'var(--amber)' }}>{modalUsageStats.discountUsedPeople.toLocaleString()}명</b>
                  <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', fontSize: '10px' }}>계획 {discountPeople.toLocaleString()}명</span>
                </div>
                <div style={{ background: 'rgba(247,201,72,.08)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  사용 지원금
                  <b style={{ display: 'block', marginTop: '4px', color: 'var(--amber)' }}>{money(modalUsageStats.supportUsedAmount)}</b>
                </div>
                <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  남은 지원예산
                  <b style={{ display: 'block', marginTop: '4px', color: modalUsageStats.remainingSupportBudget > 0 ? 'var(--green)' : 'var(--red)' }}>{money(modalUsageStats.remainingSupportBudget)}</b>
                </div>
                <div style={{ background: 'rgba(255,107,107,.08)', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  미정산 지원금
                  <b style={{ display: 'block', marginTop: '4px', color: modalUsageStats.unpaidSupportAmount > 0 ? 'var(--red)' : 'var(--green)' }}>{money(modalUsageStats.unpaidSupportAmount)}</b>
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '7px' }}>예약 사용 내역</div>
                {modalUsageStats.usageRows.length === 0 ? (
                  <div style={{ border: '1px dashed var(--border)', borderRadius: '7px', padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    아직 이 사업비 상품으로 카운팅된 예약이 없습니다.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '6px', maxHeight: '220px', overflow: 'auto', paddingRight: '2px' }}>
                    {modalUsageStats.usageRows.map(row => (
                      <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '.55fr .75fr minmax(0,1.2fr) .55fr .9fr .9fr', gap: '8px', alignItems: 'center', border: '1px solid var(--border2)', borderRadius: '7px', padding: '8px', fontSize: '12px' }}>
                        <span className="mono" style={{ color: 'var(--text-muted)' }}>#{row.reservationNo}</span>
                        <span>{row.date}</span>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customerName}</span>
                        <span style={{ fontWeight: 800 }}>{row.people.toLocaleString()}명</span>
                        <span style={{ color: row.appliedSupport ? 'var(--amber)' : 'var(--accent)', fontWeight: 800 }}>{row.appliedSupport ? '사업비 포함' : '인원만 카운팅'}</span>
                        <span className="mono" style={{ color: row.unpaidSupportAmount > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{money(row.unpaidSupportAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <Field label="메모"><input className="form-input" value={form.memo || ''} onChange={e => inp('memo', e.target.value)} placeholder="운영 기준, 내부 참고사항" /></Field>
        </Modal>
      )}
      {bizModal && (
        <Modal title={bizModal.mode === 'new' ? '사업명 추가' : '사업명 수정'} onClose={() => setBizModal(null)} onSave={saveBiz} onDelete={bizModal.mode === 'edit' ? deleteBiz : null} maxWidth="520px">
          <Field label="사업명" required>
            <input className="form-input" value={bizForm.name || ''} onChange={e => bizInp('name', e.target.value)} placeholder="로컬크리에이트" />
          </Field>
          <div style={{ height: '12px' }} />
          <div className="form-grid form-grid-3" style={{ marginBottom: '12px' }}>
            <Field label="시작 연도"><input className="form-input" type="number" value={bizForm.start_year || ''} onChange={e => bizInp('start_year', e.target.value)} /></Field>
            <Field label="시작 월"><input className="form-input" type="number" min="1" max="12" value={bizForm.start_month || ''} onChange={e => bizInp('start_month', e.target.value)} /></Field>
            <Field label="시작 일"><input className="form-input" type="number" min="1" max="31" value={bizForm.start_day || ''} onChange={e => bizInp('start_day', e.target.value)} /></Field>
          </div>
          <div className="form-grid form-grid-3">
            <Field label="종료 연도"><input className="form-input" type="number" value={bizForm.end_year || ''} onChange={e => bizInp('end_year', e.target.value)} /></Field>
            <Field label="종료 월"><input className="form-input" type="number" min="1" max="12" value={bizForm.end_month || ''} onChange={e => bizInp('end_month', e.target.value)} /></Field>
            <Field label="종료 일"><input className="form-input" type="number" min="1" max="31" value={bizForm.end_day || ''} onChange={e => bizInp('end_day', e.target.value)} /></Field>
          </div>
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
