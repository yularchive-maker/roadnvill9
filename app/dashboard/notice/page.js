'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const COLORS = ['#6E8DFB', '#4ECDC4', '#F7C948', '#FF6B6B', '#B8B8FF']
const NOTICE_TYPES = ['일반', '긴급', '완료']
const TYPE_COLORS = {
  일반: { color:'var(--accent)', bg:'rgba(78,205,196,.12)' },
  긴급: { color:'var(--red)', bg:'rgba(255,107,107,.12)' },
  완료: { color:'var(--green)', bg:'rgba(92,184,92,.12)' },
}

const EMPTY_FORM = {
  date: '',
  end_date: '',
  title: '',
  content: '',
  special: '',
  start_time: '',
  end_time: '',
  place: '',
  color: '#6E8DFB',
  notice_type: '일반',
  is_all_day: true,
}

function displayTitle(n) {
  return n.title || (n.content || '').split('\n')[0] || n.special || '알림'
}

function normalizeNoticeType(value) {
  return NOTICE_TYPES.includes(value) ? value : '일반'
}

function colorForType(type, fallback = '#6E8DFB') {
  if (type === '긴급') return '#FF6B6B'
  if (type === '완료') return '#5CB85C'
  return fallback
}

function timeLabel(n) {
  if (n.is_all_day || (!n.start_time && !n.end_time)) return '종일'
  if (n.start_time && n.end_time) return `${n.start_time.slice(0,5)} ~ ${n.end_time.slice(0,5)}`
  return (n.start_time || n.end_time || '').slice(0,5)
}

