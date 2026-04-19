'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const EMPTY_FORM = { date:'', content:'', special:'' }

export default function NoticePage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)

  // 모달
  const [modal,   setModal]   = useState(null)  // null | { mode:'new'|'edit', data }
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [saving,  setSaving]  = useState(false)

  const ym = `${year}-${String(month).padStart(2,'0')}`

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .gte('date', `${ym}-01`)
      .lte('date', `${ym}-31`)
      .order('date')
    if (error) { alert('알림 로드 실패: ' + error.message); setLoading(false); return }
    setNotices(data || [])
    setLoading(false)
  }, [ym])

  useEffect(() => { load() }, [load])

  // 날짜별 그룹핑
  const grouped = {}
  notices.forEach(n => {
    if (!grouped[n.date]) grouped[n.date] = []
    grouped[n.date].push(n)
  })
  const sortedDates = Object.keys(grouped).sort()

  function openNew(defaultDate) {
    setForm({ ...EMPTY_FORM, date: defaultDate || '' })
    setModal({ mode:'new' })
  }

  function openEdit(notice) {
    setForm({ date: notice.date, content: notice.content||'', special: notice.special||'' })
    setModal({ mode:'edit', data: notice })
  }

  async function save() {
    if (!form.date || !form.content.trim()) return alert('날짜와 내용을 입력하세요.')
    setSaving(true)
    const body = { date: form.date, content: form.content.trim(), special: form.special.trim() || null }
    let res
    if (modal.mode === 'new') {
      res = await fetch('/api/notices', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    } else {
      res = await fetch('/api/notices', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: modal.data.id, ...body }) })
    }
    setSaving(false)
    if (!res.ok) { const e = await res.json(); return alert('저장 실패: ' + (e.error?.message || JSON.stringify(e.error))) }
    setModal(null)
    load()
  }

  async function del(id) {
    if (!confirm('삭제하시겠습니까?')) return
    const res = await fetch('/api/notices', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    if (!res.ok) return alert('삭제 실패')
    load()
  }

  function prevMonth() { if (month === 1) { setYear(y=>y-1); setMonth(12) } else setMonth(m=>m-1) }
  function nextMonth() { if (month === 12) { setYear(y=>y+1); setMonth(1) } else setMonth(m=>m+1) }

  return (
    <div>
      {/* 헤더 */}
      <div className="section-header" style={{ marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <span style={{ fontSize:'15px', fontWeight:700, minWidth:'80px', textAlign:'center' }}>{year}년 {MONTHS[month-1]}</span>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          <span style={{ fontSize:'12px', color:'var(--text-muted)', marginLeft:'4px' }}>{notices.length}건</span>
        </div>
        <button className="btn-primary" onClick={() => openNew(`${ym}-${String(now.getDate()).padStart(2,'0')}`)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          알림 등록
        </button>
      </div>

      {/* 목록 */}
      {loading ? (
        <div style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)' }}>로딩 중…</div>
      ) : sortedDates.length === 0 ? (
        <div className="card" style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>
          이 달에 등록된 알림이 없습니다
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {sortedDates.map(date => (
            <div key={date} className="card" style={{ padding:'0', overflow:'hidden' }}>
              {/* 날짜 헤더 */}
              <div style={{ padding:'10px 16px', background:'var(--navy2)', borderBottom:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'13px', fontWeight:700, fontFamily:'DM Mono,monospace' }}>{date}</span>
                  {grouped[date].some(n => n.special) && (
                    <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', background:'rgba(78,205,196,.15)', color:'var(--accent)', fontWeight:600 }}>
                      ⭐ {grouped[date].find(n=>n.special)?.special}
                    </span>
                  )}
                </div>
                <button className="btn-outline" style={{ fontSize:'11px', padding:'3px 8px' }} onClick={() => openNew(date)}>+ 추가</button>
              </div>

              {/* 알림 항목 */}
              {grouped[date].map((n, i) => (
                <div key={n.id} style={{ padding:'10px 16px', borderBottom: i < grouped[date].length-1 ? '1px solid var(--border2)' : 'none', display:'flex', alignItems:'flex-start', gap:'10px' }}>
                  <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:'var(--accent)', color:'var(--navy)', fontSize:'10px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:'1px' }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', lineHeight:'1.5' }}>{n.content}</div>
                    {n.special && <div style={{ fontSize:'11px', color:'var(--accent)', marginTop:'3px' }}>특이사항: {n.special}</div>}
                  </div>
                  <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                    <button className="btn-outline" style={{ fontSize:'11px', padding:'3px 8px' }} onClick={() => openEdit(n)}>수정</button>
                    <button className="btn-danger" style={{ fontSize:'11px', padding:'3px 8px' }} onClick={() => del(n.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 모달 */}
      {modal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="modal-box" style={{ maxWidth:'480px' }}>
            <div className="modal-header">
              <div className="modal-title">{modal.mode === 'new' ? '알림 등록' : '알림 수정'}</div>
              <button className="close-btn" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field" style={{ marginBottom:'14px' }}>
                <label>날짜 <span style={{ color:'var(--red)' }}>*</span></label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(f=>({...f, date:e.target.value}))} />
              </div>
              <div className="form-field" style={{ marginBottom:'14px' }}>
                <label>내용 <span style={{ color:'var(--red)' }}>*</span></label>
                <textarea
                  className="form-input"
                  rows={3}
                  style={{ resize:'vertical' }}
                  value={form.content}
                  onChange={e => setForm(f=>({...f, content:e.target.value}))}
                  placeholder="알림 내용을 입력하세요"
                />
              </div>
              <div className="form-field">
                <label>특이사항 <span style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:400 }}>(선택)</span></label>
                <input
                  className="form-input"
                  value={form.special}
                  onChange={e => setForm(f=>({...f, special:e.target.value}))}
                  placeholder="예: 연휴, 특별 이벤트 등"
                />
              </div>
            </div>
            <div className="modal-footer">
              {modal.mode === 'edit' && (
                <button className="btn-danger" onClick={() => { del(modal.data.id); setModal(null) }}>삭제</button>
              )}
              <button className="btn-outline" onClick={() => setModal(null)}>취소</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
