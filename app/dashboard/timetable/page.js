'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ── 상수
const TT_START = 7
const TT_END   = 22
const HOUR_H   = 52
const TOTAL_H  = (TT_END - TT_START) * HOUR_H

// ── 유틸
function timeToMin(t) { const [h, m] = t.slice(0,5).split(':').map(Number); return h * 60 + m }
function timeToPx(t)  { return (timeToMin(t) - TT_START * 60) / 60 * HOUR_H }
function durPx(s, e)  { return Math.max((timeToMin(e) - timeToMin(s)) / 60 * HOUR_H, 16) }
function dateStr(d)   {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
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
function buildAutoEvents(reservations, packages) {
  const events = []
  let counter = 0
  reservations.forEach(r => {
    if (r.type === 'cancelled') return
    const packageName = r.package_name || r.pkg
    const zoneCode = r.zone_code || r.zone
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
        zone_code: zoneCode,
        memo: '',
        is_manual: false,
      })
    })
  })
  return events
}

// 겹침 감지: 같은 업체 + 시간 겹침
// 같은 구역 → real(형광연두), 다른 구역 → warn(amber)
function detectConflicts(evs) {
  const map = new Map()
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j]
      if (a.type === 'pickup' || b.type === 'pickup') continue
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
              <input type="date" style={S.inp} value={form.date} onChange={e => set('date', e.target.value)}/></div>
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
function EventPopup({ ev, pos, onClose, onDelete, zones }) {
  if (!ev) return null
  const zone = zones.find(z => z.code === ev.zone_code)
  return (
    <div style={{position:'fixed',inset:0,zIndex:900}} onClick={onClose}>
      <div style={{position:'fixed', top: pos.y, left: pos.x,
                   background:'#1a2535',border:`1px solid ${ev.vendor_color||'#4ecdc4'}`,
                   borderRadius:'10px',padding:'14px 16px',minWidth:'220px',maxWidth:'300px',
                   boxShadow:'0 8px 24px rgba(0,0,0,0.5)',zIndex:901}}
           onClick={e => e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
          <span style={{fontWeight:'700',fontSize:'13px',color:ev.vendor_color||'#4ecdc4'}}>
            {ev.type==='pickup'?'🚐 픽업/드랍':'체험'} 일정
          </span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#8a9ab0',
                                            fontSize:'15px',cursor:'pointer',padding:'0'}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'5px',fontSize:'12px'}}>
          <div><span style={{color:'#8a9ab0'}}>업체 </span><span style={{color:'#e8eaed'}}>{ev.vendor_name}</span></div>
          {ev.prog_name && <div><span style={{color:'#8a9ab0'}}>프로그램 </span><span style={{color:'#e8eaed'}}>{ev.prog_name}</span></div>}
          {ev.customer && <div><span style={{color:'#8a9ab0'}}>고객 </span><span style={{color:'#e8eaed'}}>{ev.customer}{ev.pax?` (${ev.pax}명)`:''}</span></div>}
          {ev.pkg_name && <div><span style={{color:'#8a9ab0'}}>패키지 </span><span style={{color:'#e8eaed'}}>{ev.pkg_name}</span></div>}
          {ev.reservation_no && <div><span style={{color:'#8a9ab0'}}>예약 </span><span style={{color:'#e8eaed'}}>#{ev.reservation_no}</span></div>}
          {zone && <div><span style={{color:'#8a9ab0'}}>구역 </span><span style={{color:'#e8eaed'}}>{zone.code} · {zone.name}</span></div>}
          <div><span style={{color:'#8a9ab0'}}>시간 </span><span style={{color:'#e8eaed'}}>{ev.start_time?.slice(0,5)} ~ {ev.end_time?.slice(0,5)}</span></div>
          {ev.memo && <div><span style={{color:'#8a9ab0'}}>메모 </span><span style={{color:'#e8eaed'}}>{ev.memo}</span></div>}
        </div>
        {ev.is_manual && (
          <button onClick={() => onDelete(ev.id)}
                  style={{marginTop:'10px',width:'100%',height:'30px',background:'rgba(224,92,92,0.15)',
                          border:'1px solid rgba(224,92,92,0.3)',borderRadius:'6px',color:'#e05c5c',
                          cursor:'pointer',fontSize:'12px',fontWeight:'600',
                          fontFamily:'Noto Sans KR, sans-serif'}}>삭제</button>
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
  const [zones,        setZones]        = useState([])
  const [manualEvents, setManualEvents] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('day')
  const [group,        setGroup]        = useState('all')
  const [curDate,      setCurDate]      = useState(new Date())
  const [selZone,      setSelZone]      = useState('')
  const [modal,        setModal]        = useState(false)
  const [popup,        setPopup]        = useState(null)   // { ev, pos }
  const [conflictPopup,setConflictPopup]= useState(false)
  const lastConflictsRef = useRef([])

  // ── 기준 데이터 로드 (1회)
  useEffect(() => {
    Promise.all([
      supabase.from('vendors').select('*').order('key'),
      supabase.from('reservations').select('*').order('date', { ascending: false }),
      supabase.from('packages').select('*, package_programs(*, vendors(key,name,color))').order('name'),
      supabase.from('zones').select('*').order('code'),
    ]).then(([vR, rR, pR, zR]) => {
      setVendors(vR.data || [])
      setReservations(rR.data || [])
      setPackages(pR.data || [])
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
  const autoEvents = buildAutoEvents(reservations, packages)
  const allEvents = [
    ...autoEvents.map(e => ({ ...e, id: String(e.id) })),
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
  const handleSave = async form => {
    await fetch('/api/timetable', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setModal(false)
    await fetchManual()
  }

  // ── 수동 이벤트 삭제
  const handleDelete = async id => {
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
    height:'32px', padding:'0 12px', borderRadius:'7px', cursor:'pointer',
    fontFamily:'Noto Sans KR, sans-serif', fontSize:'12px', fontWeight:'600',
    border: active ? 'none' : '1px solid #2a3a4a',
    background: active ? '#4ecdc4' : '#1a2535',
    color: active ? '#0f1923' : '#8a9ab0',
    transition:'all .15s',
  })

  // ── 시간축
  const TimeAxis = () => (
    <div style={{width:'52px',flexShrink:0,position:'relative',height:TOTAL_H}}>
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
                       borderTop:'2px solid rgba(78,205,196,0.6)',zIndex:1}}/>
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

    const handleClick = e => {
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      setPopup({ ev, pos: { x: Math.min(rect.right + 4, window.innerWidth - 320), y: rect.top } })
    }

    return (
      <div onClick={handleClick}
           style={{position:'absolute',left:'3px',right:'3px',top,height:h,
                   background: color + '22',
                   border: level ? `2px solid ${borderColor}` : `1px solid ${color}44`,
                   borderLeft:`3px solid ${borderColor}`,
                   borderRadius:'5px',padding:'3px 6px',cursor:'pointer',overflow:'hidden',
                   boxSizing:'border-box'}}>
        <div style={{fontWeight:'700',fontSize:'11px',color:borderColor,
                     whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {icon}{isPickup ? '🚐 ' : ''}{ev.vendor_name || ev.vendor_key}
        </div>
        {ev.customer && (
          <div style={{fontSize:'10px',color,opacity:.9}}>
            {ev.customer}{ev.pax ? ` ${ev.pax}명` : ''}
          </div>
        )}
        {ev.prog_name && (
          <div style={{fontSize:'10px',color,opacity:.75,whiteSpace:'nowrap',
                       overflow:'hidden',textOverflow:'ellipsis'}}>
            {ev.prog_name}
          </div>
        )}
        <div style={{fontSize:'10px',color,opacity:.7}}>
          {ev.start_time?.slice(0,5)}~{ev.end_time?.slice(0,5)}
        </div>
      </div>
    )
  }

  // ── 컬럼 헤더 + 바디 구성 헬퍼
  const makeCol = (key, header, evs, conflictMap, isToday, flex='1') => ({
    key, header, evs, conflictMap, isToday, flex,
  })

  // ── 일간 뷰
  const DayView = () => {
    const ds = dateStr(curDate)
    const isToday = ds === dateStr(new Date())
    let dayEvs = allEvents.filter(e => e.date === ds)

    if (group === 'zone' && selZone) {
      dayEvs = dayEvs.filter(e => e.zone_code === selZone || !e.zone_code)
    }

    const expEvs    = dayEvs.filter(e => e.type !== 'pickup')
    const pickupEvs = dayEvs.filter(e => e.type === 'pickup')

    // 겹침 감지 (expEvs 기준)
    const conflictMap = detectConflicts(expEvs)

    // lastConflicts 업데이트
    const cs = []
    for (let i = 0; i < expEvs.length; i++) {
      for (let j = i + 1; j < expEvs.length; j++) {
        const a = expEvs[i], b = expEvs[j]
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
        <div style={{display:'flex'}}>
          <TimeAxis/>
          <div style={{flex:1}}>
            <div style={{padding:'14px 18px',color:'#8a9ab0',fontSize:'13px',
                         borderBottom:'1px solid #2a3a4a'}}>이 날짜의 일정이 없습니다</div>
            <div style={{position:'relative',height:TOTAL_H}}><Grid isToday={isToday}/></div>
          </div>
        </div>
      )
    }

    return (
      <div>
        {/* 겹침 알림 바 */}
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
          <div style={{width:'52px',flexShrink:0}}/>
          {cols.map(col => (
            <div key={col.key}
                 style={{flex:1,padding:'10px 14px',borderRight:'1px solid #2a3a4a',
                         borderTop:`3px solid ${col.topColor||'#4ecdc4'}`}}>
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
        <div style={{display:'flex',overflowY:'auto',maxHeight:'calc(100vh - 300px)'}}>
          <TimeAxis/>
          {cols.map(col => (
            <div key={col.key} style={{flex:1,position:'relative',height:TOTAL_H,borderRight:'1px solid #2a3a4a'}}>
              <Grid isToday={isToday}/>
              {col.evs.map(ev => <EvBlock key={ev.id} ev={ev} conflictMap={conflictMap}/>)}
            </div>
          ))}
          {pickupEvs.length > 0 && (
            <div style={{width:'130px',flexShrink:0,position:'relative',height:TOTAL_H}}>
              <Grid isToday={isToday}/>
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
    const dayNames = ['월','화','수','목','금','토','일']
    const todayS = dateStr(new Date())

    return (
      <div>
        <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#0f1923'}}>
          <div style={{width:'52px',flexShrink:0}}/>
          {days.map((d, i) => {
            const ds = dateStr(d)
            const isT = ds === todayS
            const cnt = allEvents.filter(e => e.date === ds).length
            return (
              <div key={i} onClick={() => { setCurDate(d); setView('day') }}
                   style={{flex:1,padding:'10px 0',textAlign:'center',
                           borderRight:'1px solid #2a3a4a',cursor:'pointer',
                           borderTop: isT ? '3px solid #4ecdc4' : '3px solid transparent'}}>
                <div style={{fontSize:'11px',color:isT?'#4ecdc4':'#8a9ab0'}}>{dayNames[i]}</div>
                <div style={{fontSize:'16px',fontWeight:'700',
                             color:isT?'#4ecdc4':'#e8eaed',marginTop:'2px'}}>{d.getDate()}</div>
                {cnt > 0 && <div style={{fontSize:'10px',color:'#4ecdc4',marginTop:'2px'}}>{cnt}건</div>}
              </div>
            )
          })}
        </div>
        <div style={{display:'flex',overflowY:'auto',maxHeight:'calc(100vh - 280px)'}}>
          <TimeAxis/>
          {days.map((d, i) => {
            const ds = dateStr(d)
            const isT = ds === dateStr(new Date())
            const evs = allEvents.filter(e => e.date === ds)
            const conflictMap = detectConflicts(evs)
            return (
              <div key={i} style={{flex:1,position:'relative',height:TOTAL_H,borderRight:'1px solid #2a3a4a'}}>
                <Grid isToday={isT}/>
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
    const last     = new Date(y, m+1, 0).getDate()
    const prevLast = new Date(y, m, 0).getDate()
    const dows     = ['일','월','화','수','목','금','토']
    const adj      = first === 0 ? 6 : first - 1
    const todayS   = dateStr(new Date())

    const cells = []
    for (let i = 0; i < adj; i++)
      cells.push({ day: prevLast - adj + i + 1, date: null, other: true })
    for (let d = 1; d <= last; d++) {
      const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      cells.push({ day: d, date: ds, other: false, isToday: ds === todayS,
                   evs: allEvents.filter(e => e.date === ds) })
    }
    const rem = (adj + last) % 7
    if (rem > 0) for (let i = 1; i <= 7 - rem; i++)
      cells.push({ day: i, date: null, other: true })

    return (
      <div style={{padding:'16px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
          {dows.map(d => (
            <div key={d} style={{textAlign:'center',fontSize:'10px',fontWeight:'600',
                                  color:'#5a7080',padding:'4px 0'}}>{d}</div>
          ))}
          {cells.map((cell, i) => (
            <div key={i}
                 onClick={() => cell.date && (setCurDate(new Date(cell.date + 'T00:00:00')), setView('day'))}
                 style={{
                   background:'#243B55',
                   border:`1px solid ${cell.isToday ? '#4ecdc4' : '#2a3a4a'}`,
                   borderRadius:'8px', minHeight:'80px', padding:'6px',
                   cursor: cell.date ? 'pointer' : 'default',
                   opacity: cell.other ? 0.4 : 1,
                   transition:'border-color .15s',
                   boxSizing:'border-box',
                 }}>
              <div style={{fontSize:'12px',fontWeight: cell.isToday ? '700' : '500',
                           marginBottom:'4px',
                           color: cell.isToday ? '#4ecdc4' : '#e8eaed'}}>{cell.day}</div>
              {!cell.other && cell.evs?.slice(0,3).map((ev, j) => {
                const color = ev.vendor_color || '#4ECDC4'
                return (
                  <div key={j} style={{
                    fontSize:'10px', padding:'2px 5px', borderRadius:'3px',
                    marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden',
                    textOverflow:'ellipsis', fontWeight:'500',
                    background: color + '22', color,
                  }}>{ev.start_time?.slice(0,5)} {ev.vendor_name}</div>
                )
              })}
              {!cell.other && cell.evs?.length > 3 && (
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
      const evs = allEvents.filter(e => e.date === ds && e.type !== 'pickup')
      return detectConflicts(evs).size
    }
    return 0
  })()

  if (loading) {
    return <div style={{padding:'60px',textAlign:'center',color:'var(--text-muted)'}}>불러오는 중...</div>
  }

  return (
    <div>
      {/* ── 툴바 */}
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px',flexWrap:'wrap'}}>
        {/* 뷰 전환 */}
        <div style={{display:'flex',gap:'3px',background:'#1a2535',border:'1px solid #2a3a4a',
                     borderRadius:'8px',padding:'3px'}}>
          {[['day','일'],['week','주'],['month','월']].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)} style={tabBtn(view === v)}>{l}</button>
          ))}
        </div>
        {/* 날짜 네비 */}
        <div style={{display:'flex',gap:'4px'}}>
          {['‹','오늘','›'].map((t, i) => (
            <button key={i} onClick={() => {
              if (t === '오늘') setCurDate(new Date())
              else navigate(t === '‹' ? -1 : 1)
            }} style={{height:'32px',padding:'0 12px',background:'#1a2535',border:'1px solid #2a3a4a',
                       borderRadius:'7px',color:'#8a9ab0',cursor:'pointer',fontSize:'13px',
                       fontFamily:'Noto Sans KR, sans-serif'}}>{t}</button>
          ))}
        </div>
        {/* 날짜 표시 */}
        <div style={{fontSize:'14px',fontWeight:'700',color:'#e8eaed'}}>
          {view === 'day'   ? formatDay(curDate)
           : view === 'week' ? `${getMon(curDate).getMonth()+1}월 ${getMon(curDate).getDate()}일 주간`
           : `${curDate.getFullYear()}년 ${curDate.getMonth()+1}월`}
        </div>

        <div style={{marginLeft:'auto',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          {/* 그룹 탭 */}
          <div style={{display:'flex',gap:'3px',background:'#1a2535',border:'1px solid #2a3a4a',
                       borderRadius:'8px',padding:'3px'}}>
            {[['all','전체'],['zone','구역별'],['package','패키지별'],['vendor','업체별']].map(([v,l]) => (
              <button key={v} onClick={() => setGroup(v)} style={tabBtn(group === v)}>{l}</button>
            ))}
          </div>
          {/* 겹침 배지 */}
          {curConflictCount > 0 && (
            <div onClick={showConflicts}
                 style={{padding:'4px 12px',background:'rgba(51,255,51,0.12)',
                         border:'1px solid rgba(51,255,51,0.25)',borderRadius:'20px',
                         fontSize:'12px',color:'#33ff33',fontWeight:'700',cursor:'pointer'}}>
              ⚠ 겹침 {Math.floor(curConflictCount/2)}건
            </div>
          )}
          {/* + 일정 */}
          <button onClick={() => setModal(true)}
                  style={{height:'32px',padding:'0 16px',background:'#4ecdc4',border:'none',
                          borderRadius:'8px',color:'#0f1923',fontSize:'12px',fontWeight:'700',
                          cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif'}}>+ 일정</button>
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
      <EventModal
        open={modal} onClose={() => setModal(false)} onSave={handleSave}
        vendors={vendors} reservations={reservations} defaultDate={dateStr(curDate)}
      />

      {/* ── 이벤트 상세 팝업 */}
      {popup && (
        <EventPopup
          ev={popup.ev} pos={popup.pos}
          onClose={() => setPopup(null)}
          onDelete={handleDelete}
          zones={zones}
        />
      )}
    </div>
  )
}
