'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'

// ── 상수
const TT_START = 0
const TT_END   = 24
const HOUR_H   = 52
const TOTAL_H  = (TT_END - TT_START) * HOUR_H
const NOTICE_TYPES = ['일반', '공지', '운영', '전달사항', '휴무', '특일']

function normalizeNoticeType(value) {
  return NOTICE_TYPES.includes(value) ? value : '일반'
}

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
  const eventKeys = new Set()
  let counter = 0

  const activePrograms = pkg => (pkg?.package_programs || [])
    .filter(pp => pp && pp.is_deleted !== true)
    .sort((a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.default_start || '').localeCompare(String(b.default_start || '')) ||
      String(a.id || '').localeCompare(String(b.id || ''))
    )
  const scheduledPrograms = pkg => {
    let dayOffset = 0
    let prevStart = null
    return activePrograms(pkg).map(pp => {
      const start = pp.default_start ? timeToMin(pp.default_start) : null
      if (prevStart !== null && start !== null && start < prevStart) dayOffset += 1
      if (start !== null) prevStart = start
      return { pp, dayOffset }
    })
  }
  const pushEvent = ev => {
    const key = [
      ev.date,
      ev.reservation_no || '',
      ev.type || '',
      ev.vendor_key || '',
      ev.prog_name || '',
      ev.start_time || '',
      ev.end_time || '',
      ev.zone_code || '',
      ev.pkg_name || '',
    ].map(v => String(v)).join('|')
    if (eventKeys.has(key)) return
    eventKeys.add(key)
    events.push(ev)
  }

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
          pushEvent({
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
        scheduledPrograms(pkg).forEach(({ pp, dayOffset }) => {
          if (!pp.default_start || !pp.default_end) return
          if (rowZones.length && pp.zone_code && !rowZones.includes(pp.zone_code)) return
          const vendor = pp.vendors
          pushEvent({
            id: `auto_component_${r.no}_${row.component_uid || row.id || counter++}_${pp.id || pp.prog_name}`,
            date: addDaysStr(r.date, dayOffset),
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
    scheduledPrograms(pkg).forEach(({ pp, dayOffset }) => {
      if (!pp.default_start || !pp.default_end) return
      const vendor = pp.vendors
      pushEvent({
        id: `auto_${r.no}_${counter++}`,
        date: addDaysStr(r.date, dayOffset),
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
    .map(n => {
      const noticeType = normalizeNoticeType(n.notice_type)
      return ({
      id: `notice_${n.id}`,
      notice_id: n.id,
      date: n.date,
      end_date: n.end_date || n.date,
      start_time: (n.is_all_day === true || !n.start_time || !n.end_time) ? '00:00' : n.start_time.slice(0, 5),
      end_time: (n.is_all_day === true || !n.start_time || !n.end_time) ? '24:00' : n.end_time.slice(0, 5),
      type: 'notice',
      vendor_key: 'NOTICE',
      vendor_name: noticeType,
      vendor_color: n.color || '#6E8DFB',
      prog_name: noticeTitle(n),
      pkg_name: 'NOTICE',
      memo: [n.place ? `장소: ${n.place}` : '', n.content || '', n.special ? `특이사항: ${n.special}` : ''].filter(Boolean).join('\n'),
      title: n.title || '',
      content: n.content || '',
      special: n.special || '',
      notice_type: noticeType,
      color: n.color || '#6E8DFB',
      place: n.place || '',
      is_manual: true,
      is_notice: true,
      is_all_day_notice: n.is_all_day === true || !n.start_time || !n.end_time,
    })
  })
}

function dateOnlyNotices(notices = [], date) {
  return notices.filter(n => (
    n && n.is_deleted !== true && n.date &&
    n.date <= date && (n.end_date || n.date) >= date &&
    (n.is_all_day === true || !n.start_time || !n.end_time)
  ))
}

// 겹침 감지: 같은 업체 충돌은 강하게, 다른 일정 간 시간 겹침도 놓치지 않게 표시
function isTimedConflictTarget(ev) {
  return ev && ev.type !== 'pickup' && !isAllDayEvent(ev) && ev.start_time && ev.end_time
}

function eventsOverlapTime(a, b) {
  if (!isTimedConflictTarget(a) || !isTimedConflictTarget(b)) return false
  return timeToMin(a.start_time) < timeToMin(b.end_time) &&
    timeToMin(b.start_time) < timeToMin(a.end_time)
}

function conflictLevel(a, b) {
  const sameVendor = a.vendor_key && b.vendor_key &&
    a.vendor_key !== 'NOTICE' &&
    b.vendor_key !== 'NOTICE' &&
    String(a.vendor_key) === String(b.vendor_key)
  if (!sameVendor) return 'time'
  const za = a.zone_code || ''
  const zb = b.zone_code || ''
  return za && zb && za !== zb ? 'warn' : 'real'
}

function conflictRank(level) {
  return level === 'real' ? 3 : level === 'warn' ? 2 : level === 'time' ? 1 : 0
}

function buildConflictPairs(evs) {
  const pairs = []
  const targets = (evs || []).filter(isTimedConflictTarget)
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j]
      if (a.reservation_no && b.reservation_no && String(a.reservation_no) === String(b.reservation_no)) continue
      if (!eventsOverlapTime(a, b)) continue
      pairs.push({ a, b, level: conflictLevel(a, b) })
    }
  }
  return pairs
}

function detectConflicts(evs) {
  const map = new Map()
  const setLv = (id, lv) => {
    if (!map.has(id) || conflictRank(lv) > conflictRank(map.get(id))) map.set(id, lv)
  }
  buildConflictPairs(evs).forEach(({ a, b, level }) => {
    setLv(a.id, level)
    setLv(b.id, level)
  })
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
          notice_type: normalizeNoticeType(initialNotice.notice_type || initialNotice.vendor_name),
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
  const Required = () => <span style={{ color:'#ff6b6b', marginLeft:'3px' }}>*</span>

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
      content: form.content.trim(),
      notice_type: normalizeNoticeType(form.notice_type),
      special: form.special.trim() || null,
      color: form.color || '#6E8DFB',
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
              placeholder="일정 제목 *"
            />
          </div>
          <div style={{fontSize:'13px',fontWeight:'800',color:'#dce6ef'}}>{dateRangeLabel}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <div>
              <label style={label}>시작일<Required /></label>
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
                {NOTICE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr',gap:'10px',alignItems:'end'}}>
            <label style={{height:'38px',display:'inline-flex',alignItems:'center',gap:'8px',fontSize:'12px',fontWeight:'700',color:'#dce6ef',whiteSpace:'nowrap'}}>
              <input type="checkbox" checked={form.is_all_day} onChange={e => set('is_all_day', e.target.checked)}/>
              종일
            </label>
            <div>
              <label style={label}>시작{!form.is_all_day && <Required />}</label>
              <input type="time" style={input} value={form.start_time} disabled={form.is_all_day} onChange={e => set('start_time', e.target.value)}/>
            </div>
            <div>
              <label style={label}>종료{!form.is_all_day && <Required />}</label>
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
  const [monthReservationDetail, setMonthReservationDetail] = useState(null)
  const [conflictPopup,setConflictPopup]= useState(false)
  const [isMobileTimeline, setIsMobileTimeline] = useState(false)
  const lastConflictsRef = useRef([])
  const dragRef = useRef(null)

  // ── 기준 데이터 로드 (1회)
  useEffect(() => {
    const updateMobileTimeline = () => setIsMobileTimeline(window.innerWidth <= 768)
    updateMobileTimeline()
    window.addEventListener('resize', updateMobileTimeline)
    return () => window.removeEventListener('resize', updateMobileTimeline)
  }, [])

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

  const timeFromHorizontalPointer = (e, el, axisStart = TT_START, axisEnd = TT_END) => {
    const rect = el.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width)
    const raw = axisStart * 60 + (x / Math.max(rect.width, 1)) * (axisEnd - axisStart) * 60
    const snapped = Math.round(raw / 15) * 15
    return Math.min(Math.max(snapped, axisStart * 60), axisEnd * 60)
  }

  const beginHorizontalTimeDrag = (e, date, axisStart, axisEnd) => {
    if (e.button !== 0 || e.target.closest('[data-event-block="true"]')) return
    const startMin = timeFromHorizontalPointer(e, e.currentTarget, axisStart, axisEnd)
    dragRef.current = { date, startMin, currentMin: startMin, horizontal: true, axisStart, axisEnd }
    setDragDraft({ date, startMin, endMin: Math.min(startMin + 15, axisEnd * 60), horizontal: true, axisStart, axisEnd })
  }

  const moveHorizontalTimeDrag = e => {
    if (!dragRef.current?.horizontal) return
    const currentMin = timeFromHorizontalPointer(e, e.currentTarget, dragRef.current.axisStart, dragRef.current.axisEnd)
    dragRef.current.currentMin = currentMin
    const startMin = Math.min(dragRef.current.startMin, currentMin)
    const endMin = Math.max(dragRef.current.startMin, currentMin)
    setDragDraft({ date: dragRef.current.date, startMin, endMin: Math.max(endMin, startMin + 15), horizontal: true, axisStart: dragRef.current.axisStart, axisEnd: dragRef.current.axisEnd })
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

  const HorizontalDragSelection = ({ date }) => {
    if (!dragDraft || dragDraft.date !== date || !dragDraft.horizontal) return null
    const axisStart = dragDraft.axisStart ?? TT_START
    const axisEnd = dragDraft.axisEnd ?? TT_END
    const axisMinutes = Math.max((axisEnd - axisStart) * 60, 60)
    const start = ((dragDraft.startMin - axisStart * 60) / axisMinutes) * 100
    const width = Math.max(((dragDraft.endMin - dragDraft.startMin) / axisMinutes) * 100, 1.2)
    return (
      <div style={{
        position:'absolute', left:`${start}%`, width:`${width}%`, top:'9px', bottom:'9px',
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
    const time = cs.filter(c => c.level === 'time')
    if (time.length) {
      if (msg) msg += '\n\n'
      msg += `시간 겹침 ${time.length}건\n`
      msg += time.map((c, i) =>
        `${i + 1}. ${c.a.start_time?.slice(0,5)}~${c.a.end_time?.slice(0,5)}\n` +
        `   ${c.a.vendor_name || c.a.prog_name || c.a.pkg_name || '-'} / ${c.a.customer || c.a.prog_name || ''}\n` +
        `   ${c.b.vendor_name || c.b.prog_name || c.b.pkg_name || '-'} / ${c.b.customer || c.b.prog_name || ''}`
      ).join('\n\n')
    }
    if (!msg) {
      msg = `시간 겹침 ${cs.length}건\n` + cs.map((c, i) =>
        `${i + 1}. ${c.a.start_time?.slice(0,5)}~${c.a.end_time?.slice(0,5)}\n` +
        `   ${c.a.vendor_name || c.a.prog_name || c.a.pkg_name || '-'} / ${c.a.customer || c.a.prog_name || ''}\n` +
        `   ${c.b.vendor_name || c.b.prog_name || c.b.pkg_name || '-'} / ${c.b.customer || c.b.prog_name || ''}`
      ).join('\n\n')
    }
    alert(msg)
  }

  // ── 공통 스타일 함수
  const tabBtn = active => ({
    height:'32px', minWidth:'42px', padding:'0 12px', borderRadius:'7px', cursor:'pointer',
    fontFamily:'Noto Sans KR, sans-serif', fontSize:'12px', fontWeight:'600',
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--navy2)',
    color: active ? 'var(--navy)' : 'var(--text-secondary)',
    display:'inline-flex', alignItems:'center', justifyContent:'center', textAlign:'center',
    whiteSpace:'nowrap',
    transition:'all .15s',
  })

  // ── 시간축
  const TimeAxis = () => (
    <div style={{width:'56px',flexShrink:0,position:'relative',height:TOTAL_H,background:'var(--navy3)'}}>
      {Array.from({length: TT_END - TT_START}, (_, i) => (
        <div key={i} style={{position:'absolute',top:i*HOUR_H-8,fontSize:'10px',
                              color:'var(--text-muted)',right:'8px',userSelect:'none'}}>
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
            <div style={{position:'absolute',left:0,right:0,top:i*HOUR_H,borderTop:'1px solid var(--border2)'}}/>
            {[1,2,3].map(q => (
              <div key={q} style={{position:'absolute',left:0,right:0,
                                   top:i*HOUR_H+q*HOUR_H/4,borderTop:'1px dashed var(--border2)'}}/>
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
    const conflictColor = level === 'real' ? '#ff6b6b' : level === 'warn' ? '#F7C948' : level === 'time' ? '#ff9f43' : color
    const conflictLabel = level === 'real' ? '겹침' : level === 'warn' ? '이동주의' : level === 'time' ? '시간겹침' : ''
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
                   border: level ? `2px solid ${conflictColor}` : `1px solid ${color}44`,
                   borderLeft:`3px solid ${conflictColor}`,
                   borderRadius:'7px',padding: isCompact ? '3px 6px' : '5px 7px',cursor:'pointer',overflow:'hidden',
                   boxSizing:'border-box',boxShadow:'0 6px 18px rgba(0,0,0,.18)'}}>
        {level && (
          <div style={{position:'absolute',right:'5px',top:'4px',height:'16px',padding:'0 5px',
                       borderRadius:'999px',background:conflictColor,color:'#0f1923',
                       fontSize:'9px',fontWeight:'900',lineHeight:'16px'}}>
            {conflictLabel}
          </div>
        )}
        {isCompact ? (
          <>
            <div style={{fontWeight:'700',fontSize:'10px',lineHeight:'11px',color:conflictColor,
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
            <div style={{fontWeight:'700',fontSize:'11px',color:conflictColor,
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

  const eventTitle = ev => {
    if (ev.type === 'pickup') return ev.prog_name || ev.vendor_name || '픽업'
    if (ev.type === 'notice') return ev.prog_name || ev.title || 'NOTICE'
    return ev.prog_name || ev.pkg_name || ev.vendor_name || '체험'
  }

  const eventSubTitle = ev => {
    const parts = []
    if (ev.vendor_name && ev.type !== 'pickup' && ev.type !== 'notice') parts.push(ev.vendor_name)
    if (ev.customer && (ev.type === 'pickup' || ev.type === 'notice')) parts.push(`${ev.customer}${ev.pax ? ` ${ev.pax}명` : ''}`)
    return parts.join(' · ')
  }

  const packHorizontalRows = events => {
    const packed = []
    ;(events || [])
      .slice()
      .sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time))
      .forEach(ev => {
        let rowIdx = packed.findIndex(row => row.every(other => timeToMin(other.end_time) <= timeToMin(ev.start_time) || timeToMin(ev.end_time) <= timeToMin(other.start_time)))
        if (rowIdx < 0) {
          packed.push([])
          rowIdx = packed.length - 1
        }
        packed[rowIdx].push(ev)
        ev._laneRow = rowIdx
      })
    return Math.max(packed.length, 1)
  }

  const HorizontalEventBlock = ({ ev, conflictMap, axisStart, axisEnd }) => {
    const axisMinutes = Math.max((axisEnd - axisStart) * 60, 60)
    const start = ((timeToMin(ev.start_time) - axisStart * 60) / axisMinutes) * 100
    const width = Math.max(((timeToMin(ev.end_time) - timeToMin(ev.start_time)) / axisMinutes) * 100, 4)
    const color = ev.vendor_color || (ev.type === 'pickup' ? '#B8B8FF' : ev.type === 'notice' ? '#F7C948' : '#4ECDC4')
    const level = conflictMap?.get(ev.id)
    const borderColor = level ? '#33FF66' : color
    const rowTop = 10 + (ev._laneRow || 0) * 34
    const timeText = `${ev.start_time?.slice(0,5)}~${ev.end_time?.slice(0,5)}`

    return (
      <button
        type="button"
        data-event-block="true"
        onClick={e => {
          e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          setPopup({ ev, pos: { x: Math.min(rect.right + 4, window.innerWidth - 320), y: rect.top } })
        }}
        style={{
          position:'absolute',
          left:`${start}%`,
          width:`${width}%`,
          top:rowTop,
          height:'28px',
          minWidth:'12px',
          padding:0,
          border:`${level ? 2 : 1}px solid ${borderColor}`,
          borderLeft:`${level ? 3 : 1}px solid ${borderColor}`,
          borderRadius:'6px',
          background: color,
          color:'transparent',
          boxShadow: level ? '0 0 0 1px rgba(51,255,102,.28), 0 0 16px rgba(51,255,102,.12)' : '0 6px 18px rgba(0,0,0,.16)',
          cursor:'pointer',
          overflow:'hidden',
          textAlign:'center',
          fontFamily:'Noto Sans KR, sans-serif',
          zIndex: level ? 5 : 3,
        }}
        title={`${eventTitle(ev)} · ${timeText}`}
      >
        <span style={{display:'block',fontSize:'11px',fontWeight:'800',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:'14px'}}>
          {''}
        </span>
        <span style={{display:'block',fontSize:'9px',opacity:.82,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:'11px',color:'var(--text-primary)'}}>
          {''}
        </span>
      </button>
    )
  }

  const HorizontalTimeline = ({ sections, conflictMap, emptyText }) => {
    const hasRows = sections.some(section => section.rows?.length)
    const flatEvents = sections.flatMap(section => section.rows || []).flatMap(row => row.events || [])
    const timedMinutes = flatEvents
      .filter(ev => ev.start_time && ev.end_time)
      .flatMap(ev => [timeToMin(ev.start_time), timeToMin(ev.end_time)])
    const minMinute = timedMinutes.length ? Math.min(...timedMinutes) : 8 * 60
    const maxMinute = timedMinutes.length ? Math.max(...timedMinutes) : 18 * 60
    const eventStartHour = Math.max(0, Math.floor(minMinute / 60))
    const eventEndHour = Math.min(24, Math.ceil(maxMinute / 60))
    const axisStart = isMobileTimeline && timedMinutes.length
      ? eventStartHour
      : Math.max(0, Math.min(8, eventStartHour - 1))
    const axisEnd = isMobileTimeline && timedMinutes.length
      ? Math.min(24, Math.max(axisStart + 1, eventEndHour))
      : Math.min(24, Math.max(18, eventEndHour + 1))
    const hours = Array.from({ length: axisEnd - axisStart + 1 }, (_, i) => axisStart + i)
    const hourIntervals = Math.max(axisEnd - axisStart, 1)
    const timelineGridColumns = isMobileTimeline ? '58px minmax(0, 1fr)' : '170px 1fr'
    const timelineMinWidth = isMobileTimeline ? '100%' : '1120px'
    const timelineHeaderHeight = isMobileTimeline ? '26px' : '42px'
    const labelTransform = (h) => {
      if (!isMobileTimeline) {
        return h === axisStart ? 'translate(6px,0)' : h === axisEnd ? 'translate(calc(-100% - 6px),0)' : 'translate(5px,0)'
      }
      if (h === axisStart) return 'translate(0,0)'
      if (h === axisEnd) return 'translate(-100%,0)'
      return 'translate(-50%,0)'
    }
    if (!hasRows) {
      return <div style={{padding:'22px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>{emptyText || '표시할 일정이 없습니다'}</div>
    }

    return (
      <div style={{overflowX:'auto'}}>
        <div style={{minWidth:timelineMinWidth}}>
          <div style={{display:'grid',gridTemplateColumns:timelineGridColumns,borderBottom:'1px solid var(--border2)',background:'var(--navy3)'}}>
            <div style={{padding:isMobileTimeline ? '6px 6px' : '12px 14px',fontSize:'11px',fontWeight:'800',color:'var(--text-primary)',background:'var(--navy3)',textAlign:isMobileTimeline ? 'center' : 'left',lineHeight:isMobileTimeline ? '14px' : 'normal'}}>구분</div>
            <div style={{position:'relative',height:timelineHeaderHeight,background:'var(--navy3)'}}>
              {Array.from({ length: hourIntervals + 1 }, (_, i) => (
                <div key={`line-${i}`} style={{position:'absolute',left:`${(i / hourIntervals) * 100}%`,top:0,bottom:0,borderLeft:'1px solid var(--border2)'}} />
              ))}
              {hours.map(h => (
                <div
                  key={h}
                  style={{
                    position:'absolute',
                    left:`${((h - axisStart) / hourIntervals) * 100}%`,
                    top:isMobileTimeline ? '5px' : '7px',
                    transform:labelTransform(h),
                    fontSize:isMobileTimeline ? '10px' : '11px',
                    fontWeight:'800',
                    color:'var(--text-muted)',
                    lineHeight:1,
                    padding:'0 2px',
                    background:isMobileTimeline ? 'transparent' : 'var(--navy3)',
                    pointerEvents:'none',
                  }}
                >
                  {String(h).padStart(2,'0')}
                </div>
              ))}
            </div>
          </div>

          {sections.map(section => section.rows?.length ? (
            <div key={section.key}>
              <div style={{display:'grid',gridTemplateColumns:timelineGridColumns,borderBottom:'1px solid var(--border2)',background:'var(--sidebar-soft)'}}>
                <div style={{padding:isMobileTimeline ? '6px 5px' : '9px 14px',fontSize:isMobileTimeline ? '10px' : '12px',fontWeight:'900',color:section.color || '#4ecdc4',textAlign:isMobileTimeline ? 'center' : 'left',lineHeight:isMobileTimeline ? '13px' : 'normal'}}>{section.title}</div>
                <div style={{padding:isMobileTimeline ? '6px 8px' : '9px 12px',fontSize:isMobileTimeline ? '10px' : '11px',color:'var(--text-muted)',lineHeight:isMobileTimeline ? '13px' : 'normal'}}>{section.subtitle}</div>
              </div>
              {section.rows.map(row => {
                const rowEvents = row.events || []
                const packedHeight = packHorizontalRows(rowEvents)
                const rowHeight = Math.max(56, 20 + packedHeight * 34)
                return (
                  <div key={row.key} style={{display:'grid',gridTemplateColumns:timelineGridColumns,minHeight:rowHeight,borderBottom:'1px solid var(--border2)'}}>
                    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:'2px',padding:isMobileTimeline ? '8px 5px' : '10px 14px',background:'var(--sidebar-soft)',minWidth:0}}>
                      <div style={{fontSize:'12px',fontWeight:'800',color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.title}</div>
                      {row.subtitle && <div style={{fontSize:'10px',color:'var(--text-muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.subtitle}</div>}
                    </div>
                    <div
                      onMouseDown={e => beginHorizontalTimeDrag(e, row.date, axisStart, axisEnd)}
                      onMouseMove={moveHorizontalTimeDrag}
                      onMouseUp={endTimeDrag}
                      onMouseLeave={() => { dragRef.current = null; setDragDraft(null) }}
                      style={{
                        position:'relative',
                        minHeight:rowHeight,
                        cursor:'crosshair',
                        background:`repeating-linear-gradient(to right, transparent 0, transparent calc(${100 / Math.max(axisEnd - axisStart, 1)}% - 1px), var(--border2) calc(${100 / Math.max(axisEnd - axisStart, 1)}% - 1px), var(--border2) ${100 / Math.max(axisEnd - axisStart, 1)}%)`,
                      }}
                    >
                      <HorizontalDragSelection date={row.date}/>
                      {rowEvents.map(ev => <HorizontalEventBlock key={ev.id} ev={ev} conflictMap={conflictMap} axisStart={axisStart} axisEnd={axisEnd}/>)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null)}
        </div>
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
      <div style={{display:'flex',borderBottom:'1px solid var(--border2)',background:'var(--navy3)'}}>
        <div style={{width:'56px',flexShrink:0,padding:'7px 8px 7px 0',fontSize:'10px',fontWeight:'800',color:'var(--text-muted)',boxSizing:'border-box',textAlign:'right'}}>종일</div>
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
      <div style={{display:'flex',borderBottom:'1px solid var(--border2)',background:'var(--navy3)'}}>
        <div style={{width:'56px',flexShrink:0,padding:'7px 8px 7px 0',fontSize:'10px',fontWeight:'800',color:'var(--text-muted)',boxSizing:'border-box',textAlign:'right'}}>종일</div>
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
    const expEvs    = timedEvs.filter(e => e.type !== 'pickup' && e.type !== 'notice')
    const pickupEvs = timedEvs.filter(e => e.type === 'pickup')
    const noticeEvs = timedEvs.filter(e => e.type === 'notice')

    // 겹침 감지 (expEvs 기준)
    const conflictMap = detectConflicts(expEvs)

    // lastConflicts 업데이트
    const cs = buildConflictPairs(expEvs)
    lastConflictsRef.current = cs
    const realCnt = cs.filter(c => c.level === 'real').length
    const warnCnt = cs.filter(c => c.level === 'warn').length
    const timeCnt = cs.filter(c => c.level === 'time').length
    const totalConflict = realCnt + warnCnt + timeCnt

    const zoneLabel = (code) => {
      if (!code) return '구역 미지정'
      const zone = zones.find(z => z.code === code)
      return zone ? `${zone.code} · ${zone.name}` : code
    }
    const reservationLabel = (no) => {
      const r = reservations.find(x => String(x.no) === String(no))
      return r ? `NO.${no} · ${r.customer || ''}` : `NO.${no}`
    }
    const reservationSubtitle = (no, evs) => {
      const r = reservations.find(x => String(x.no) === String(no))
      const packageName = r?.package_name || r?.pkg || ''
      const zoneCode = r?.zone_code || r?.zone || evs[0]?.zone_code || ''
      const zone = zones.find(z => z.code === zoneCode)
      return [zone ? `${zone.code} · ${zone.name}` : '', packageName, r?.pax ? `${r.pax}명` : '', `${evs.length}개 일정`].filter(Boolean).join(' · ')
    }

    let rows = []
    if (group === 'all') {
      rows = expEvs.length ? [{
        key: 'all',
        title: '전체 체험 흐름',
        subtitle: `체험 ${expEvs.length}개 일정`,
        date: ds,
        events: expEvs,
      }] : []
    } else if (group === 'zone') {
      const zoneCodes = [...new Set(expEvs.map(e => e.zone_code || ''))]
      rows = zoneCodes.map(code => {
        const evs = expEvs.filter(e => (e.zone_code || '') === code)
        return {
          key: `zone_${code || 'none'}`,
          title: zoneLabel(code),
          subtitle: `${evs.length}개 일정`,
          date: ds,
          events: evs,
        }
      })
    } else if (group === 'package') {
      const resNos = [...new Set(expEvs.map(e => e.reservation_no).filter(Boolean))]
      rows = resNos.map(no => {
        const evs = expEvs.filter(e => String(e.reservation_no) === String(no))
        return {
          key: no,
          title: reservationLabel(no),
          subtitle: reservationSubtitle(no, evs),
          date: ds,
          events: evs,
        }
      })
      const noRes = expEvs.filter(e => !e.reservation_no)
      if (noRes.length) rows.push({ key:'unlinked', title:'기타', subtitle:'예약 미연결 일정', date:ds, events:noRes })
    } else if (group === 'vendor') {
      const vkeys = [...new Set(expEvs.map(e => e.vendor_key).filter(Boolean))]
      rows = vkeys.map(k => {
        const v = vendors.find(x => x.key === k)
        const evs = expEvs.filter(e => e.vendor_key === k)
        return {
          key: k,
          title: v?.name || k,
          subtitle: `${evs.length}건`,
          date: ds,
          events: evs,
        }
      })
      const noVendor = expEvs.filter(e => !e.vendor_key)
      if (noVendor.length) rows.push({ key:'vendor_none', title:'업체 미지정', subtitle:`${noVendor.length}건`, date:ds, events:noVendor })
    }

    const groupTitle = group === 'all' ? '전체 체험 흐름'
      : group === 'zone' ? '구역별 체험 일정'
      : group === 'vendor' ? '업체별 체험 일정'
      : '예약별 체험 일정'
    const groupUnit = group === 'all' ? '흐름'
      : group === 'zone' ? '구역'
      : group === 'vendor' ? '업체'
      : '예약'
    const rowEventCount = rows.reduce((sum, row) => sum + row.events.length, 0)
    const sections = [
      {
        key: 'experience',
        title: groupTitle,
        subtitle: `${groupUnit} ${rows.length}건 · 일정 ${rowEventCount}개`,
        color: '#4ECDC4',
        rows,
      },
      {
        key: 'pickup',
        title: '픽업/드랍',
        subtitle: `${pickupEvs.length}건`,
        color: '#B8B8FF',
        rows: pickupEvs.length ? [{ key:'pickup', title:'픽업/드랍', subtitle:`${pickupEvs.length}건`, date:ds, events:pickupEvs }] : [],
      },
      {
        key: 'notice',
        title: 'NOTICE',
        subtitle: `${noticeEvs.length}건`,
        color: '#F7C948',
        rows: noticeEvs.length ? [{ key:'notice', title:'NOTICE', subtitle:'시간 지정 일정', date:ds, events:noticeEvs }] : [],
      },
    ]

    return (
      <div>
        <AllDayLane dates={[ds]}/>
        {totalConflict > 0 && (
          <div onClick={showConflicts}
               style={{margin:'0 0 0 0',padding:'8px 16px',cursor:'pointer',
                       background:'rgba(51,255,102,0.08)',
                       borderBottom:'1px solid',
                       borderColor:'rgba(51,255,102,0.24)',
                       fontSize:'12px',fontWeight:'700',
                       color:'#33FF66'}}>
            시간/장소 겹침 {totalConflict}건 클릭하여 확인
          </div>
        )}
        <HorizontalTimeline sections={sections} conflictMap={conflictMap} emptyText="이 날짜의 일정이 없습니다"/>
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
    const weekConflictMap = new Map()
    days.forEach(d => {
      const ds = dateStr(d)
      const evs = allEvents.filter(e => eventActiveOn(e, ds) && e.type !== 'pickup' && e.type !== 'notice' && !isAllDayEvent(e))
      detectConflicts(evs).forEach((value, key) => weekConflictMap.set(key, value))
    })
    const weekEvents = allEvents.filter(e => dateList.some(ds => eventActiveOn(e, ds)) && !isAllDayEvent(e))
    const weekExpEvents = weekEvents.filter(e => e.type !== 'pickup' && e.type !== 'notice')
    const makeGroupedRows = (items, keyFn, titleFn, subtitleFn, emptyTitle) => {
      const keys = [...new Set(items.map(keyFn))]
      return keys.map(key => {
        const evs = items.filter(e => keyFn(e) === key)
        return {
          key: key || 'none',
          title: titleFn(key, evs) || emptyTitle,
          subtitle: subtitleFn(key, evs),
          date: evs[0]?.date || dateList[0],
          events: evs,
        }
      })
    }
    const weekRows = (() => {
      if (group === 'all') {
        return days.map((d, i) => {
          const ds = dateStr(d)
          const evs = allEvents.filter(e => eventActiveOn(e, ds) && !isAllDayEvent(e))
          const expCount = evs.filter(e => e.type !== 'pickup' && e.type !== 'notice').length
          const pickupCount = evs.filter(e => e.type === 'pickup').length
          const noticeCount = evs.filter(e => e.type === 'notice').length
          return {
            key: ds,
            title: `${dayNames[i]} · ${d.getDate()}일`,
            subtitle: [`체험 ${expCount}건`, pickupCount ? `픽업 ${pickupCount}건` : '', noticeCount ? `NOTICE ${noticeCount}건` : ''].filter(Boolean).join(' · '),
            date: ds,
            events: evs,
          }
        })
      }
      if (group === 'zone') {
        return makeGroupedRows(
          weekExpEvents,
          e => e.zone_code || '',
          key => {
            if (!key) return '구역 미지정'
            const zone = zones.find(z => z.code === key)
            return zone ? `${zone.code} · ${zone.name}` : key
          },
          (key, evs) => `체험 ${evs.length}건`,
          '구역 미지정'
        )
      }
      if (group === 'package') {
        return makeGroupedRows(
          weekExpEvents,
          e => e.reservation_no ? String(e.reservation_no) : '',
          key => {
            if (!key) return '예약 미연결'
            const r = reservations.find(x => String(x.no) === String(key))
            return r ? `NO.${key} · ${r.customer || ''}` : `NO.${key}`
          },
          (key, evs) => {
            const r = reservations.find(x => String(x.no) === String(key))
            return [r?.pax ? `${r.pax}명` : '', `체험 ${evs.length}건`].filter(Boolean).join(' · ')
          },
          '예약 미연결'
        )
      }
      return makeGroupedRows(
        weekExpEvents,
        e => e.vendor_key || '',
        key => {
          if (!key) return '업체 미지정'
          const v = vendors.find(x => x.key === key)
          return v?.name || key
        },
        (key, evs) => `체험 ${evs.length}건`,
        '업체 미지정'
      )
    })()
    const weekTitle = group === 'all' ? '주간 일정'
      : group === 'zone' ? '구역별 주간 일정'
      : group === 'vendor' ? '업체별 주간 일정'
      : '예약별 주간 일정'
    const weekSubtitle = group === 'all' ? '요일별 시간 흐름' : `${weekRows.length}개 그룹 · 체험 ${weekExpEvents.length}건`

    return (
      <div>
        <div style={{display:'flex',borderBottom:'1px solid var(--border2)',background:'var(--navy3)',overflowX:'auto'}}>
          {days.map((d, i) => {
            const ds = dateStr(d)
            const isT = ds === todayS
            const cnt = allEvents.filter(e => eventActiveOn(e, ds)).length
            return (
              <div key={i} onClick={() => { setCurDate(d); setView('day') }}
                   style={{flex:1,minWidth:'120px',padding:'11px 0',textAlign:'center',
                           borderRight:'1px solid var(--border2)',cursor:'pointer',
                           background:isT?'var(--soft-bg)':'var(--navy2)',
                           borderTop: isT ? '3px solid #4ecdc4' : '3px solid transparent'}}>
                <div style={{fontSize:'11px',color:isT?'var(--accent)':'var(--text-muted)'}}>{dayNames[i]}</div>
                <div style={{fontSize:'16px',fontWeight:'700',
                             color:isT?'var(--accent)':'var(--text-primary)',marginTop:'2px'}}>{d.getDate()}</div>
                {cnt > 0 && <div style={{fontSize:'10px',color:'var(--accent)',marginTop:'2px'}}>{cnt}건</div>}
              </div>
            )
          })}
        </div>
        <AllDayLane dates={dateList}/>
        <HorizontalTimeline
          sections={[{
            key:'week',
            title:weekTitle,
            subtitle:weekSubtitle,
            color:'#4ECDC4',
            rows:weekRows,
          }]}
          conflictMap={weekConflictMap}
          emptyText="이 주간의 일정이 없습니다"
        />
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

    const reservationRangeMap = (() => {
      const map = new Map()
      allEvents.filter(ev => ev.reservation_no).forEach(ev => {
        const key = String(ev.reservation_no)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(ev)
      })
      return map
    })()

    const inDateRange = (date, start, end) => date >= start && date <= end
    const showReservationBars = group === 'all' || group === 'zone' || group === 'package'
    const reservationRanges = [...reservationRangeMap.entries()].map(([no, allItemEvents]) => {
      const dates = allItemEvents.map(ev => ev.date).filter(Boolean)
      const startDate = dates.length ? dates.reduce((a, b) => a < b ? a : b) : ''
      const endDate = dates.length ? dates.reduce((a, b) => a > b ? a : b) : startDate
      const r = reservations.find(x => String(x.no) === String(no))
      const expCount = allItemEvents.filter(e => e.type !== 'pickup' && e.type !== 'notice').length
      const pickupCount = allItemEvents.filter(e => e.type === 'pickup').length
      return {
        key: `res_${no}`,
        type: 'reservation',
        no,
        startDate,
        endDate,
        title: r?.customer || allItemEvents[0]?.customer || `NO.${no}`,
        subtitle: [`NO.${no}`, r?.pax ? `${r.pax}명` : (allItemEvents[0]?.pax ? `${allItemEvents[0].pax}명` : ''), expCount ? `체험 ${expCount}` : '', pickupCount ? `픽업 ${pickupCount}` : ''].filter(Boolean).join(' · '),
        reservation: r,
        events: allItemEvents,
      }
    }).filter(item => item.startDate && item.endDate)

    const reservationBarsByWeek = Array.from({ length: 6 }, (_, weekIdx) => {
      const weekStartIdx = weekIdx * 7
      const weekEndIdx = weekStartIdx + 6
      const weekStartDate = cells[weekStartIdx]?.date
      const weekEndDate = cells[weekEndIdx]?.date
      return reservationRanges
        .filter(item => item.startDate <= weekEndDate && item.endDate >= weekStartDate)
        .map(item => {
          const startIdx = Math.max(weekStartIdx, cells.findIndex(c => c.date === item.startDate))
          const rawEndIdx = cells.findIndex(c => c.date === item.endDate)
          const endIdx = Math.min(weekEndIdx, rawEndIdx >= 0 ? rawEndIdx : weekEndIdx)
          const leftDay = startIdx - weekStartIdx
          const spanDays = Math.max(endIdx - startIdx + 1, 1)
          return {
            ...item,
            left: `${(leftDay / 7) * 100}%`,
            width: `${(spanDays / 7) * 100}%`,
            continuesBefore: item.startDate < cells[startIdx]?.date,
            continuesAfter: item.endDate > cells[endIdx]?.date,
          }
        })
    })

    const buildMonthItems = (cell, cellIndex) => {
      const evs = cell.evs || []
      if (group === 'all' || group === 'zone' || group === 'package') {
        const noticeItems = evs
          .filter(ev => ev.type === 'notice' && !ev.reservation_no)
          .map(ev => ({ key: ev.id, type: 'notice', event: ev, title: ev.prog_name || ev.title || 'NOTICE', subtitle: ev.vendor_name || 'NOTICE' }))
        return noticeItems
      }
      return evs.map(ev => ({
        key: ev.id,
        type: 'event',
        event: ev,
        title: eventTitle(ev),
        subtitle: eventSubTitle(ev) || `${ev.start_time?.slice(0,5)}~${ev.end_time?.slice(0,5)}`,
      }))
    }

    const monthAgendaDays = cells
      .filter(cell => !cell.other)
      .map(cell => {
        const dayReservations = reservationRanges.filter(item => inDateRange(cell.date, item.startDate, item.endDate))
        const dayEvents = (cell.evs || []).filter(ev => !ev.reservation_no)
        const eventItems = group === 'vendor'
          ? (cell.evs || []).map(ev => ({ key: ev.id, type: 'event', event: ev, title: eventTitle(ev), subtitle: eventSubTitle(ev) || `${ev.start_time?.slice(0,5)}~${ev.end_time?.slice(0,5)}` }))
          : dayEvents.map(ev => ({ key: ev.id, type: ev.type === 'notice' ? 'notice' : 'event', event: ev, title: ev.prog_name || ev.title || eventTitle(ev), subtitle: ev.vendor_name || eventSubTitle(ev) || '일정' }))
        const reservationItems = group === 'vendor' ? [] : dayReservations.map(item => ({
          key: item.key,
          type: 'reservation',
          item,
          title: item.title,
          subtitle: item.subtitle,
        }))
        return {
          ...cell,
          items: [...reservationItems, ...eventItems],
        }
      })
      .filter(cell => cell.items.length > 0)
    return (
      <div style={{padding:'16px'}}>
        <div className="timetable-month-mobile">
          {monthAgendaDays.length === 0 ? (
            <div className="timetable-month-empty">이번 달 일정이 없습니다.</div>
          ) : monthAgendaDays.map(cell => (
            <section key={cell.date} className="timetable-month-day-card">
              <button
                type="button"
                className="timetable-month-day-head"
                onClick={() => { setCurDate(new Date(cell.date + 'T00:00:00')); setView('day') }}
              >
                <span>{cell.day}일</span>
                <strong>{cell.items.length}건</strong>
              </button>
              <div className="timetable-month-day-items">
                {cell.items.slice(0, 6).map((entry, idx) => {
                  const color = entry.type === 'notice' ? (entry.event?.vendor_color || '#F7C948') : entry.type === 'reservation' ? '#4ECDC4' : (entry.event?.vendor_color || '#4ECDC4')
                  return (
                    <button
                      key={`${entry.key}-${idx}`}
                      type="button"
                      className="timetable-month-agenda-item"
                      style={{ borderColor: color, color }}
                      onClick={e => {
                        e.stopPropagation()
                        if (entry.type === 'reservation') {
                          setMonthReservationDetail({ date: cell.date, item: entry.item })
                          return
                        }
                        if (entry.event) setPopup({ ev: entry.event, pos:{ x:e.clientX, y:e.clientY } })
                      }}
                    >
                      <span>{entry.title}</span>
                      <small>{entry.subtitle}</small>
                    </button>
                  )
                })}
                {cell.items.length > 6 && <div className="timetable-month-more">+{cell.items.length - 6}건 더 있음</div>}
              </div>
            </section>
          ))}
        </div>        <div className="timetable-month-desktop" style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(120px,1fr))',gap:'6px',overflowX:'auto',position:'relative'}}>
          {dows.map(d => (
            <div key={d} style={{textAlign:'center',fontSize:'10px',fontWeight:'600',
                                  color:'var(--text-muted)',padding:'4px 0'}}>{d}</div>
          ))}
          {cells.map((cell, i) => {
            const monthItems = buildMonthItems(cell, i)
            const weekIdx = Math.floor(i / 7)
            return (
            <div key={i}
                 onClick={() => cell.date && (setCurDate(new Date(cell.date + 'T00:00:00')), setView('day'))}
                 style={{
                   background:cell.isToday ? 'var(--soft-bg)' : 'var(--navy2)',
                   border:`1px solid ${cell.isToday ? 'var(--accent)' : 'var(--border2)'}`,
                   borderRadius:'8px', minHeight:'92px', padding:'8px', paddingTop: showReservationBars ? '60px' : '8px',
                   cursor: cell.date ? 'pointer' : 'default',
                   opacity: cell.other ? 0.4 : 1,
                   transition:'border-color .15s',
                   boxSizing:'border-box',
                   gridRow: weekIdx + 2,
                   gridColumn: (i % 7) + 1,
                   position:'relative',
                  }}>
              <div style={{fontSize:'12px',fontWeight: cell.isToday ? '700' : '500',
                           marginBottom:'4px', position: showReservationBars ? 'absolute' : 'static', top:'8px', left:'8px',
                           color: cell.isToday ? 'var(--accent)' : 'var(--text-primary)'}}>{cell.day}</div>
              {monthItems.slice(0,3).map((item, j) => {
                const color = item.type === 'notice' ? (item.event?.vendor_color || '#F7C948') : '#4ECDC4'
                const rangeStyle = item.type === 'reservation' && item.isRange
                  ? {
                      borderRadius: item.isStart && item.isEnd ? '4px' : item.isStart ? '4px 0 0 4px' : item.isEnd ? '0 4px 4px 0' : '0',
                      marginLeft: item.isStart ? 0 : '-9px',
                      marginRight: item.isEnd ? 0 : '-9px',
                      borderLeft: item.isStart ? `3px solid ${color}` : '0',
                      borderRight: item.isEnd ? `1px solid ${color}44` : '0',
                    }
                  : {}
                return (
                  <div key={item.key || j} onClick={e => {
                    e.stopPropagation()
                    if (item.type === 'reservation') {
                      setMonthReservationDetail({ date: cell.date, item })
                      return
                    }
                    const ev = item.event
                    if (ev) setPopup({ ev, pos:{ x:e.clientX, y:e.clientY } })
                  }} style={{
                    fontSize:'10px',
                    minHeight:'20px',
                    lineHeight:'13px',
                    padding:'0 6px',
                    borderRadius:'4px',
                    marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden',
                    textOverflow:'ellipsis', fontWeight:'800',
                    background: item.type === 'notice' ? color : color + '22',
                    color: item.type === 'notice' ? '#0f1923' : color,
                    cursor:'pointer',
                    position:'relative',
                    zIndex:item.isRange ? 3 : 1,
                    ...rangeStyle,
                  }}>
                    <div style={{overflow:'hidden',textOverflow:'ellipsis'}}>{item.showTitle === false ? '↳ 계속' : item.title}</div>
                    <div style={{fontSize:'9px',fontWeight:'500',color:item.type === 'notice' ? '#0f1923' : '#8a9ab0',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {item.isRange && item.showTitle === false ? `${item.startDate?.slice(5)}~${item.endDate?.slice(5)}` : item.subtitle}
                    </div>
                  </div>
                )
              })}
              {monthItems.length > 3 && (
                <div style={{fontSize:'10px',color:'var(--text-muted)',padding:'1px 4px'}}>
                  +{monthItems.length - 3}개
                </div>
              )}
            </div>
          )})}
          {showReservationBars && reservationBarsByWeek.map((bars, weekIdx) => (
            <div key={`bars-${weekIdx}`} style={{
              gridColumn:'1 / 8',
              gridRow:weekIdx + 2,
              position:'relative',
              pointerEvents:'none',
              alignSelf:'start',
              height:'54px',
              margin:'31px 6px 0',
              zIndex:8,
            }}>
              {bars.slice(0, 2).map((item, idx) => (
                <button
                  key={`${item.key}-${idx}`}
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    setMonthReservationDetail({ date: item.startDate, item })
                  }}
                  style={{
                    position:'absolute',
                    left:item.left,
                    width:item.width,
                    top:idx * 24,
                    height:'22px',
                    padding:'0 10px',
                    border:'1px solid rgba(78,205,196,.35)',
                    borderLeft:item.continuesBefore ? '0' : '3px solid #4ECDC4',
                    borderRight:item.continuesAfter ? '0' : '1px solid rgba(78,205,196,.35)',
                    borderRadius:item.continuesBefore && item.continuesAfter ? '0' : item.continuesBefore ? '0 5px 5px 0' : item.continuesAfter ? '5px 0 0 5px' : '5px',
                    background:'rgba(78,205,196,.22)',
                    color:'#4ECDC4',
                    cursor:'pointer',
                    pointerEvents:'auto',
                    fontFamily:'Noto Sans KR, sans-serif',
                    textAlign:'center',
                    overflow:'hidden',
                    whiteSpace:'nowrap',
                    boxShadow:'0 6px 16px rgba(0,0,0,.14)',
                  }}
                >
                  <span style={{display:'block',fontSize:'10px',fontWeight:'900',lineHeight:'11px',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {item.title}
                  </span>
                  <span style={{display:'block',fontSize:'9px',fontWeight:'500',lineHeight:'10px',color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {item.subtitle}
                  </span>
                </button>
              ))}
              {bars.length > 2 && (
                <div style={{position:'absolute',right:'8px',top:'48px',fontSize:'10px',color:'var(--text-muted)'}}>
                  +{bars.length - 2}개 예약
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
      return buildConflictPairs(evs).length
    }
    if (view === 'week') {
      const start = getMon(curDate)
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const ds = dateStr(d)
        const evs = allEvents.filter(e => eventActiveOn(e, ds) && e.type !== 'pickup')
        return buildConflictPairs(evs).length
      }).reduce((sum, count) => sum + count, 0)
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
    <div className="timetable-page">
      {/* ── 툴바 */}
      <div className="timetable-toolbar-card" style={{background:'var(--navy2)',border:'1px solid var(--border2)',borderRadius:'12px',
                   padding:'14px 16px',marginBottom:'14px'}}>
        <div className="timetable-toolbar-main" style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:'3px',background:'var(--navy3)',border:'1px solid var(--border)',
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
                         background:'var(--navy2)',border:'1px solid var(--border)',
                         borderRadius:'7px',color:'var(--text-secondary)',cursor:'pointer',fontSize:'13px',
                         display:'inline-flex',alignItems:'center',justifyContent:'center',
                         fontFamily:'Noto Sans KR, sans-serif'}}>{t}</button>
            ))}
          </div>
          <div style={{fontSize:'15px',fontWeight:'800',color:'var(--text-primary)',minWidth:'180px'}}>
            {view === 'day'   ? formatDay(curDate)
             : view === 'week' ? `${getMon(curDate).getMonth()+1}월 ${getMon(curDate).getDate()}일 주간`
             : `${curDate.getFullYear()}년 ${curDate.getMonth()+1}월`}
          </div>

          <div className="timetable-scope-actions" style={{marginLeft:'auto',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:'3px',background:'var(--navy3)',border:'1px solid var(--border)',
                         borderRadius:'8px',padding:'3px'}}>
              {[['all','전체'],['zone','구역별'],['package','예약별'],['vendor','업체별']].map(([v,l]) => (
                <button key={v} onClick={() => setGroup(v)} style={tabBtn(group === v)}>{l}</button>
              ))}
            </div>
            {curConflictCount > 0 && (
              <div onClick={showConflicts}
                   style={{height:'32px',padding:'0 12px',background:'rgba(51,255,102,0.1)',
                           border:'1px solid rgba(51,255,102,0.32)',borderRadius:'20px',
                           fontSize:'12px',color:'#33FF66',fontWeight:'700',cursor:'pointer',
                           display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                시간/장소 겹침 {curConflictCount}건
              </div>
            )}
            <button className="timetable-add-manual-btn" onClick={() => openNoticeModal({ date: dateStr(curDate), start_time:'09:00', end_time:'10:00', is_all_day:false })}
                    style={{height:'32px',padding:'0 16px',background:'#d7ff3f',border:'2px solid #111827',
                            borderRadius:'8px',color:'#0f1923',fontSize:'12px',fontWeight:'800',
                            cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif',
                            display:'inline-flex',alignItems:'center',justifyContent:'center'}}>+ 일반 일정</button>
          </div>
        </div>
        <div className="timetable-stat-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(120px,1fr))',gap:'10px',
                     marginTop:'12px'}}>
          {[
            ['일정', visibleEvents.length],
            ['체험', visibleExpCount],
            ['픽업', visiblePickupCount],
            ['예약', visibleReservationCount],
          ].map(([label, value]) => (
            <div key={label} style={{background:'var(--control-bg)',border:'1px solid var(--border2)',
                                     borderRadius:'8px',padding:'10px 12px'}}>
              <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'4px'}}>{label}</div>
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
                              background: selZone === z.code ? 'var(--accent)' : 'var(--navy2)',
                              color: selZone === z.code ? 'var(--navy)' : 'var(--text-secondary)',
                              borderColor: selZone === z.code ? 'var(--accent)' : 'var(--border)'}}>
                {z.code} · {z.name} <span style={{opacity:.7,fontSize:'11px'}}>({cnt}건)</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── 타임테이블 본문 */}
      <div style={{background:'var(--navy2)',border:'1px solid var(--border2)',borderRadius:'12px',overflow:'hidden'}}>
        {view === 'day' ? <DayView/> : view === 'week' ? <WeekView/> : <MonthView/>}
      </div>

      <div style={{marginTop:'8px',fontSize:'11px',color:'var(--text-muted)'}}>
        이벤트 클릭 → 상세 보기 · 형광연두 테두리 → 시간/장소 겹침 · 빈 시간 영역 드래그 → 일반 일정 등록
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

      {monthReservationDetail && (
        <div style={{position:'fixed',inset:0,zIndex:900,background:'rgba(0,0,0,.35)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}
             onClick={() => setMonthReservationDetail(null)}>
          <div style={{width:'min(520px,100%)',maxHeight:'80vh',overflow:'hidden',background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'12px',boxShadow:'0 18px 50px rgba(0,0,0,.45)'}}
               onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 18px',borderBottom:'1px solid #2a3a4a'}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:'900',color:'#e8eaed'}}>
                  {monthReservationDetail.item.title}
                </div>
                <div style={{fontSize:'12px',color:'#8a9ab0',marginTop:'3px'}}>
                  {monthReservationDetail.date} · {monthReservationDetail.item.subtitle}
                </div>
              </div>
              <button onClick={() => setMonthReservationDetail(null)}
                      style={{width:'30px',height:'30px',border:'1px solid #2a3a4a',borderRadius:'7px',background:'transparent',color:'#8a9ab0',cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:'12px 18px',maxHeight:'56vh',overflowY:'auto'}}>
              {(monthReservationDetail.item.events || [])
                .slice()
                .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
                .map((ev, idx) => {
                  const color = ev.vendor_color || (ev.type === 'pickup' ? '#B8B8FF' : '#4ECDC4')
                  const timeText = ev.is_all_day_notice ? '종일' : `${ev.start_time?.slice(0,5) || '-'} ~ ${ev.end_time?.slice(0,5) || '-'}`
                  return (
                    <button key={`${ev.id}-${idx}`} type="button"
                            onClick={e => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setMonthReservationDetail(null)
                              setPopup({ ev, pos:{ x: Math.min(rect.right + 4, window.innerWidth - 320), y: rect.top } })
                            }}
                            style={{width:'100%',display:'grid',gridTemplateColumns:'82px minmax(0,1fr)',gap:'10px',alignItems:'center',padding:'10px 0',border:'0',borderBottom:'1px solid rgba(78,205,196,.08)',background:'transparent',cursor:'pointer',textAlign:'left',fontFamily:'Noto Sans KR, sans-serif'}}>
                      <div style={{fontSize:'11px',fontWeight:'800',color,whiteSpace:'nowrap'}}>{timeText}</div>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:'900',color:'#e8eaed',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          {eventTitle(ev)}
                        </div>
                        <div style={{fontSize:'11px',color:'#8a9ab0',marginTop:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          {[ev.vendor_name, ev.pkg_name].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:'8px',padding:'12px 18px',borderTop:'1px solid #2a3a4a'}}>
              <button className="btn-outline" onClick={() => setMonthReservationDetail(null)}>닫기</button>
              <button className="btn-primary" onClick={() => {
                const first = monthReservationDetail.item.events?.[0]
                if (first?.reservation_no) window.location.href = `/dashboard/reservations?edit=${first.reservation_no}`
              }}>예약 보기</button>
            </div>
          </div>
        </div>
      )}

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
