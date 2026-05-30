'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'

// ── 상수
const TT_START = 0
const TT_END   = 24
const HOUR_H   = 52
const TOTAL_H  = (TT_END - TT_START) * HOUR_H

// ── 유틸
function timeToMin(t) { const [h, m] = t.slice(0,5).split(':').map(Number); return h * 60 + m }
function timeToPx(t)  { return (timeToMin(t) - TT_START * 60) / 60 * HOUR_H }
function durPx(s, e)  { return Math.max((timeToMin(e) - timeToMin(s)) / 60 * HOUR_H, 16) }
function minToTime(min) {
  if (min >= 24 * 60) return '23:59'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}
function dateStr(d)   {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDaysStr(baseDate, days) {
  const d = new Date(baseDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return dateStr(d)
}
function eventEndDate(ev) {
  return ev?.end_date || ev?.date
}
function eventActiveOn(ev, ds) {
  if (!ev?.date || !ds) return false
  return ev.date <= ds && eventEndDate(ev) >= ds
}
function eventOverlapsRange(ev, start, end) {
  if (!ev?.date || !start || !end) return false
  return ev.date <= end && eventEndDate(ev) >= start
}
function isAllDayEvent(ev) {
  return ev?.type === 'notice' && ev?.is_all_day_notice
}
function getMon(d) {
  const day = d.getDay()
  const m = new Date(d)
  m.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return m
}
function formatDay(d) {
  const days = ['일','월','화','수','목','금','토']
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

// 예약 × package_programs → 타임테이블 자동 이벤트 생성
function packageZoneCodes(pkg) {
  const linked = (pkg?.package_zones || [])
    .filter(z => z && z.is_deleted !== true)
    .map(z => z.zone_code)
    .filter(Boolean)
  return linked.length ? [...new Set(linked)] : (pkg?.zone_code ? [pkg.zone_code] : [])
}

function findPackageForUsage(packages, row, reservation) {
  return packages.find(p => String(p.id) === String(row?.package_id || '')) ||
    packages.find(p => p.name === row?.package_name) ||
    packages.find(p => p.name === row?.item_name) ||
    packages.find(p => p.name === (reservation?.package_name || reservation?.pkg))
}

function activeProductUsages(usages, reservationNo) {
  return (usages || []).filter(row =>
    row.reservation_no === reservationNo &&
    row.usage_type === 'product_operation' &&
    row.is_deleted !== true
  )
}

function buildAutoEvents(reservations, packages, usages = [], vendors = []) {
  const events = []
  let counter = 0
  reservations.forEach(r => {
    if (r.type === 'cancelled') return
    const zoneCode = r.zone_code || r.zone
    const rows = activeProductUsages(usages, r.no)

    if (rows.length) {
      rows.forEach(row => {
        const rowZones = Array.isArray(row.zone_codes) && row.zone_codes.length
          ? row.zone_codes.filter(Boolean)
          : (row.zone_code ? [row.zone_code] : [])
        const rowZoneCode = row.zone_code || rowZones[0] || zoneCode

        if ((row.sale_type || 'package') === 'single') {
          if (!row.start_time || !row.end_time) return
          const vendor = vendors.find(v => String(v.key) === String(row.vendor_key || ''))
          events.push({
            id: `auto_component_${r.no}_${row.component_uid || row.id || counter++}`,
            date: r.date,
            start_time: row.start_time.slice(0, 5),
            end_time: row.end_time.slice(0, 5),
            type: 'exp',
            vendor_key: row.vendor_key,
            vendor_name: vendor?.name || row.vendor_name || row.vendor_key || '',
            vendor_color: vendor?.color || row.vendor_color || '#4ECDC4',
            prog_name: row.prog_name || row.item_name || 'custom',
            reservation_no: r.no,
            pkg_name: row.item_name || row.package_name || 'custom',
            customer: r.customer,
            pax: Number(row.people_count) || Number(r.pax) || 0,
            zone_code: rowZoneCode,
            memo: row.place ? `place: ${row.place}` : '',
            is_manual: false,
          })
          return
        }

        const pkg = findPackageForUsage(packages, row, r)
        if (!pkg) return
        ;(pkg.package_programs || []).forEach(pp => {
          if (!pp.default_start || !pp.default_end) return
          if (rowZones.length && pp.zone_code && !rowZones.includes(pp.zone_code)) return
          const vendor = pp.vendors
          events.push({
            id: `auto_component_${r.no}_${row.component_uid || row.id || counter++}_${pp.id || pp.prog_name}`,
            date: r.date,
            start_time: pp.default_start.slice(0, 5),
            end_time: pp.default_end.slice(0, 5),
            type: 'exp',
            vendor_key: pp.vendor_key,
            vendor_name: vendor?.name || pp.prog_name,
            vendor_color: vendor?.color || '#4ECDC4',
            prog_name: pp.prog_name,
            reservation_no: r.no,
            pkg_name: row.item_name || row.package_name || pkg.name,
            customer: r.customer,
            pax: Number(row.people_count) || Number(r.pax) || 0,
            zone_code: pp.zone_code || rowZoneCode || packageZoneCodes(pkg)[0] || '',
            memo: '',
            is_manual: false,
          })
        })
      })
      return
    }

    const packageName = r.package_name || r.pkg
    const pkg = packages.find(p => p.name === packageName)
    if (!pkg) return
    ;(pkg.package_programs || []).forEach(pp => {
      if (!pp.default_start || !pp.default_end) return
      const vendor = pp.vendors
      events.push({
        id: `auto_${r.no}_${counter++}`,
        date: r.date,
        start_time: pp.default_start.slice(0, 5),
        end_time: pp.default_end.slice(0, 5),
        type: 'exp',
        vendor_key: pp.vendor_key,
        vendor_name: vendor?.name || pp.prog_name,
        vendor_color: vendor?.color || '#4ECDC4',
        prog_name: pp.prog_name,
        reservation_no: r.no,
        pkg_name: packageName,
        customer: r.customer,
        pax: r.pax,
        zone_code: pp.zone_code || zoneCode,
        memo: '',
        is_manual: false,
      })
    })
  })
  return events
}

function noticeTitle(n) {
  return n.title || (n.content || '').split('\n')[0] || n.special || '알림'
}

function buildNoticeEvents(notices = []) {
  return notices
    .filter(n => n && n.is_deleted !== true && n.date)
    .map(n => ({
      id: `notice_${n.id}`,
      notice_id: n.id,
      date: n.date,
      end_date: n.end_date || n.date,
      start_time: (n.is_all_day === true || !n.start_time || !n.end_time) ? '00:00' : n.start_time.slice(0, 5),
      end_time: (n.is_all_day === true || !n.start_time || !n.end_time) ? '24:00' : n.end_time.slice(0, 5),
      type: 'notice',
      vendor_key: 'NOTICE',
      vendor_name: n.notice_type || '일반 일정',
      vendor_color: n.color || '#6E8DFB',
      prog_name: noticeTitle(n),
      pkg_name: 'NOTICE',
      memo: [n.place ? `장소: ${n.place}` : '', n.content || '', n.special ? `특이사항: ${n.special}` : ''].filter(Boolean).join('\n'),
      title: n.title || '',
      content: n.content || '',
      special: n.special || '',
      notice_type: n.notice_type || '',
      color: n.color || '#6E8DFB',
      place: n.place || '',
      is_manual: true,
      is_notice: true,
      is_all_day_notice: n.is_all_day === true || !n.start_time || !n.end_time,
    }))
}

function dateOnlyNotices(notices = [], date) {
  return notices.filter(n => (
    n && n.is_deleted !== true && n.date &&
    n.date <= date && (n.end_date || n.date) >= date &&
    (n.is_all_day === true || !n.start_time || !n.end_time)
  ))
}

// 겹침 감지: 같은 업체 + 시간 겹침
// 같은 구역 → real(형광연두), 다른 구역 → warn(amber)
function detectConflicts(evs) {
  const map = new Map()
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j]
      if (a.type === 'pickup' || b.type === 'pickup' || a.type === 'notice' || b.type === 'notice') continue
      if (a.vendor_key !== b.vendor_key) continue
      if (!(timeToMin(a.start_time) < timeToMin(b.end_time) &&
            timeToMin(b.start_time) < timeToMin(a.end_time))) continue
      const za = a.zone_code || '', zb = b.zone_code || ''
      const level = (za && zb && za !== zb) ? 'warn' : 'real'
      const setLv = (id, lv) => { if (!map.has(id) || lv === 'real') map.set(id, lv) }
      setLv(a.id, level)
      setLv(b.id, level)
    }
  }
  return map
}

