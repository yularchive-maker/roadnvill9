'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SEND_STATUSES = ['전체', '미발송', '발송완료', '발송실패', '재발송필요']
const REPLY_STATUSES = ['전체', '회신대기', '가능', '불가능', '시간조정 필요', '인원조정 필요', '보류']
const DECISIONS = ['전체', '확정 가능', '확정 불가', '조정 필요', '미회신']
const METHODS = ['', '전화', '카카오톡', '문자', '텔레그램', '대면/현장']
const LIST_GRID = '90px 92px 1.1fr 1fr 1fr 110px 70px 92px 110px 80px 1fr 112px 94px 92px'
const CENTER_CELL = { display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'stretch', width: '100%', textAlign: 'center' }
const CENTER_BADGE = { justifyContent: 'center', minWidth: '88px' }
const CENTER_BUTTON = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '78px', textAlign: 'center' }

const EMPTY_MANUAL = {
  reply_status: '가능',
  reply_method: '전화',
  confirmed_by: '',
  replied_at: '',
  available_people_count: '',
  suggested_time: '',
  unavailable_reason: '',
  adjustment_reason: '',
  minimum_people_count: '',
  can_split_groups: false,
  reply_memo: '',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString()
}

function decisionFor(status) {
  if (status === '가능') return '확정 가능'
  if (status === '불가능') return '확정 불가'
  if (status === '시간조정 필요' || status === '인원조정 필요') return '조정 필요'
  return '미회신'
}

function fmtDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function badgeStyle(value) {
  if (value === '가능' || value === '확정 가능' || value === '발송완료') return { color: 'var(--green)', background: 'rgba(92,184,92,.14)' }
  if (value === '불가능' || value === '확정 불가' || value === '발송실패') return { color: 'var(--red)', background: 'rgba(224,92,92,.14)' }
  if (value === '시간조정 필요' || value === '인원조정 필요' || value === '조정 필요' || value === '재발송필요') return { color: 'var(--amber)', background: 'rgba(247,201,72,.14)' }
  return { color: 'var(--text-muted)', background: 'rgba(143,163,177,.12)' }
}

function StatusBadge({ children }) {
  return <span className="badge" style={{ ...badgeStyle(children), ...CENTER_BADGE }}>{children || '-'}</span>
}