export default function NoticePage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const ym = `${year}-${String(month).padStart(2,'0')}`

  const load = useCallback(async () => {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()
    const monthStart = `${ym}-01`
    const monthEnd = `${ym}-${String(lastDay).padStart(2,'0')}`
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .lte('date', monthEnd)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('date')
      .order('start_time', { nullsFirst: true })
    if (error) {
      alert('NOTICE 로드 실패: ' + error.message)
      setLoading(false)
      return
    }
    setNotices((data || []).filter(n => (n.end_date || n.date) >= monthStart))
    setLoading(false)
  }, [ym, year, month])

  useEffect(() => { load() }, [load])

  const grouped = {}
  notices.forEach(n => {
    if (!grouped[n.date]) grouped[n.date] = []
    grouped[n.date].push(n)
  })
  const sortedDates = Object.keys(grouped).sort()

  function openNew(defaultDate) {
    setForm({ ...EMPTY_FORM, date: defaultDate || '', end_date: defaultDate || '' })
    setModal({ mode:'new' })
  }

  function openEdit(notice) {
    setForm({
      date: notice.date || '',
      end_date: notice.end_date || notice.date || '',
      title: displayTitle(notice),
      content: notice.content || '',
      special: notice.special || '',
      start_time: notice.start_time ? notice.start_time.slice(0,5) : '',
      end_time: notice.end_time ? notice.end_time.slice(0,5) : '',
      place: notice.place || '',
      color: notice.color || '#6E8DFB',
      notice_type: normalizeNoticeType(notice.notice_type),
      is_all_day: notice.is_all_day === true || (!notice.start_time && !notice.end_time),
    })
    setModal({ mode:'edit', data: notice })
  }

  async function save() {
    if (!form.date || !form.title.trim()) return alert('날짜와 제목을 입력해주세요.')
    const endDate = form.end_date || form.date
    if (endDate < form.date) return alert('종료일은 시작일보다 빠를 수 없습니다.')
    if (!form.is_all_day && (!form.start_time || !form.end_time)) return alert('시간 일정은 시작/종료 시간을 입력해주세요.')
    setSaving(true)
    const body = {
      date: form.date,
      end_date: endDate,
      title: form.title.trim(),
      content: form.content.trim(),
      special: form.notice_type === '완료' ? '완료' : (form.special.trim() || null),
      start_time: form.is_all_day ? null : form.start_time,
      end_time: form.is_all_day ? null : form.end_time,
      place: form.place.trim() || null,
      color: colorForType(form.notice_type, form.color || '#6E8DFB'),
      notice_type: normalizeNoticeType(form.notice_type),
      is_all_day: !!form.is_all_day,
    }
    let res
    if (modal.mode === 'new') {
      res = await fetch('/api/notices', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    } else {
      res = await fetch('/api/notices', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: modal.data.id, ...body }) })
    }
    setSaving(false)
    if (!res.ok) {
      const e = await res.json()
      return alert('저장 실패: ' + (e.error?.message || e.error || JSON.stringify(e)))
    }
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
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div>
      <div className="section-header" style={{ marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <span style={{ fontSize:'15px', fontWeight:700, minWidth:'90px', textAlign:'center' }}>{year}년 {MONTHS[month-1]}</span>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          <span style={{ fontSize:'12px', color:'var(--text-muted)', marginLeft:'4px' }}>{notices.length}건</span>
        </div>
        <button className="btn-primary" onClick={() => openNew(`${ym}-${String(now.getDate()).padStart(2,'0')}`)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          NOTICE 등록
        </button>
      </div>

      {loading ? (
        <div style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)' }}>로딩 중...</div>
      ) : sortedDates.length === 0 ? (
        <div className="card" style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>
          이번 달에 등록된 NOTICE가 없습니다.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {sortedDates.map(date => (
            <div key={date} className="card" style={{ padding:'0', overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', background:'var(--navy2)', borderBottom:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'13px', fontWeight:700, fontFamily:'DM Mono,monospace' }}>{date}</span>
                  <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{grouped[date].length}건</span>
                </div>
                <button className="btn-outline" style={{ fontSize:'11px', padding:'3px 8px' }} onClick={() => openNew(date)}>+ 추가</button>
              </div>

              {grouped[date].map((n, i) => (
                <div key={n.id} style={{ padding:'12px 16px', borderBottom: i < grouped[date].length-1 ? '1px solid var(--border2)' : 'none', display:'flex', alignItems:'flex-start', gap:'10px' }}>
                  <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:n.color || 'var(--accent)', flexShrink:0, marginTop:'5px' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'13px', fontWeight:800, color:'var(--text-primary)' }}>{displayTitle(n)}</span>
                      {(() => {
                        const type = normalizeNoticeType(n.notice_type)
                        const style = TYPE_COLORS[type]
                        return <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'999px', background:style.bg, color:style.color, fontWeight:700 }}>{type}</span>
                      })()}
                      <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{timeLabel(n)}</span>
                    </div>
                    {n.place && <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'4px' }}>장소: {n.place}</div>}
                    {n.content && <div style={{ fontSize:'12px', lineHeight:1.5, color:'var(--text-secondary)', marginTop:'5px', whiteSpace:'pre-wrap' }}>{n.content}</div>}
                    {n.special && <div style={{ fontSize:'11px', color:'var(--amber)', marginTop:'5px' }}>특이사항: {n.special}</div>}
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

      {modal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="modal-box" style={{ maxWidth:'560px' }}>
            <div className="modal-header">
              <div className="modal-title">{modal.mode === 'new' ? 'NOTICE 등록' : 'NOTICE 수정'}</div>
              <button className="close-btn" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 160px',gap:'12px',marginBottom:'14px'}}>
                <div className="form-field">
                  <label>시작일 <span style={{ color:'var(--red)' }}>*</span></label>
                  <input className="form-input" type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" value={form.date} onChange={e => set('date', formatDateTyping(e.target.value))}/>
                </div>
                <div className="form-field">
                  <label>종료일</label>
                  <input className="form-input" type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" value={form.end_date} onChange={e => set('end_date', formatDateTyping(e.target.value))}/>
                </div>
                <div className="form-field">
                  <label>구분</label>
                  <select className="form-input" value={form.notice_type} onChange={e => set('notice_type', e.target.value)}>
                    {NOTICE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-field" style={{ marginBottom:'14px' }}>
                <label>제목 <span style={{ color:'var(--red)' }}>*</span></label>
                <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="대시보드 달력에 표시될 제목"/>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr',gap:'12px',alignItems:'end',marginBottom:'14px'}}>
                <label style={{display:'inline-flex',alignItems:'center',gap:'8px',height:'36px',fontSize:'12px',fontWeight:700,color:'var(--text-secondary)'}}>
                  <input type="checkbox" checked={form.is_all_day} onChange={e => set('is_all_day', e.target.checked)}/>
                  종일/날짜만
                </label>
                <div className="form-field">
                  <label>시작 시간</label>
                  <input className="form-input" type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} disabled={form.is_all_day}/>
                </div>
                <div className="form-field">
                  <label>종료 시간</label>
                  <input className="form-input" type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} disabled={form.is_all_day}/>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 170px',gap:'12px',marginBottom:'14px'}}>
                <div className="form-field">
                  <label>장소</label>
                  <input className="form-input" value={form.place} onChange={e => set('place', e.target.value)} placeholder="장소"/>
                </div>
                <div className="form-field">
                  <label>색상</label>
                  <div style={{display:'flex',gap:'6px',height:'36px',alignItems:'center'}}>
                    {COLORS.map(color => (
                      <button key={color} type="button" onClick={() => set('color', color)} title={color}
                        style={{width:'26px',height:'26px',borderRadius:'50%',background:color,border:form.color === color ? '2px solid #fff' : '1px solid var(--border2)',cursor:'pointer'}} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-field" style={{ marginBottom:'14px' }}>
                <label>내용/메모</label>
                <textarea className="form-input" rows={3} style={{ resize:'vertical', padding:'10px 12px', lineHeight:'1.45' }} value={form.content} onChange={e => set('content', e.target.value)} placeholder="자세한 내용은 NOTICE 탭과 타임테이블에서 확인합니다."/>
              </div>

              <div className="form-field">
                <label>특이사항</label>
                <input className="form-input" value={form.special} onChange={e => set('special', e.target.value)} placeholder="예: 휴무, 행사, 준비 필요"/>
              </div>
            </div>
            <div className="modal-footer">
              {modal.mode === 'edit' && <button className="btn-danger" onClick={() => { del(modal.data.id); setModal(null) }}>삭제</button>}
              <button className="btn-outline" onClick={() => setModal(null)}>취소</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