// ────────────────────────────────────────────────────────────────
// 이벤트 추가 모달
// ────────────────────────────────────────────────────────────────
function EventModal({ open, onClose, onSave, vendors, reservations, defaultDate }) {
  const [form, setForm] = useState({
    date: '', start_time: '09:00', end_time: '10:30',
    type: 'exp', vendor_key: '', reservation_no: '', prog_name: '', memo: '',
  })

  useEffect(() => {
    if (open) setForm(f => ({ ...f, date: defaultDate || f.date }))
  }, [open, defaultDate])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.date)       { alert('날짜를 입력하세요.'); return }
    if (!form.start_time) { alert('시작 시간을 입력하세요.'); return }
    const selRes = reservations.find(r => r.no === form.reservation_no)
    onSave({
      ...form,
      package_name: selRes?.package_name || selRes?.pkg || '',
      customer: selRes?.customer || '',
      pax: selRes?.pax || 0,
      zone_code: selRes?.zone_code || selRes?.zone || '',
    })
  }

  if (!open) return null

  const S = {
    inp: { width:'100%', height:'36px', background:'#0f1923', border:'1px solid #2a3a4a',
           borderRadius:'7px', padding:'0 12px', fontSize:'13px', color:'#e8eaed', outline:'none',
           fontFamily:'Noto Sans KR, sans-serif', boxSizing:'border-box' },
    lbl: { fontSize:'11px', color:'#8a9ab0', display:'block', marginBottom:'4px', fontWeight:'600' },
    typeBtn: (active) => ({ flex:1, height:'36px', border:'1px solid', borderRadius:'8px',
      cursor:'pointer', fontSize:'13px', fontWeight:'600', fontFamily:'Noto Sans KR, sans-serif',
      background: active ? 'rgba(78,205,196,0.15)' : '#0f1923',
      borderColor: active ? '#4ecdc4' : '#2a3a4a',
      color: active ? '#4ecdc4' : '#8a9ab0' }),
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',
                 alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px'}}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'14px',
                   width:'100%',maxWidth:'440px'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #2a3a4a',
                     display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:'700',fontSize:'14px'}}>+ 수동 일정 추가</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#8a9ab0',
                                            fontSize:'18px',cursor:'pointer'}}>✕</button>
        </div>
        <div style={{padding:'20px',display:'flex',flexDirection:'column',gap:'12px'}}>
          {/* 구분 */}
          <div>
            <label style={S.lbl}>구분</label>
            <div style={{display:'flex',gap:'8px'}}>
              {[['exp','체험'],['pickup','픽업/드랍']].map(([v,l]) => (
                <button key={v} onClick={() => set('type', v)} style={S.typeBtn(form.type === v)}>{l}</button>
              ))}
            </div>
          </div>
          {/* 날짜/시간 */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
            <div><label style={S.lbl}>날짜 *</label>
              <input type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" style={S.inp} value={form.date} onChange={e => set('date', formatDateTyping(e.target.value))}/></div>
            <div><label style={S.lbl}>시작</label>
              <input type="time" style={S.inp} value={form.start_time} onChange={e => set('start_time', e.target.value)}/></div>
            <div><label style={S.lbl}>종료</label>
              <input type="time" style={S.inp} value={form.end_time} onChange={e => set('end_time', e.target.value)}/></div>
          </div>
          {/* 예약 연결 */}
          <div>
            <label style={S.lbl}>예약 연결 (선택)</label>
            <select style={S.inp} value={form.reservation_no} onChange={e => set('reservation_no', e.target.value)}>
              <option value="">연결 안 함</option>
              {reservations.map(r => (
                <option key={r.no} value={r.no}>#{r.no} {r.customer} · {r.date} · {r.package_name || r.pkg}</option>
              ))}
            </select>
          </div>
          {/* 담당 업체 */}
          <div>
            <label style={S.lbl}>{form.type === 'pickup' ? '픽업 수행자' : '담당 업체'}</label>
            <select style={S.inp} value={form.vendor_key} onChange={e => set('vendor_key', e.target.value)}>
              <option value="">선택</option>
              {vendors.map(v => <option key={v.key} value={v.key}>{v.key} — {v.name}</option>)}
            </select>
          </div>
          {/* 프로그램/메모 */}
          <div>
            <label style={S.lbl}>프로그램명 / 내용</label>
            <input style={S.inp} value={form.prog_name}
                   onChange={e => set('prog_name', e.target.value)}
                   placeholder="예) 애프터눈티, 픽업 안동역→금소"/>
          </div>
          <div>
            <label style={S.lbl}>메모</label>
            <input style={S.inp} value={form.memo} onChange={e => set('memo', e.target.value)}
                   placeholder="추가 메모"/>
          </div>
        </div>
        <div style={{padding:'14px 20px',borderTop:'1px solid #2a3a4a',
                     display:'flex',justifyContent:'flex-end',gap:'8px'}}>
          <button onClick={onClose}
                  style={{height:'36px',padding:'0 16px',background:'none',border:'1px solid #2a3a4a',
                          borderRadius:'8px',color:'#8a9ab0',cursor:'pointer',
                          fontFamily:'Noto Sans KR, sans-serif',fontSize:'13px'}}>닫기</button>
          <button onClick={handleSave}
                  style={{height:'36px',padding:'0 20px',background:'#4ecdc4',border:'none',
                          borderRadius:'8px',color:'#0f1923',fontWeight:'700',cursor:'pointer',
                          fontFamily:'Noto Sans KR, sans-serif',fontSize:'13px'}}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 이벤트 상세 팝업
// ────────────────────────────────────────────────────────────────
function NoticeEventModal({ open, onClose, onSave, defaultDate, defaultStartTime, defaultEndTime, defaultAllDay, initialNotice }) {
  const [form, setForm] = useState({
    id: null,
    date: '', end_date: '', title: '', start_time: '09:00', end_time: '10:00',
    is_all_day: false, place: '', content: '', special: '', color: '#6E8DFB', notice_type: '일반',
  })

  useEffect(() => {
    if (open) setForm(f => {
      if (initialNotice) {
        const isAllDay = initialNotice.is_all_day_notice === true
        return {
          ...f,
          id: initialNotice.notice_id || null,
          date: initialNotice.date || '',
          end_date: initialNotice.end_date || initialNotice.date || '',
          title: initialNotice.title || initialNotice.prog_name || '',
          start_time: isAllDay ? '09:00' : (initialNotice.start_time || '09:00'),
          end_time: isAllDay ? '10:00' : (initialNotice.end_time || '10:00'),
          is_all_day: isAllDay,
          place: initialNotice.place || '',
          content: initialNotice.content || '',
          special: initialNotice.special || '',
          color: initialNotice.color || initialNotice.vendor_color || '#6E8DFB',
          notice_type: initialNotice.notice_type || initialNotice.vendor_name || '일반',
        }
      }
      const date = defaultDate || f.date || ''
      return {
        ...f,
        id: null,
        date,
        end_date: date,
        title: '',
        start_time: defaultStartTime || f.start_time || '09:00',
        end_time: defaultEndTime || f.end_time || '10:00',
        is_all_day: defaultAllDay ?? false,
        place: '',
        content: '',
        special: '',
        color: '#6E8DFB',
        notice_type: '일반',
      }
    })
  }, [open, defaultDate, defaultStartTime, defaultEndTime, defaultAllDay, initialNotice])

  if (!open) return null

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const colors = ['#6E8DFB', '#4ECDC4', '#F7C948', '#FF6B6B', '#B8B8FF']
  const input = {
    width:'100%', height:'38px', background:'#203a54', border:'1px solid #31516d',
    borderRadius:'8px', padding:'0 12px', fontSize:'13px', color:'#e8eaed', outline:'none',
    fontFamily:'Noto Sans KR, sans-serif', boxSizing:'border-box',
  }
  const label = { fontSize:'11px', color:'#8a9ab0', display:'block', marginBottom:'5px', fontWeight:'700' }

  const handleSave = () => {
    if (!form.date) return alert('날짜를 입력해주세요.')
    const endDate = form.end_date || form.date
    if (endDate < form.date) return alert('종료일은 시작일보다 빠를 수 없습니다.')
    if (!form.title.trim()) return alert('일정 제목을 입력해주세요.')
    if (!form.is_all_day && (!form.start_time || !form.end_time)) return alert('시간 일정은 시작/종료 시간을 입력해주세요.')
    onSave({
      id: form.id || undefined,
      date: form.date,
      end_date: endDate,
      title: form.title.trim(),
      start_time: form.is_all_day ? null : form.start_time,
      end_time: form.is_all_day ? null : form.end_time,
      is_all_day: !!form.is_all_day,
      place: form.place.trim() || null,
      content: form.content.trim() || null,
      special: form.special.trim() || null,
      color: form.color || '#6E8DFB',
      notice_type: form.notice_type || '일반',
    })
  }
  const dateRangeLabel = form.date
    ? `${form.date}${(form.end_date || form.date) !== form.date ? ` ~ ${form.end_date || form.date}` : ''}`
    : '시작일과 종료일을 입력하세요'

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',
                 alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px'}}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'14px',
                   width:'100%',maxWidth:'520px',boxShadow:'0 20px 50px rgba(0,0,0,.45)'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #2a3a4a',
                     display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:'800',fontSize:'14px'}}>{form.id ? '일반 일정 수정' : '일반 일정 추가'}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#8a9ab0',
                                            fontSize:'20px',cursor:'pointer'}}>×</button>
        </div>
        <div style={{padding:'20px',display:'flex',flexDirection:'column',gap:'13px'}}>
          <div>
            <input
              style={{...input,height:'46px',background:'transparent',border:'none',borderBottom:'1px solid #5a7080',borderRadius:0,padding:'0 2px',fontSize:'22px',fontWeight:'800'}}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="일정 제목"
            />
          </div>
          <div style={{fontSize:'13px',fontWeight:'800',color:'#dce6ef'}}>{dateRangeLabel}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <div>
              <label style={label}>시작일 *</label>
              <input type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" style={input} value={form.date} onChange={e => set('date', formatDateTyping(e.target.value))}/>
            </div>
            <div>
              <label style={label}>종료일</label>
              <input type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" style={input} value={form.end_date} onChange={e => set('end_date', formatDateTyping(e.target.value))}/>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <div>
              <label style={label}>구분</label>
              <select style={input} value={form.notice_type} onChange={e => set('notice_type', e.target.value)}>
                <option value="일반">일반</option>
                <option value="공지">공지</option>
                <option value="운영">운영</option>
                <option value="휴무">휴무</option>
                <option value="특일">특일</option>
              </select>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr',gap:'10px',alignItems:'end'}}>
            <label style={{height:'38px',display:'inline-flex',alignItems:'center',gap:'8px',fontSize:'12px',fontWeight:'700',color:'#dce6ef',whiteSpace:'nowrap'}}>
              <input type="checkbox" checked={form.is_all_day} onChange={e => set('is_all_day', e.target.checked)}/>
              종일
            </label>
            <div>
              <label style={label}>시작</label>
              <input type="time" style={input} value={form.start_time} disabled={form.is_all_day} onChange={e => set('start_time', e.target.value)}/>
            </div>
            <div>
              <label style={label}>종료</label>
              <input type="time" style={input} value={form.end_time} disabled={form.is_all_day} onChange={e => set('end_time', e.target.value)}/>
            </div>
          </div>
          <div>
            <label style={label}>장소</label>
            <input style={input} value={form.place} onChange={e => set('place', e.target.value)} placeholder="장소"/>
          </div>
          <div>
            <label style={label}>색상</label>
            <div style={{display:'flex',gap:'8px'}}>
              {colors.map(color => (
                <button key={color} onClick={() => set('color', color)} title={color}
                  style={{width:'28px',height:'28px',borderRadius:'50%',background:color,border:form.color === color ? '2px solid #fff' : '1px solid #2a3a4a',cursor:'pointer'}} />
              ))}
            </div>
          </div>
          <div>
            <label style={label}>메모</label>
            <textarea style={{...input,height:'76px',padding:'16px 12px 8px',lineHeight:'1.45',resize:'vertical'}} value={form.content} onChange={e => set('content', e.target.value)} placeholder="상세 내용"/>
          </div>
          <div>
            <label style={label}>특이사항</label>
            <input style={input} value={form.special} onChange={e => set('special', e.target.value)} placeholder="휴무, 행사, 준비 필요 등"/>
          </div>
        </div>
        <div style={{padding:'14px 20px',borderTop:'1px solid #2a3a4a',
                     display:'flex',justifyContent:'flex-end',gap:'8px'}}>
          <button onClick={onClose}
                  style={{height:'36px',padding:'0 16px',background:'none',border:'1px solid #2a3a4a',
                          borderRadius:'8px',color:'#8a9ab0',cursor:'pointer',
                          fontFamily:'Noto Sans KR, sans-serif',fontSize:'13px'}}>취소</button>
          <button onClick={handleSave}
                  style={{height:'36px',padding:'0 20px',background:'#4ecdc4',border:'none',
                          borderRadius:'8px',color:'#0f1923',fontWeight:'800',cursor:'pointer',
                          fontFamily:'Noto Sans KR, sans-serif',fontSize:'13px'}}>{form.id ? '수정 저장' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

function EventPopup({ ev, pos, onClose, onEdit, onDelete, zones }) {
  if (!ev) return null
  const zone = zones.find(z => z.code === ev.zone_code)
  const popupDateLabel = ev.end_date && ev.end_date !== ev.date ? `${ev.date} ~ ${ev.end_date}` : ev.date
  const popupTimeLabel = ev.is_all_day_notice ? '00:00 ~ 24:00' : `${ev.start_time?.slice(0,5)} ~ ${ev.end_time?.slice(0,5)}`
  const popupKind = ev.type === 'notice' ? '일반 일정' : ev.type === 'pickup' ? '🚐 픽업/드랍 일정' : '체험 일정'
  return (
    <div style={{position:'fixed',inset:0,zIndex:900}} onClick={onClose}>
      <div style={{position:'fixed', top: pos.y, left: pos.x,
                   background:'#1a2535',border:`1px solid ${ev.vendor_color||'#4ecdc4'}`,
                   borderRadius:'10px',padding:'14px 16px',minWidth:'220px',maxWidth:'300px',
                   boxShadow:'0 8px 24px rgba(0,0,0,0.5)',zIndex:901}}
           onClick={e => e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
          <span style={{fontWeight:'700',fontSize:'13px',color:ev.vendor_color||'#4ecdc4'}}>
            {popupKind}
          </span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#8a9ab0',
                                            fontSize:'15px',cursor:'pointer',padding:'0'}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'5px',fontSize:'12px'}}>
          <div><span style={{color:'#8a9ab0'}}>{ev.type === 'notice' ? '구분 ' : '업체 '} </span><span style={{color:'#e8eaed'}}>{ev.vendor_name}</span></div>
          {ev.prog_name && <div><span style={{color:'#8a9ab0'}}>{ev.type === 'notice' ? '제목 ' : '프로그램 '} </span><span style={{color:'#e8eaed'}}>{ev.prog_name}</span></div>}
          {ev.customer && <div><span style={{color:'#8a9ab0'}}>고객 </span><span style={{color:'#e8eaed'}}>{ev.customer}{ev.pax?` (${ev.pax}명)`:''}</span></div>}
          {ev.pkg_name && <div><span style={{color:'#8a9ab0'}}>패키지 </span><span style={{color:'#e8eaed'}}>{ev.pkg_name}</span></div>}
          {ev.reservation_no && <div><span style={{color:'#8a9ab0'}}>예약 </span><span style={{color:'#e8eaed'}}>#{ev.reservation_no}</span></div>}
          {zone && <div><span style={{color:'#8a9ab0'}}>구역 </span><span style={{color:'#e8eaed'}}>{zone.code} · {zone.name}</span></div>}
          {ev.date && <div><span style={{color:'#8a9ab0'}}>기간 </span><span style={{color:'#e8eaed'}}>{popupDateLabel}</span></div>}
          <div><span style={{color:'#8a9ab0'}}>시간 </span><span style={{color:'#e8eaed'}}>{popupTimeLabel}</span></div>
          {ev.memo && <div><span style={{color:'#8a9ab0'}}>메모 </span><span style={{color:'#e8eaed',whiteSpace:'pre-wrap'}}>{ev.memo}</span></div>}
        </div>
        {ev.is_manual && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'10px'}}>
            {ev.is_notice && (
              <button onClick={() => onEdit(ev)}
                      style={{height:'30px',background:'rgba(78,205,196,0.14)',
                              border:'1px solid rgba(78,205,196,0.32)',borderRadius:'6px',color:'#4ecdc4',
                              cursor:'pointer',fontSize:'12px',fontWeight:'700',
                              fontFamily:'Noto Sans KR, sans-serif'}}>수정</button>
            )}
            <button onClick={() => onDelete(ev.id)}
                    style={{height:'30px',background:'rgba(224,92,92,0.15)',
                            border:'1px solid rgba(224,92,92,0.3)',borderRadius:'6px',color:'#e05c5c',
                            cursor:'pointer',fontSize:'12px',fontWeight:'600',
                            fontFamily:'Noto Sans KR, sans-serif',
                            gridColumn: ev.is_notice ? 'auto' : '1 / -1'}}>삭제</button>
          </div>
        )}
        {!ev.is_manual && (
          <div style={{marginTop:'8px',fontSize:'11px',color:'#5a7080',textAlign:'center'}}>
            자동 생성 이벤트 (예약에서 관리)
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 메인 타임테이블 페이지
// ────────────────────────────────────────────────────────────────
export default function TimetablePage() {
  const [vendors,      setVendors]      = useState([])
  const [reservations, setReservations] = useState([])
  const [packages,     setPackages]     = useState([])
  const [budgetUsages, setBudgetUsages] = useState([])
  const [zones,        setZones]        = useState([])
  const [notices,      setNotices]      = useState([])
  const [manualEvents, setManualEvents] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('day')
  const [group,        setGroup]        = useState('all')
  const [curDate,      setCurDate]      = useState(new Date())
  const [selZone,      setSelZone]      = useState('')
  const [modal,        setModal]        = useState(false)
  const [modalDefaults,setModalDefaults]= useState({})
  const [editingNotice,setEditingNotice]= useState(null)
  const [dragDraft,    setDragDraft]    = useState(null)
  const [popup,        setPopup]        = useState(null)   // { ev, pos }
  const [conflictPopup,setConflictPopup]= useState(false)
  const lastConflictsRef = useRef([])
  const dragRef = useRef(null)

  // ── 기준 데이터 로드 (1회)
  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*').order('key'),
      supabase.from('reservations').select('*').order('date', { ascending: false }),
      supabase.from('packages').select('*, package_zones(*), package_programs(*, vendors(key,name,color))').order('name'),
      supabase.from('reservation_budget_usages').select('id,reservation_no,usage_type,operation_type,sale_type,item_name,component_uid,zone_code,zone_codes,package_id,package_name,vendor_key,prog_name,people_count,start_time,end_time,place,is_deleted').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('zones').select('*').order('code'),
      supabase.from('notices').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('date').order('start_time', { nullsFirst: true }),
    ]).then(([vR, rR, pR, uR, zR, nR]) => {
      setVendors(vR.data || [])
      setReservations(rR.data || [])
      setPackages(pR.data || [])
      setBudgetUsages(uR.data || [])
      setNotices(nR.data || [])
      const zd = zR.data || []
      setZones(zd)
      if (zd.length) setSelZone(zd[0].code)
      setLoading(false)
    })
  }, [])

  // ── 수동 이벤트 로드 (날짜/뷰 변경 시)
  const fetchManual = useCallback(async () => {
    let url = '/api/timetable?'
    if (view === 'day') url += `date=${dateStr(curDate)}`
    else url += `week=${dateStr(getMon(curDate))}`
    const res = await fetch(url)
    const data = await res.json()
    setManualEvents(Array.isArray(data) ? data.map(e => ({
      ...e,
      vendor_name: vendors.find(v => v.key === e.vendor_key)?.name || e.vendor_key || '',
      vendor_color: vendors.find(v => v.key === e.vendor_key)?.color || '#4ECDC4',
      pkg_name: e.package_name || '',
    })) : [])
  }, [view, curDate, vendors])

  useEffect(() => { if (!loading) fetchManual() }, [loading, fetchManual])

  // ── 전체 이벤트 = 자동 + 수동
  const autoEvents = buildAutoEvents(reservations, packages, budgetUsages, vendors)
  const noticeEvents = buildNoticeEvents(notices)
  const allEvents = [
    ...autoEvents.map(e => ({ ...e, id: String(e.id) })),
    ...noticeEvents.map(e => ({ ...e, id: String(e.id) })),
    ...manualEvents.map(e => ({ ...e, id: String(e.id), vendor_name: e.vendor_name || e.vendor_key || '' })),
  ]

  // ── 날짜 네비게이션
  const navigate = dir => {
    const d = new Date(curDate)
    if (view === 'day')        d.setDate(d.getDate() + dir)
    else if (view === 'week')  d.setDate(d.getDate() + dir * 7)
    else                       d.setMonth(d.getMonth() + dir)
    setCurDate(d)
  }

  // ── 수동 이벤트 저장
  const refreshNotices = async () => {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('date')
      .order('start_time', { nullsFirst: true })
    setNotices(data || [])
  }

  const handleSave = async form => {
    const { id, ...payload } = form
    const res = await fetch('/api/notices', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id, ...payload } : payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(`일정 저장 실패: ${data?.error?.message || data?.error || '알 수 없는 오류'}`)
      return
    }
    setModal(false)
    setModalDefaults({})
    setEditingNotice(null)
    setPopup(null)
    await refreshNotices()
  }

  const openNoticeModal = (defaults = {}) => {
    setEditingNotice(null)
    setModalDefaults(defaults)
    setModal(true)
  }

  const openNoticeEditModal = ev => {
    setModalDefaults({})
    setEditingNotice(ev)
    setPopup(null)
    setModal(true)
  }

  const timeFromPointer = (e, el) => {
    const rect = el.getBoundingClientRect()
    const y = Math.min(Math.max(e.clientY - rect.top, 0), TOTAL_H)
    const raw = TT_START * 60 + (y / HOUR_H) * 60
    const snapped = Math.round(raw / 15) * 15
    return Math.min(Math.max(snapped, TT_START * 60), TT_END * 60)
  }

  const beginTimeDrag = (e, date) => {
    if (e.button !== 0 || e.target.closest('[data-event-block="true"]')) return
    const startMin = timeFromPointer(e, e.currentTarget)
    dragRef.current = { date, startMin, currentMin: startMin }
    setDragDraft({ date, startMin, endMin: Math.min(startMin + 15, TT_END * 60) })
  }

  const moveTimeDrag = e => {
    if (!dragRef.current) return
    const currentMin = timeFromPointer(e, e.currentTarget)
    dragRef.current.currentMin = currentMin
    const startMin = Math.min(dragRef.current.startMin, currentMin)
    const endMin = Math.max(dragRef.current.startMin, currentMin)
    setDragDraft({ date: dragRef.current.date, startMin, endMin: Math.max(endMin, startMin + 15) })
  }

  const endTimeDrag = () => {
    if (!dragRef.current) return
    const { date, startMin: rawStart, currentMin } = dragRef.current
    dragRef.current = null
    const startMin = Math.min(rawStart, currentMin)
    let endMin = Math.max(rawStart, currentMin)
    if (endMin - startMin < 15) endMin = startMin + 60
    endMin = Math.min(endMin, TT_END * 60)
    setDragDraft(null)
    openNoticeModal({
      date,
      start_time: minToTime(startMin),
      end_time: minToTime(endMin),
      is_all_day: false,
    })
  }

  const DragSelection = ({ date }) => {
    if (!dragDraft || dragDraft.date !== date) return null
    const top = ((dragDraft.startMin - TT_START * 60) / 60) * HOUR_H
    const height = Math.max(((dragDraft.endMin - dragDraft.startMin) / 60) * HOUR_H, 16)
    return (
      <div style={{
        position:'absolute', left:'4px', right:'4px', top, height,
        background:'rgba(110,141,251,.24)', border:'1px solid rgba(110,141,251,.75)',
        borderRadius:'7px', pointerEvents:'none', zIndex:4,
      }}/>
    )
  }

  // ── 수동 이벤트 삭제
  const handleDelete = async id => {
    if (String(id).startsWith('notice_')) {
      if (!confirm('일정을 삭제하시겠습니까?')) return
      await fetch('/api/notices', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: String(id).replace(/^notice_/, '') }),
      })
      setPopup(null)
      await refreshNotices()
      return
    }
    if (!confirm('이 수동 일정을 삭제하시겠습니까?')) return
    await fetch('/api/timetable', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setPopup(null)
    await fetchManual()
  }

  // ── 겹침 목록 팝업 텍스트
  const showConflicts = () => {
    const cs = lastConflictsRef.current
    if (!cs.length) { alert('현재 겹치는 일정이 없습니다.'); return }
    const real = cs.filter(c => c.level === 'real')
    const warn = cs.filter(c => c.level === 'warn')
    let msg = ''
    if (real.length) {
      msg += `🟢 진짜 겹침 (같은 구역·업체) ${real.length}건\n`
      msg += real.map((c,i) =>
        `${i+1}. [${c.a.vendor_name}] ${c.a.start_time?.slice(0,5)}~${c.a.end_time?.slice(0,5)}\n` +
        `   ${c.a.customer||''}(${c.a.pax||0}명) / ${c.b.customer||''}(${c.b.pax||0}명)`
      ).join('\n\n')
    }
    if (warn.length) {
      if (msg) msg += '\n\n'
      msg += `🟡 이동 확인 필요 (다른 구역) ${warn.length}건\n`
      msg += warn.map((c,i) =>
        `${i+1}. [${c.a.vendor_name}] ${c.a.start_time?.slice(0,5)}~${c.a.end_time?.slice(0,5)}\n` +
        `   ${c.a.zone_code||''} / ${c.b.zone_code||''}\n` +
        `   ${c.a.customer||''} / ${c.b.customer||''}`
      ).join('\n\n')
    }
    alert(msg)
  }

  // ── 공통 스타일 함수
  const tabBtn = active => ({
    height:'32px', minWidth:'42px', padding:'0 12px', borderRadius:'7px', cursor:'pointer',
    fontFamily:'Noto Sans KR, sans-serif', fontSize:'12px', fontWeight:'600',
    border: active ? 'none' : '1px solid #2a3a4a',
    background: active ? '#4ecdc4' : '#1a2535',
    color: active ? '#0f1923' : '#8a9ab0',
    display:'inline-flex', alignItems:'center', justifyContent:'center', textAlign:'center',
    whiteSpace:'nowrap',
    transition:'all .15s',
  })

  // ── 시간축
  const TimeAxis = () => (
    <div style={{width:'56px',flexShrink:0,position:'relative',height:TOTAL_H,background:'#122132'}}>
      {Array.from({length: TT_END - TT_START}, (_, i) => (
        <div key={i} style={{position:'absolute',top:i*HOUR_H-8,fontSize:'10px',
                              color:'#8a9ab0',right:'8px',userSelect:'none'}}>
          {String(TT_START+i).padStart(2,'0')}:00
        </div>
      ))}
    </div>
  )

  // ── 그리드 선
  const Grid = ({ isToday }) => {
    const nowPx = isToday ? timeToPx(`${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2,'0')}`) : -1
    return (
      <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
        {Array.from({length: TT_END - TT_START}, (_, i) => (
          <div key={i}>
            <div style={{position:'absolute',left:0,right:0,top:i*HOUR_H,borderTop:'1px solid #2a3a4a'}}/>
            {[1,2,3].map(q => (
              <div key={q} style={{position:'absolute',left:0,right:0,
                                   top:i*HOUR_H+q*HOUR_H/4,borderTop:'1px dashed #1a2535'}}/>
            ))}
          </div>
        ))}
        {isToday && nowPx >= 0 && (
          <div style={{position:'absolute',left:0,right:0,top:nowPx,
                       borderTop:'2px solid rgba(78,205,196,0.75)',zIndex:1,
                       boxShadow:'0 0 12px rgba(78,205,196,.25)'}}/>
        )}
      </div>
    )
  }

  // ── 이벤트 블록
  const EvBlock = ({ ev, conflictMap }) => {
    const top = timeToPx(ev.start_time)
    const h   = durPx(ev.start_time, ev.end_time)
    const isPickup = ev.type === 'pickup'
    const color = ev.vendor_color || '#4ECDC4'
    const level = conflictMap?.get(ev.id)
    const borderColor = level === 'real' ? '#33ff33' : level === 'warn' ? '#F7C948' : color
    const icon = level === 'real' ? '🟢 ' : level === 'warn' ? '🟡 ' : ''
    const isCompact = h < 42
    const customerText = ev.customer ? `${ev.customer}${ev.pax ? ` ${ev.pax}명` : ''}` : ''
    const timeText = `${ev.start_time?.slice(0,5)}~${ev.end_time?.slice(0,5)}`

    const handleClick = e => {
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      setPopup({ ev, pos: { x: Math.min(rect.right + 4, window.innerWidth - 320), y: rect.top } })
    }

    return (
      <div data-event-block="true" onClick={handleClick}
           style={{position:'absolute',left:'3px',right:'3px',top,height:h,
                   background: color + '22',
                   border: level ? `2px solid ${borderColor}` : `1px solid ${color}44`,
                   borderLeft:`3px solid ${borderColor}`,
                   borderRadius:'7px',padding: isCompact ? '3px 6px' : '5px 7px',cursor:'pointer',overflow:'hidden',
                   boxSizing:'border-box',boxShadow:'0 6px 18px rgba(0,0,0,.18)'}}>
        {isCompact ? (
          <>
            <div style={{fontWeight:'700',fontSize:'10px',lineHeight:'11px',color:borderColor,
                         whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {icon}{isPickup ? '🚐 ' : ''}{ev.vendor_name || ev.vendor_key}{customerText ? ` · ${customerText}` : ''}
            </div>
            <div style={{fontSize:'9px',lineHeight:'10px',color,opacity:.9,
                         whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {ev.prog_name || ev.pkg_name || ''}{ev.prog_name || ev.pkg_name ? ' · ' : ''}{timeText}
            </div>
          </>
        ) : (
          <>
            <div style={{fontWeight:'700',fontSize:'11px',color:borderColor,
                         whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {icon}{isPickup ? '🚐 ' : ''}{ev.vendor_name || ev.vendor_key}
            </div>
            {ev.customer && (
              <div style={{fontSize:'10px',color,opacity:.9,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {customerText}
              </div>
            )}
            {ev.prog_name && (
              <div style={{fontSize:'10px',color,opacity:.75,whiteSpace:'nowrap',
                           overflow:'hidden',textOverflow:'ellipsis'}}>
                {ev.prog_name}
              </div>
            )}
            <div style={{fontSize:'10px',color,opacity:.7}}>
              {timeText}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── 컬럼 헤더 + 바디 구성 헬퍼
  const makeCol = (key, header, evs, conflictMap, isToday, flex='1') => ({
    key, header, evs, conflictMap, isToday, flex,
  })

  const AllDayLane = ({ dates }) => {
    const dateList = Array.isArray(dates) ? dates : [dates]
    const rows = buildNoticeEvents(notices)
      .filter(ev => isAllDayEvent(ev) && dateList.some(ds => eventActiveOn(ev, ds)))
      .map(ev => {
        const startIdx = dateList.findIndex(ds => eventActiveOn(ev, ds))
        let endIdx = dateList.length - 1
        for (let i = dateList.length - 1; i >= 0; i--) {
          if (eventActiveOn(ev, dateList[i])) { endIdx = i; break }
        }
        return { ev, startIdx: Math.max(startIdx, 0), endIdx: Math.max(endIdx, Math.max(startIdx, 0)) }
      })
    if (!rows.length) return (
      <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#122132'}}>
        <div style={{width:'56px',flexShrink:0,padding:'7px 8px 7px 0',fontSize:'10px',fontWeight:'800',color:'#8a9ab0',boxSizing:'border-box',textAlign:'right'}}>종일</div>
        <div style={{flex:1,minHeight:'30px'}}/>
      </div>
    )

    const lanes = []
    rows.forEach(row => {
      let placed = false
      for (const lane of lanes) {
        if (!lane.some(other => !(row.endIdx < other.startIdx || row.startIdx > other.endIdx))) {
          lane.push(row)
          placed = true
          break
        }
      }
      if (!placed) lanes.push([row])
    })

    return (
      <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#122132'}}>
        <div style={{width:'56px',flexShrink:0,padding:'7px 8px 7px 0',fontSize:'10px',fontWeight:'800',color:'#8a9ab0',boxSizing:'border-box',textAlign:'right'}}>종일</div>
        <div style={{flex:1,display:'grid',gridTemplateColumns:`repeat(${dateList.length}, minmax(0, 1fr))`,gap:'0',padding:'5px 0'}}>
          {lanes.map((lane, laneIdx) => lane.map(({ ev, startIdx, endIdx }) => {
            const color = ev.vendor_color || '#6E8DFB'
            return (
              <button
                key={`${ev.id}-${laneIdx}`}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setPopup({
                    ev,
                    pos: { x: Math.min(rect.right + 4, window.innerWidth - 320), y: rect.top },
                  })
                }}
                style={{
                  gridColumn:`${startIdx + 1} / ${endIdx + 2}`,
                  gridRow: laneIdx + 1,
                  minWidth:0,
                  height:'22px',
                  margin:'2px 3px',
                  padding:'0 8px',
                  border:'none',
                  borderRadius:'4px',
                  background:color,
                  color:'#0f1923',
                  fontSize:'11px',
                  fontWeight:'800',
                  textAlign:'left',
                  overflow:'hidden',
                  textOverflow:'ellipsis',
                  whiteSpace:'nowrap',
                  cursor:'pointer',
                  fontFamily:'Noto Sans KR, sans-serif',
                }}
              >
                {ev.prog_name}
              </button>
            )
          }))}
        </div>
      </div>
    )
  }

  // ── 일간 뷰
  const DayView = () => {
    const ds = dateStr(curDate)
    const isToday = ds === dateStr(new Date())
    let dayEvs = allEvents.filter(e => eventActiveOn(e, ds))

    if (group === 'zone' && selZone) {
      dayEvs = dayEvs.filter(e => e.zone_code === selZone || !e.zone_code)
    }

    const timedEvs  = dayEvs.filter(e => !isAllDayEvent(e))
    const expEvs    = timedEvs.filter(e => e.type !== 'pickup')
    const pickupEvs = timedEvs.filter(e => e.type === 'pickup')

    // 겹침 감지 (expEvs 기준)
    const conflictMap = detectConflicts(expEvs)

    // lastConflicts 업데이트
    const cs = []
    for (let i = 0; i < expEvs.length; i++) {
      for (let j = i + 1; j < expEvs.length; j++) {
        const a = expEvs[i], b = expEvs[j]
        if (a.type === 'notice' || b.type === 'notice') continue
        if (a.vendor_key !== b.vendor_key) continue
        if (!(timeToMin(a.start_time) < timeToMin(b.end_time) &&
              timeToMin(b.start_time) < timeToMin(a.end_time))) continue
        const za = a.zone_code || '', zb = b.zone_code || ''
        cs.push({ a, b, level: (za && zb && za !== zb) ? 'warn' : 'real' })
      }
    }
    lastConflictsRef.current = cs
    const realCnt = cs.filter(c => c.level === 'real').length
    const warnCnt = cs.filter(c => c.level === 'warn').length
    const totalConflict = realCnt + warnCnt

    let cols = []
    if (group === 'all' || group === 'zone') {
      const resNos = [...new Set(expEvs.map(e => e.reservation_no).filter(Boolean))]
      cols = resNos.map(no => {
        const r = reservations.find(x => x.no === no)
        const packageName = r?.package_name || r?.pkg || ''
        const zoneCode = r?.zone_code || r?.zone || ''
        const zone = zones.find(z => z.code === zoneCode)
        return {
          key: no,
          header: (
            <div>
              {zone && <div style={{fontSize:'9px',color:'#5a7080',marginBottom:'1px'}}>{zone.code} · {zone.name}</div>}
              <div style={{fontSize:'11px',fontWeight:'700',color:'var(--accent)'}}>{packageName}</div>
              <div style={{fontSize:'11px',color:'#e8eaed'}}>NO.{no} · {r?.customer || ''} · {r?.pax || 0}명</div>
            </div>
          ),
          evs: expEvs.filter(e => e.reservation_no === no),
          topColor: 'var(--accent)',
        }
      })
      // 예약 미연결 수동 이벤트
      const noRes = expEvs.filter(e => !e.reservation_no)
      if (noRes.length) cols.push({
        key: 'unlinked',
        header: <div style={{fontSize:'12px',color:'#8a9ab0'}}>기타</div>,
        evs: noRes,
        topColor: '#8a9ab0',
      })

    } else if (group === 'package') {
      const pkgNames = [...new Set(expEvs.map(e => e.pkg_name).filter(Boolean))]
      cols = pkgNames.map(name => ({
        key: name,
        header: <div style={{fontSize:'12px',fontWeight:'700',color:'var(--accent)'}}>{name}</div>,
        evs: expEvs.filter(e => e.pkg_name === name),
        topColor: 'var(--accent)',
      }))

    } else if (group === 'vendor') {
      const vkeys = [...new Set(expEvs.map(e => e.vendor_key).filter(Boolean))]
      cols = vkeys.map(k => {
        const v = vendors.find(x => x.key === k)
        const color = v?.color || '#4ECDC4'
        const evs = expEvs.filter(e => e.vendor_key === k)
        return {
          key: k,
          header: (
            <div>
              <div style={{fontSize:'12px',fontWeight:'700',color}}>{v?.name || k}</div>
              <div style={{fontSize:'11px',color:'#8a9ab0'}}>{evs.length}건</div>
            </div>
          ),
          evs,
          topColor: color,
        }
      })
    }

    if (!cols.length && !pickupEvs.length) {
      return (
        <div>
          <AllDayLane dates={[ds]}/>
          <div style={{display:'flex'}}>
          <TimeAxis/>
          <div style={{flex:1}}>
            <div style={{padding:'18px',color:'#8a9ab0',fontSize:'13px',
                         borderBottom:'1px solid #2a3a4a',textAlign:'center'}}>이 날짜의 일정이 없습니다</div>
            <div
              onMouseDown={e => beginTimeDrag(e, ds)}
              onMouseMove={moveTimeDrag}
              onMouseUp={endTimeDrag}
              onMouseLeave={() => { dragRef.current = null; setDragDraft(null) }}
              style={{position:'relative',height:TOTAL_H,cursor:'crosshair'}}
            >
              <Grid isToday={isToday}/>
              <DragSelection date={ds}/>
            </div>
          </div>
          </div>
        </div>
      )
    }

    return (
      <div>
        {/* 겹침 알림 바 */}
        <AllDayLane dates={[ds]}/>
        {totalConflict > 0 && (
          <div onClick={showConflicts}
               style={{margin:'0 0 0 0',padding:'8px 16px',cursor:'pointer',
                       background: realCnt > 0 ? 'rgba(51,255,51,0.08)' : 'rgba(247,201,72,0.08)',
                       borderBottom:'1px solid',
                       borderColor: realCnt > 0 ? 'rgba(51,255,51,0.2)' : 'rgba(247,201,72,0.2)',
                       fontSize:'12px',fontWeight:'700',
                       color: realCnt > 0 ? '#33ff33' : '#F7C948'}}>
            ⚠ 겹침 {totalConflict}건 클릭하여 확인
          </div>
        )}
        {/* 헤더 */}
        <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#0f1923'}}>
          <div style={{width:'56px',flexShrink:0,background:'#122132'}}/>
          {cols.map(col => (
            <div key={col.key}
                 style={{flex:1,minWidth:'164px',padding:'11px 14px',borderRight:'1px solid #2a3a4a',
                         borderTop:`3px solid ${col.topColor||'#4ecdc4'}`,background:'#132438'}}>
              {col.header}
            </div>
          ))}
          {pickupEvs.length > 0 && (
            <div style={{width:'130px',flexShrink:0,padding:'10px 14px',
                         borderTop:'3px dashed #B8B8FF'}}>
              <div style={{fontSize:'12px',fontWeight:'700',color:'#B8B8FF'}}>🚐 픽업/드랍</div>
              <div style={{fontSize:'11px',color:'#8a9ab0',marginTop:'2px'}}>{pickupEvs.length}건</div>
            </div>
          )}
        </div>
        {/* 바디 */}
        <div style={{display:'flex',overflow:'auto',maxHeight:'calc(100vh - 330px)',minHeight:'420px'}}>
          <TimeAxis/>
          {cols.map(col => (
            <div
              key={col.key}
              onMouseDown={e => beginTimeDrag(e, ds)}
              onMouseMove={moveTimeDrag}
              onMouseUp={endTimeDrag}
              onMouseLeave={() => { dragRef.current = null; setDragDraft(null) }}
              style={{flex:1,minWidth:'164px',position:'relative',height:TOTAL_H,borderRight:'1px solid #2a3a4a',cursor:'crosshair'}}
            >
              <Grid isToday={isToday}/>
              <DragSelection date={ds}/>
              {col.evs.map(ev => <EvBlock key={ev.id} ev={ev} conflictMap={conflictMap}/>)}
            </div>
          ))}
          {pickupEvs.length > 0 && (
            <div
              onMouseDown={e => beginTimeDrag(e, ds)}
              onMouseMove={moveTimeDrag}
              onMouseUp={endTimeDrag}
              onMouseLeave={() => { dragRef.current = null; setDragDraft(null) }}
              style={{width:'130px',flexShrink:0,position:'relative',height:TOTAL_H,cursor:'crosshair'}}
            >
              <Grid isToday={isToday}/>
              <DragSelection date={ds}/>
              {pickupEvs.map(ev => <EvBlock key={ev.id} ev={ev} conflictMap={new Map()}/>)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 주간 뷰
  const WeekView = () => {
    const mon = getMon(curDate)
    const days = Array.from({length:7}, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d })
    const dateList = days.map(d => dateStr(d))
    const dayNames = ['월','화','수','목','금','토','일']
    const todayS = dateStr(new Date())

    return (
      <div>
        <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#0f1923'}}>
          <div style={{width:'56px',flexShrink:0,background:'#122132'}}/>
          {days.map((d, i) => {
            const ds = dateStr(d)
            const isT = ds === todayS
            const cnt = allEvents.filter(e => eventActiveOn(e, ds)).length
            return (
              <div key={i} onClick={() => { setCurDate(d); setView('day') }}
                   style={{flex:1,minWidth:'120px',padding:'11px 0',textAlign:'center',
                           borderRight:'1px solid #2a3a4a',cursor:'pointer',
                           background:isT?'rgba(78,205,196,.06)':'#132438',
                           borderTop: isT ? '3px solid #4ecdc4' : '3px solid transparent'}}>
                <div style={{fontSize:'11px',color:isT?'#4ecdc4':'#8a9ab0'}}>{dayNames[i]}</div>
                <div style={{fontSize:'16px',fontWeight:'700',
                             color:isT?'#4ecdc4':'#e8eaed',marginTop:'2px'}}>{d.getDate()}</div>
                {cnt > 0 && <div style={{fontSize:'10px',color:'#4ecdc4',marginTop:'2px'}}>{cnt}건</div>}
              </div>
            )
          })}
        </div>
        <AllDayLane dates={dateList}/>
        <div style={{display:'flex',overflow:'auto',maxHeight:'calc(100vh - 330px)',minHeight:'420px'}}>
          <TimeAxis/>
          {days.map((d, i) => {
            const ds = dateStr(d)
            const isT = ds === dateStr(new Date())
            const evs = allEvents.filter(e => eventActiveOn(e, ds) && !isAllDayEvent(e))
            const conflictMap = detectConflicts(evs)
            return (
              <div
                key={i}
                onMouseDown={e => beginTimeDrag(e, ds)}
                onMouseMove={moveTimeDrag}
                onMouseUp={endTimeDrag}
                onMouseLeave={() => { dragRef.current = null; setDragDraft(null) }}
                style={{flex:1,minWidth:'120px',position:'relative',height:TOTAL_H,borderRight:'1px solid #2a3a4a',cursor:'crosshair'}}
              >
                <Grid isToday={isT}/>
                <DragSelection date={ds}/>
                {evs.map(ev => <EvBlock key={ev.id} ev={ev} conflictMap={conflictMap}/>)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── 월간 뷰
  const MonthView = () => {
    const y = curDate.getFullYear()
    const m = curDate.getMonth()
    const first    = new Date(y, m, 1).getDay()
    const dows     = ['일','월','화','수','목','금','토']
    const adj      = first === 0 ? 6 : first - 1
    const todayS   = dateStr(new Date())

    const firstCellDate = dateStr(new Date(y, m, 1 - adj))
    const cells = Array.from({ length: 42 }, (_, i) => {
      const ds = addDaysStr(firstCellDate, i)
      const d = new Date(ds + 'T00:00:00')
      return {
        day: d.getDate(),
        date: ds,
        other: d.getMonth() !== m,
        isToday: ds === todayS,
        evs: allEvents.filter(e => eventActiveOn(e, ds)),
      }
    })

    return (
      <div style={{padding:'16px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(120px,1fr))',gap:'6px',overflowX:'auto'}}>
          {dows.map(d => (
            <div key={d} style={{textAlign:'center',fontSize:'10px',fontWeight:'600',
                                  color:'#5a7080',padding:'4px 0'}}>{d}</div>
          ))}
          {cells.map((cell, i) => (
            <div key={i}
                 onClick={() => cell.date && (setCurDate(new Date(cell.date + 'T00:00:00')), setView('day'))}
                 style={{
                   background:cell.isToday ? 'rgba(78,205,196,.08)' : '#1f344b',
                   border:`1px solid ${cell.isToday ? '#4ecdc4' : '#2a3a4a'}`,
                   borderRadius:'8px', minHeight:'92px', padding:'8px',
                   cursor: cell.date ? 'pointer' : 'default',
                   opacity: cell.other ? 0.4 : 1,
                   transition:'border-color .15s',
                   boxSizing:'border-box',
                 }}>
              <div style={{fontSize:'12px',fontWeight: cell.isToday ? '700' : '500',
                           marginBottom:'4px',
                           color: cell.isToday ? '#4ecdc4' : '#e8eaed'}}>{cell.day}</div>
              {cell.evs?.slice(0,3).map((ev, j) => {
                const color = ev.vendor_color || '#4ECDC4'
                const end = eventEndDate(ev)
                const isRange = end !== ev.date
                const starts = ev.date === cell.date
                const ends = end === cell.date
                const isNotice = ev.type === 'notice'
                const prevCell = cells[i - 1]
                const showRangeTitle = starts || i % 7 === 0 || !prevCell || !eventActiveOn(ev, prevCell.date)
                const label = isNotice
                  ? (showRangeTitle ? ev.prog_name : '')
                  : `${ev.start_time?.slice(0,5)} ${ev.vendor_name}`
                return (
                  <div key={j} onClick={e => { e.stopPropagation(); setPopup({ ev, pos:{ x:e.clientX, y:e.clientY } }) }} style={{
                    fontSize:'10px',
                    height:'18px',
                    lineHeight:'18px',
                    padding:'0 6px',
                    borderRadius: isRange ? (starts ? '4px 0 0 4px' : ends ? '0 4px 4px 0' : '0') : '4px',
                    marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden',
                    textOverflow:'ellipsis', fontWeight:isNotice ? '800' : '500',
                    background: isNotice ? color : color + '22',
                    color: isNotice ? '#0f1923' : color,
                    marginLeft: isRange && !starts ? '-17px' : 0,
                    marginRight: isRange && !ends ? '-17px' : 0,
                    cursor:'pointer',
                    position:'relative',
                    zIndex:isRange ? 3 : 1,
                  }}>{label}</div>
                )
              })}
              {cell.evs?.length > 3 && (
                <div style={{fontSize:'10px',color:'#5a7080',padding:'1px 4px'}}>
                  +{cell.evs.length - 3}개
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── 현재 뷰의 전체 겹침 수 (툴바 배지용)
  const curConflictCount = (() => {
    if (view === 'day') {
      const ds = dateStr(curDate)
      const evs = allEvents.filter(e => eventActiveOn(e, ds) && e.type !== 'pickup')
      return detectConflicts(evs).size
    }
    return 0
  })()

  const visibleEvents = (() => {
    if (view === 'day') {
      const ds = dateStr(curDate)
      return allEvents.filter(e => eventActiveOn(e, ds))
    }
    if (view === 'week') {
      const start = dateStr(getMon(curDate))
      const endDate = new Date(getMon(curDate))
      endDate.setDate(endDate.getDate() + 6)
      const end = dateStr(endDate)
      return allEvents.filter(e => eventOverlapsRange(e, start, end))
    }
    const y = curDate.getFullYear()
    const m = curDate.getMonth()
    const start = `${y}-${String(m+1).padStart(2,'0')}-01`
    const end = `${y}-${String(m+1).padStart(2,'0')}-${String(new Date(y, m+1, 0).getDate()).padStart(2,'0')}`
    return allEvents.filter(e => {
      if (!e.date) return false
      return eventOverlapsRange(e, start, end)
    })
  })()
  const visibleExpCount = visibleEvents.filter(e => e.type !== 'pickup' && e.type !== 'notice').length
  const visiblePickupCount = visibleEvents.filter(e => e.type === 'pickup').length
  const visibleReservationCount = new Set(visibleEvents.map(e => e.reservation_no).filter(Boolean)).size

  if (loading) {
    return <div style={{padding:'60px',textAlign:'center',color:'var(--text-muted)'}}>불러오는 중...</div>
  }

  return (
    <div>
      {/* ── 툴바 */}
      <div style={{background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'12px',
                   padding:'14px 16px',marginBottom:'14px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:'3px',background:'#122132',border:'1px solid #2a3a4a',
                       borderRadius:'8px',padding:'3px'}}>
            {[['day','일'],['week','주'],['month','월']].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)} style={tabBtn(view === v)}>{l}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:'4px'}}>
            {['‹','오늘','›'].map((t, i) => (
              <button key={i} onClick={() => {
                if (t === '오늘') setCurDate(new Date())
                else navigate(t === '‹' ? -1 : 1)
              }} style={{height:'32px',minWidth:t === '오늘' ? '54px' : '34px',padding:'0 12px',
                         background:'#122132',border:'1px solid #2a3a4a',
                         borderRadius:'7px',color:'#8a9ab0',cursor:'pointer',fontSize:'13px',
                         display:'inline-flex',alignItems:'center',justifyContent:'center',
                         fontFamily:'Noto Sans KR, sans-serif'}}>{t}</button>
            ))}
          </div>
          <div style={{fontSize:'15px',fontWeight:'800',color:'#e8eaed',minWidth:'180px'}}>
            {view === 'day'   ? formatDay(curDate)
             : view === 'week' ? `${getMon(curDate).getMonth()+1}월 ${getMon(curDate).getDate()}일 주간`
             : `${curDate.getFullYear()}년 ${curDate.getMonth()+1}월`}
          </div>

          <div style={{marginLeft:'auto',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:'3px',background:'#122132',border:'1px solid #2a3a4a',
                         borderRadius:'8px',padding:'3px'}}>
              {[['all','전체'],['zone','구역별'],['package','패키지별'],['vendor','업체별']].map(([v,l]) => (
                <button key={v} onClick={() => setGroup(v)} style={tabBtn(group === v)}>{l}</button>
              ))}
            </div>
            {curConflictCount > 0 && (
              <div onClick={showConflicts}
                   style={{height:'32px',padding:'0 12px',background:'rgba(51,255,51,0.12)',
                           border:'1px solid rgba(51,255,51,0.25)',borderRadius:'20px',
                           fontSize:'12px',color:'#33ff33',fontWeight:'700',cursor:'pointer',
                           display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                겹침 {Math.floor(curConflictCount/2)}건
              </div>
            )}
            <button onClick={() => openNoticeModal({ date: dateStr(curDate), start_time:'09:00', end_time:'10:00', is_all_day:false })}
                    style={{height:'32px',padding:'0 16px',background:'#4ecdc4',border:'none',
                            borderRadius:'8px',color:'#0f1923',fontSize:'12px',fontWeight:'700',
                            cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif',
                            display:'inline-flex',alignItems:'center',justifyContent:'center'}}>+ 일반 일정</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(120px,1fr))',gap:'10px',
                     marginTop:'12px'}}>
          {[
            ['일정', visibleEvents.length],
            ['체험', visibleExpCount],
            ['픽업', visiblePickupCount],
            ['예약', visibleReservationCount],
          ].map(([label, value]) => (
            <div key={label} style={{background:'#122132',border:'1px solid rgba(78,205,196,.1)',
                                     borderRadius:'8px',padding:'10px 12px'}}>
              <div style={{fontSize:'11px',color:'#8a9ab0',marginBottom:'4px'}}>{label}</div>
              <div style={{fontSize:'18px',fontWeight:'800',color:label === '픽업' ? '#B8B8FF' : '#4ecdc4'}}>
                {value}건
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 구역별 서브탭 */}
      {group === 'zone' && view === 'day' && (
        <div style={{display:'flex',gap:'6px',marginBottom:'10px',flexWrap:'wrap'}}>
          {zones.map(z => {
            const ds = dateStr(curDate)
            const cnt = reservations.filter(r => (r.zone_code || r.zone) === z.code && r.date === ds).length
            return (
              <button key={z.code} onClick={() => setSelZone(z.code)}
                      style={{height:'30px',padding:'0 14px',borderRadius:'7px',cursor:'pointer',
                              fontFamily:'Noto Sans KR, sans-serif',fontSize:'12px',fontWeight:'600',
                              border:'1px solid',
                              background: selZone === z.code ? '#4ecdc4' : '#1a2535',
                              color: selZone === z.code ? '#0f1923' : '#8a9ab0',
                              borderColor: selZone === z.code ? '#4ecdc4' : '#2a3a4a'}}>
                {z.code} · {z.name} <span style={{opacity:.7,fontSize:'11px'}}>({cnt}건)</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── 타임테이블 본문 */}
      <div style={{background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'12px',overflow:'hidden'}}>
        {view === 'day' ? <DayView/> : view === 'week' ? <WeekView/> : <MonthView/>}
      </div>

      <div style={{marginTop:'8px',fontSize:'11px',color:'#5a7080'}}>
        💡 이벤트 클릭 → 상세 보기 · 🟢 같은 구역·업체 겹침 · 🟡 다른 구역 업체 이동 주의
      </div>

      {/* ── 모달 */}
      <NoticeEventModal
        open={modal}
        onClose={() => { setModal(false); setModalDefaults({}); setEditingNotice(null) }}
        onSave={handleSave}
        defaultDate={modalDefaults.date || dateStr(curDate)}
        defaultStartTime={modalDefaults.start_time}
        defaultEndTime={modalDefaults.end_time}
        defaultAllDay={modalDefaults.is_all_day}
        initialNotice={editingNotice}
      />

      {/* ── 이벤트 상세 팝업 */}
      {popup && (
        <EventPopup
          ev={popup.ev} pos={popup.pos}
          onClose={() => setPopup(null)}
          onEdit={openNoticeEditModal}
          onDelete={handleDelete}
          zones={zones}
        />
      )}
    </div>
  )
}