export default function VendorConfirmsPage() {
  const [rows, setRows] = useState([])
  const [reservations, setReservations] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ date: '', vendor_key: '전체', reply_status: '전체', send_status: '전체', decision: '전체', q: '' })
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_MANUAL)
  const [saving, setSaving] = useState(false)
  const [sendingIds, setSendingIds] = useState(new Set())

  const reservationMap = useMemo(() => {
    const map = new Map()
    reservations.forEach(r => map.set(r.no, r))
    return map
  }, [reservations])

  const vendorMap = useMemo(() => {
    const map = new Map()
    vendors.forEach(v => map.set(v.key, v))
    return map
  }, [vendors])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [confirmRes, reservationRes, vendorRes] = await Promise.all([
      supabase.from('vendor_confirms').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('request_date', { ascending: false }).order('updated_at', { ascending: false }),
      supabase.from('reservations').select('no,date,customer,package_name,pax,type,reservation_status').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('vendors').select('key,name,color').or('is_deleted.is.null,is_deleted.eq.false').order('name'),
    ])

    const firstError = confirmRes.error || reservationRes.error || vendorRes.error
    if (firstError) {
      setError(firstError.message || '업체 회신 데이터를 불러오지 못했습니다.')
      setRows([])
    } else {
      setRows(confirmRes.data || [])
      setReservations(reservationRes.data || [])
      setVendors(vendorRes.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filteredRows = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return rows.filter(row => {
      const reservation = reservationMap.get(row.reservation_no)
      const vendor = vendorMap.get(row.vendor_key)
      const rowDate = row.request_date || reservation?.date || ''
      const vendorName = row.vendor_name || vendor?.name || row.vendor_key || ''
      const programName = row.program_name || row.prog_name || row.program || ''
      const customer = reservation?.customer || ''
      const packageName = reservation?.package_name || ''

      if (filters.date && rowDate !== filters.date) return false
      if (filters.vendor_key !== '전체' && row.vendor_key !== filters.vendor_key) return false
      if (filters.reply_status !== '전체' && (row.reply_status || '회신대기') !== filters.reply_status) return false
      if (filters.send_status !== '전체' && (row.send_status || '미발송') !== filters.send_status) return false
      if (filters.decision !== '전체' && (row.final_decision || '미회신') !== filters.decision) return false
      if (!q) return true
      return [row.reservation_no, rowDate, vendorName, programName, customer, packageName, row.reply_memo]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    })
  }, [filters, reservationMap, rows, vendorMap])

  const summary = useMemo(() => {
    return {
      total: filteredRows.length,
      waiting: filteredRows.filter(r => (r.reply_status || '회신대기') === '회신대기').length,
      possible: filteredRows.filter(r => r.reply_status === '가능').length,
      needAdjust: filteredRows.filter(r => r.reply_status === '시간조정 필요' || r.reply_status === '인원조정 필요').length,
      impossible: filteredRows.filter(r => r.reply_status === '불가능').length,
    }
  }, [filteredRows])

  function openManual(row) {
    setModal(row)
    setForm({
      reply_status: row.reply_status && row.reply_status !== '회신대기' ? row.reply_status : '가능',
      reply_method: row.reply_method || '전화',
      confirmed_by: row.confirmed_by || '',
      replied_at: toDateTimeLocal(row.replied_at) || toDateTimeLocal(new Date().toISOString()),
      available_people_count: row.available_people_count ?? '',
      suggested_time: row.suggested_time || '',
      unavailable_reason: row.unavailable_reason || '',
      adjustment_reason: row.adjustment_reason || '',
      minimum_people_count: row.minimum_people_count ?? '',
      can_split_groups: !!row.can_split_groups,
      reply_memo: row.reply_memo || '',
    })
  }

  async function saveManual() {
    if (!modal?.id) return
    setSaving(true)
    const payload = {
      reply_status: form.reply_status,
      manual_reply: true,
      reply_method: form.reply_method || null,
      confirmed_by: form.confirmed_by || null,
      replied_at: toIso(form.replied_at),
      available_people_count: form.available_people_count === '' ? null : Number(form.available_people_count),
      suggested_time: form.suggested_time || null,
      unavailable_reason: form.unavailable_reason || null,
      adjustment_reason: form.adjustment_reason || null,
      minimum_people_count: form.minimum_people_count === '' ? null : Number(form.minimum_people_count),
      can_split_groups: !!form.can_split_groups,
      reply_memo: form.reply_memo || null,
      final_decision: decisionFor(form.reply_status),
    }
    const { error: saveError } = await supabase.from('vendor_confirms').update(payload).eq('id', modal.id)
    setSaving(false)
    if (saveError) return alert('수동 회신 저장 실패: ' + saveError.message)
    setModal(null)
    load()
  }

  async function sendTelegram(row) {
    if (!row?.id) return
    setSendingIds(prev => new Set(prev).add(row.id))
    const res = await fetch('/api/vendor-confirms/send-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [row.id] }),
    })
    const payload = await res.json().catch(() => ({}))
    setSendingIds(prev => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
    if (!res.ok) {
      alert('텔레그램 발송 실패: ' + (payload.error || res.statusText))
      return
    }
    const failed = (payload.results || []).find(result => !result.ok)
    if (failed) {
      alert('텔레그램 발송 실패: ' + failed.error)
    }
    load()
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">업체 회신 요청 목록</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>텔레그램 연동 전에도 전화/문자/현장 회신을 수동으로 관리합니다.</div>
        </div>
        <button className="btn-outline" onClick={load}>새로고침</button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '16px' }}>
        {[
          ['전체', summary.total, 'var(--text-primary)'],
          ['회신대기', summary.waiting, 'var(--text-muted)'],
          ['가능', summary.possible, 'var(--green)'],
          ['조정 필요', summary.needAdjust, 'var(--amber)'],
          ['불가능', summary.impossible, 'var(--red)'],
        ].map(([label, value, color]) => (
          <div key={label} className="kpi-card" style={{ padding: '14px 16px' }}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: '22px', color }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="search-bar" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input className="search-input" style={{ minWidth: '240px' }} value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="예약번호, 고객명, 업체명, 프로그램 검색" />
        <input className="filter-select" type="date" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
        <select className="filter-select" value={filters.vendor_key} onChange={e => setFilters(f => ({ ...f, vendor_key: e.target.value }))}>
          <option>전체</option>
          {vendors.map(v => <option key={v.key} value={v.key}>{v.name}</option>)}
        </select>
        <select className="filter-select" value={filters.send_status} onChange={e => setFilters(f => ({ ...f, send_status: e.target.value }))}>
          {SEND_STATUSES.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.reply_status} onChange={e => setFilters(f => ({ ...f, reply_status: e.target.value }))}>
          {REPLY_STATUSES.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="filter-select" value={filters.decision} onChange={e => setFilters(f => ({ ...f, decision: e.target.value }))}>
          {DECISIONS.map(v => <option key={v}>{v}</option>)}
        </select>
        <button className="btn-outline" onClick={() => setFilters({ date: '', vendor_key: '전체', reply_status: '전체', send_status: '전체', decision: '전체', q: '' })}>초기화</button>
      </div>

      <div className="list-card">
        <div className="list-header" style={{ gridTemplateColumns: LIST_GRID, gap: '10px' }}>
          <span>예약번호</span><span>예약일</span><span>예약명</span><span>패키지</span><span>프로그램</span><span>업체</span><span>인원</span><span style={CENTER_CELL}>발송</span><span style={CENTER_CELL}>회신</span><span style={CENTER_CELL}>수동</span><span>메모</span><span style={CENTER_CELL}>회신시간</span><span style={CENTER_CELL}>판단</span><span style={CENTER_CELL}>작업</span>
        </div>
        {loading ? (
          <div style={{ padding: '42px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>로딩 중...</div>
        ) : error ? (
          <div style={{ padding: '42px', textAlign: 'center', color: 'var(--red)', fontSize: '13px' }}>{error}</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '42px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>조건에 맞는 업체 회신 요청이 없습니다.</div>
        ) : filteredRows.map(row => {
          const reservation = reservationMap.get(row.reservation_no)
          const vendor = vendorMap.get(row.vendor_key)
          const rowDate = row.request_date || reservation?.date || '-'
          const vendorName = row.vendor_name || vendor?.name || row.vendor_key || '-'
          const programName = row.program_name || row.prog_name || row.program || '-'
          const requestTime = [row.request_start_time, row.request_end_time].filter(Boolean).join(' ~ ')
          return (
            <div key={row.id || `${row.reservation_no}-${row.vendor_key}`} className="list-row" style={{ gridTemplateColumns: LIST_GRID, gap: '10px', cursor: 'default' }}>
              <span className="no-col">#{row.reservation_no}</span>
              <span>{rowDate}</span>
              <span>{reservation?.customer || '-'}</span>
              <span>{reservation?.package_name || '-'}</span>
              <span title={requestTime}>{programName}</span>
              <span>{vendorName}</span>
              <span style={CENTER_CELL}>{row.request_people_count ?? reservation?.pax ?? '-'}</span>
              <span style={CENTER_CELL}><StatusBadge>{row.send_status || '미발송'}</StatusBadge></span>
              <span style={CENTER_CELL}><StatusBadge>{row.reply_status || '회신대기'}</StatusBadge></span>
              <span style={CENTER_CELL}>{row.manual_reply ? '수동입력' : '-'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.reply_memo || '-'}</span>
              <span style={CENTER_CELL}>{fmtDateTime(row.replied_at)}</span>
              <span style={CENTER_CELL}>
                <button className="btn-outline btn-sm" style={CENTER_BUTTON} onClick={() => openManual(row)}>{row.final_decision || '미회신'}</button>
              </span>
              <span style={CENTER_CELL}>
                <button className="btn-primary btn-sm" style={CENTER_BUTTON} onClick={() => sendTelegram(row)} disabled={sendingIds.has(row.id)}>
                  {sendingIds.has(row.id) ? '발송중' : '텔레그램'}
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {modal && (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ width: '720px' }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">수동 회신 입력</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>예약 #{modal.reservation_no} · {modal.vendor_name || vendorMap.get(modal.vendor_key)?.name || modal.vendor_key}</div>
              </div>
              <button className="close-btn" onClick={() => setModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-3">
                <div className="form-field">
                  <label>회신 상태</label>
                  <select className="form-select" value={form.reply_status} onChange={e => setForm(f => ({ ...f, reply_status: e.target.value }))}>
                    {REPLY_STATUSES.filter(v => v !== '전체' && v !== '회신대기').map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>확인 방법</label>
                  <select className="form-select" value={form.reply_method} onChange={e => setForm(f => ({ ...f, reply_method: e.target.value }))}>
                    {METHODS.map(v => <option key={v} value={v}>{v || '선택 안 함'}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>확인 시간</label>
                  <input className="form-input" type="datetime-local" value={form.replied_at} onChange={e => setForm(f => ({ ...f, replied_at: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>확인자</label>
                  <input className="form-input" value={form.confirmed_by} onChange={e => setForm(f => ({ ...f, confirmed_by: e.target.value }))} placeholder="담당자명" />
                </div>
                <div className="form-field">
                  <label>가능 최대 인원</label>
                  <input className="form-input" type="number" min="0" value={form.available_people_count} onChange={e => setForm(f => ({ ...f, available_people_count: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>최소 진행 인원</label>
                  <input className="form-input" type="number" min="0" value={form.minimum_people_count} onChange={e => setForm(f => ({ ...f, minimum_people_count: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>제안 시간</label>
                  <input className="form-input" value={form.suggested_time} onChange={e => setForm(f => ({ ...f, suggested_time: e.target.value }))} placeholder="예: 15:00 가능" />
                </div>
                <div className="form-field">
                  <label>불가능 사유</label>
                  <input className="form-input" value={form.unavailable_reason} onChange={e => setForm(f => ({ ...f, unavailable_reason: e.target.value }))} placeholder="일정 불가, 인원 초과 등" />
                </div>
                <div className="form-field">
                  <label>조정 사유</label>
                  <input className="form-input" value={form.adjustment_reason} onChange={e => setForm(f => ({ ...f, adjustment_reason: e.target.value }))} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={form.can_split_groups} onChange={e => setForm(f => ({ ...f, can_split_groups: e.target.checked }))} />
                두 조 분리 진행 가능
              </label>
              <div className="form-field" style={{ marginTop: '14px' }}>
                <label>업체 회신 메모</label>
                <textarea className="form-input" style={{ height: '86px', paddingTop: '10px', resize: 'vertical' }} value={form.reply_memo} onChange={e => setForm(f => ({ ...f, reply_memo: e.target.value }))} placeholder="전화/문자/대면으로 받은 내용을 기록합니다." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setModal(null)}>취소</button>
              <button className="btn-primary" onClick={saveManual} disabled={saving}>{saving ? '저장 중...' : '수동 회신 저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
