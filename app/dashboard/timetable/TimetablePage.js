'use client'
import { useState, useEffect, useCallback } from 'react'

const TT_START = 7
const TT_END   = 22
const HOUR_H   = 56
const TOTAL_H  = (TT_END - TT_START) * HOUR_H
const VENDOR_COLORS = ['#4ECDC4','#F7C948','#E05C5C','#7B68EE','#5CB85C','#FF8C42','#B8B8FF','#FF6B9D','#4A90D9']

function timeToMin(t){ const[h,m]=t.split(':').map(Number); return h*60+m }
function timeToPx(t){ return (timeToMin(t)-TT_START*60)/60*HOUR_H }
function durPx(s,e){ return Math.max((timeToMin(e)-timeToMin(s))/60*HOUR_H,18) }
function dateStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function formatDate(d){ const days=['일','월','화','수','목','금','토']; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})` }
function getMon(d){ const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1)); return mon }

function EventModal({ open, onClose, onSave, vendors, reservations, defaultDate }){
  const [form,setForm]=useState({ date:defaultDate||'', start_time:'09:00', end_time:'10:30', type:'exp', vendor_key:'', reservation_no:'', place:'', driver:'', pax:0 })
  useEffect(()=>{ if(open) setForm(f=>({...f,date:defaultDate||f.date})) },[open,defaultDate])
  const selVendor=vendors.find(v=>v.key===form.vendor_key)
  const selRes=reservations.find(r=>r.no===form.reservation_no)
  const handleSave=()=>{
    if(!form.date){alert('날짜를 입력하세요.');return}
    if(!form.start_time){alert('시작 시간을 입력하세요.');return}
    onSave({...form,vendor:selVendor?.name||'',customer:selRes?.customer||'',pkg:selRes?.pkg||'',pax:selRes?.pax||form.pax})
  }
  if(!open) return null
  const inp={width:'100%',height:'36px',background:'#0f1923',border:'1px solid #2a3a4a',borderRadius:'7px',padding:'0 12px',fontSize:'13px',color:'#e8eaed',outline:'none',fontFamily:'Noto Sans KR, sans-serif'}
  const lbl={fontSize:'11px',color:'#8a9ab0',display:'block',marginBottom:'4px',fontWeight:'600'}
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px'}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'14px',width:'100%',maxWidth:'420px'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #2a3a4a',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:'700',fontSize:'14px'}}>+ 일정 추가</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#8a9ab0',fontSize:'18px',cursor:'pointer'}}>✕</button>
        </div>
        <div style={{padding:'20px',display:'flex',flexDirection:'column',gap:'12px'}}>
          <div><label style={lbl}>구분</label>
            <div style={{display:'flex',gap:'8px'}}>
              {[{v:'exp',l:'체험'},{v:'pickup',l:'픽업/드랍'}].map(o=>(
                <button key={o.v} onClick={()=>setForm(f=>({...f,type:o.v}))} style={{flex:1,height:'36px',border:'1px solid',borderRadius:'8px',cursor:'pointer',fontSize:'13px',fontWeight:'600',fontFamily:'Noto Sans KR, sans-serif',background:form.type===o.v?'rgba(78,205,196,0.15)':'#0f1923',borderColor:form.type===o.v?'#4ecdc4':'#2a3a4a',color:form.type===o.v?'#4ecdc4':'#8a9ab0'}}>{o.l}</button>
              ))}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
            <div><label style={lbl}>날짜 *</label><input type="date" style={inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
            <div><label style={lbl}>시작</label><input type="time" style={inp} value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))}/></div>
            <div><label style={lbl}>종료</label><input type="time" style={inp} value={form.end_time} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))}/></div>
          </div>
          <div><label style={lbl}>예약 연결</label>
            <select style={inp} value={form.reservation_no} onChange={e=>setForm(f=>({...f,reservation_no:e.target.value}))}>
              <option value="">선택 (선택사항)</option>
              {reservations.map(r=><option key={r.no} value={r.no}>#{r.no} {r.customer} · {r.date}</option>)}
            </select>
          </div>
          <div><label style={lbl}>{form.type==='pickup'?'픽업 수행자':'담당 업체'}</label>
            <select style={inp} value={form.vendor_key} onChange={e=>setForm(f=>({...f,vendor_key:e.target.value}))}>
              <option value="">선택</option>
              {vendors.map(v=><option key={v.id} value={v.key}>{v.key} — {v.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>{form.type==='pickup'?'픽업 경로':'장소'}</label>
            <input style={inp} value={form.place} onChange={e=>setForm(f=>({...f,place:e.target.value}))} placeholder={form.type==='pickup'?'예) 안동역→금소마을':'예) 금소마을 체험장'}/>
          </div>
          {form.type==='pickup'&&(<div><label style={lbl}>수행자</label><input style={inp} value={form.driver} onChange={e=>setForm(f=>({...f,driver:e.target.value}))} placeholder="홍길동"/></div>)}
        </div>
        <div style={{padding:'14px 20px',borderTop:'1px solid #2a3a4a',display:'flex',justifyContent:'flex-end',gap:'8px'}}>
          <button onClick={onClose} style={{height:'36px',padding:'0 16px',background:'none',border:'1px solid #2a3a4a',borderRadius:'8px',color:'#8a9ab0',cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif',fontSize:'13px'}}>닫기</button>
          <button onClick={handleSave} style={{height:'36px',padding:'0 20px',background:'#4ecdc4',border:'none',borderRadius:'8px',color:'#0f1923',fontWeight:'700',cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif',fontSize:'13px'}}>저장</button>
        </div>
      </div>
    </div>
  )
}

export default function TimetablePage({ vendors, reservations }){
  const [view,setView]=useState('day')
  const [group,setGroup]=useState('all')
  const [curDate,setCurDate]=useState(new Date())
  const [events,setEvents]=useState([])
  const [loading,setLoading]=useState(true)
  const [modal,setModal]=useState(false)
  const [zones,setZones]=useState([])
  const [selZone,setSelZone]=useState('')

  const vendorColorMap={}
  vendors.forEach((v,i)=>{ vendorColorMap[v.key]=v.color||VENDOR_COLORS[i%VENDOR_COLORS.length] })

  const fetchEvents=useCallback(async()=>{
    setLoading(true)
    let url='/api/timetable?'
    if(view==='day') url+=`date=${dateStr(curDate)}`
    else url+=`week=${dateStr(getMon(curDate))}`
    const res=await fetch(url)
    const data=await res.json()
    setEvents(Array.isArray(data)?data:[])
    setLoading(false)
  },[view,curDate])

  useEffect(()=>{ fetchEvents() },[fetchEvents])
  useEffect(()=>{ fetch('/api/zones').then(r=>r.json()).then(d=>{ setZones(Array.isArray(d)?d:[]); if(d[0]) setSelZone(d[0].code) }) },[])

  const navigate=(dir)=>{ const d=new Date(curDate); if(view==='day') d.setDate(d.getDate()+dir); else d.setDate(d.getDate()+dir*7); setCurDate(d) }

  const handleSave=async(form)=>{ await fetch('/api/timetable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}); setModal(false); await fetchEvents() }
  const handleDelete=async(id)=>{ if(!confirm('이 일정을 삭제하시겠습니까?')) return; await fetch('/api/timetable',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); await fetchEvents() }

  const detectConflicts=(evs)=>{
    const c=new Set()
    for(let i=0;i<evs.length;i++) for(let j=i+1;j<evs.length;j++){
      const a=evs[i],b=evs[j]
      if(a.type==='pickup'||b.type==='pickup') continue
      if(a.vendor_key!==b.vendor_key) continue
      if(timeToMin(a.start_time)<timeToMin(b.end_time)&&timeToMin(b.start_time)<timeToMin(a.end_time)){ c.add(a.id); c.add(b.id) }
    }
    return c
  }

  const TimeAxis=()=>(<div style={{width:'52px',flexShrink:0,position:'relative',height:TOTAL_H}}>
    {Array.from({length:TT_END-TT_START},(_,i)=>(<div key={i} style={{position:'absolute',top:i*HOUR_H-8,fontSize:'10px',color:'#8a9ab0',right:'8px',userSelect:'none'}}>{String(TT_START+i).padStart(2,'0')}:00</div>))}
  </div>)

  const Grid=()=>(<div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
    {Array.from({length:TT_END-TT_START},(_,i)=>(<div key={i} style={{position:'absolute',left:0,right:0,top:i*HOUR_H,borderTop:'1px solid #2a3a4a'}}/>))}
  </div>)

  const EvBlock=({ev,color,conflicts})=>{
    const top=timeToPx(ev.start_time),h=durPx(ev.start_time,ev.end_time)
    const isPickup=ev.type==='pickup',hasC=conflicts.has(ev.id)
    const bc=hasC?'#e05c5c':color
    return(<div onClick={()=>handleDelete(ev.id)} title={`${ev.vendor||''} | ${ev.customer||''}\n${ev.place||''}\n클릭하면 삭제`} style={{position:'absolute',left:'3px',right:'3px',top,height:h,background:color+'22',borderLeft:`3px solid ${bc}`,borderRadius:'5px',padding:'3px 6px',cursor:'pointer',overflow:'hidden',fontSize:'11px',color,border:hasC?`1px solid ${bc}`:`1px solid ${color}44`}}>
      <div style={{fontWeight:'700',fontSize:'11px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{hasC&&'⚠ '}{isPickup&&'🚐 '}{ev.vendor||''}</div>
      {ev.customer&&<div style={{fontSize:'10px',opacity:.8}}>{ev.customer}{ev.pax?` ${ev.pax}명`:''}</div>}
      {ev.place&&<div style={{fontSize:'10px',opacity:.7,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>📍{ev.place}</div>}
      <div style={{fontSize:'10px',opacity:.7}}>{ev.start_time?.slice(0,5)}~{ev.end_time?.slice(0,5)}</div>
    </div>)
  }

  const DayView=()=>{
    const ds=dateStr(curDate)
    let dayEvs=events.filter(e=>e.date===ds)
    if(group==='zone'&&selZone){ const nos=reservations.filter(r=>r.zone===selZone).map(r=>r.no); dayEvs=dayEvs.filter(e=>!e.reservation_no||nos.includes(e.reservation_no)) }
    const conflicts=detectConflicts(dayEvs)
    const expEvs=dayEvs.filter(e=>e.type!=='pickup')
    const pickEvs=dayEvs.filter(e=>e.type==='pickup')
    let cols=[]
    if(group==='all'||group==='zone'){
      const nos=[...new Set(expEvs.map(e=>e.reservation_no).filter(Boolean))]
      cols=nos.map(no=>{ const r=reservations.find(x=>x.no===no); return{key:no,label:`NO.${no}`,sub:r?.customer||'',evs:expEvs.filter(e=>e.reservation_no===no)} })
      const noRes=expEvs.filter(e=>!e.reservation_no)
      if(noRes.length) cols.push({key:'none',label:'기타',sub:'',evs:noRes})
    } else if(group==='package'){
      const pkgs=[...new Set(expEvs.map(e=>e.pkg).filter(Boolean))]
      cols=pkgs.map(p=>({key:p,label:p,sub:'',evs:expEvs.filter(e=>e.pkg===p)}))
    } else if(group==='vendor'){
      const vks=[...new Set(expEvs.map(e=>e.vendor_key).filter(Boolean))]
      cols=vks.map(k=>{ const v=vendors.find(x=>x.key===k); return{key:k,label:v?.name||k,sub:expEvs.filter(e=>e.vendor_key===k).length+'건',evs:expEvs.filter(e=>e.vendor_key===k)} })
    }
    if(!cols.length&&!pickEvs.length) return(<div style={{display:'flex'}}><TimeAxis/><div style={{flex:1}}><div style={{padding:'14px 18px',borderBottom:'1px solid #2a3a4a',color:'#8a9ab0',fontSize:'13px'}}>이 날짜의 일정이 없습니다</div><div style={{position:'relative',height:TOTAL_H}}><Grid/></div></div></div>)
    return(<div>
      <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#0f1923'}}>
        <div style={{width:'52px',flexShrink:0}}/>
        {cols.map(col=>{ const fe=col.evs[0]; const color=fe?(vendorColorMap[fe.vendor_key]||'#4ecdc4'):'#4ecdc4'; return(<div key={col.key} style={{flex:1,padding:'10px 14px',borderRight:'1px solid #2a3a4a',borderTop:`3px solid ${color}`}}><div style={{fontSize:'12px',fontWeight:'700',color}}>{col.label}</div>{col.sub&&<div style={{fontSize:'11px',color:'#8a9ab0',marginTop:'2px'}}>{col.sub}</div>}</div>) })}
        {pickEvs.length>0&&(<div style={{width:'130px',flexShrink:0,padding:'10px 14px',borderTop:'3px dashed #B8B8FF'}}><div style={{fontSize:'12px',fontWeight:'700',color:'#B8B8FF'}}>🚐 픽업/드랍</div><div style={{fontSize:'11px',color:'#8a9ab0',marginTop:'2px'}}>{pickEvs.length}건</div></div>)}
      </div>
      <div style={{display:'flex',overflowY:'auto',maxHeight:'calc(100vh - 260px)'}}>
        <TimeAxis/>
        {cols.map(col=>(<div key={col.key} style={{flex:1,position:'relative',height:TOTAL_H,borderRight:'1px solid #2a3a4a'}}><Grid/>{col.evs.map(ev=><EvBlock key={ev.id} ev={ev} color={vendorColorMap[ev.vendor_key]||'#4ecdc4'} conflicts={conflicts}/>)}</div>))}
        {pickEvs.length>0&&(<div style={{width:'130px',flexShrink:0,position:'relative',height:TOTAL_H}}><Grid/>{pickEvs.map(ev=><EvBlock key={ev.id} ev={ev} color="#B8B8FF" conflicts={new Set()}/>)}</div>)}
      </div>
    </div>)
  }

  const WeekView=()=>{
    const mon=getMon(curDate)
    const days=Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d })
    const dayNames=['월','화','수','목','금','토','일']
    const todayS=dateStr(new Date())
    return(<div>
      <div style={{display:'flex',borderBottom:'1px solid #2a3a4a',background:'#0f1923'}}>
        <div style={{width:'52px',flexShrink:0}}/>
        {days.map((d,i)=>{ const ds=dateStr(d); const cnt=events.filter(e=>e.date===ds).length; const isT=ds===todayS; return(<div key={i} style={{flex:1,padding:'10px 0',textAlign:'center',borderRight:'1px solid #2a3a4a',cursor:'pointer',borderTop:isT?'3px solid #4ecdc4':'3px solid transparent'}} onClick={()=>{ setCurDate(d); setView('day') }}><div style={{fontSize:'11px',color:isT?'#4ecdc4':'#8a9ab0'}}>{dayNames[i]}</div><div style={{fontSize:'14px',fontWeight:'700',color:isT?'#4ecdc4':'#e8eaed',marginTop:'2px'}}>{d.getDate()}</div>{cnt>0&&<div style={{fontSize:'10px',color:'#4ecdc4',marginTop:'2px'}}>{cnt}건</div>}</div>) })}
      </div>
      <div style={{display:'flex',overflowY:'auto',maxHeight:'calc(100vh - 260px)'}}>
        <TimeAxis/>
        {days.map((d,i)=>{ const ds=dateStr(d); const evs=events.filter(e=>e.date===ds); const conflicts=detectConflicts(evs); return(<div key={i} style={{flex:1,position:'relative',height:TOTAL_H,borderRight:'1px solid #2a3a4a'}}><Grid/>{evs.map(ev=><EvBlock key={ev.id} ev={ev} color={vendorColorMap[ev.vendor_key]||'#4ecdc4'} conflicts={conflicts}/>)}</div>) })}
      </div>
    </div>)
  }

  const btn=(active)=>({height:'32px',padding:'0 14px',borderRadius:'7px',cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif',fontSize:'12px',fontWeight:'600',border:active?'none':'1px solid #2a3a4a',background:active?'#4ecdc4':'#1a2535',color:active?'#0f1923':'#8a9ab0',transition:'all .15s'})
  const conflictCnt=detectConflicts(events).size/2

  return(<div>
    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px',flexWrap:'wrap'}}>
      <div style={{display:'flex',gap:'4px',background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'8px',padding:'3px'}}>
        <button onClick={()=>setView('day')} style={btn(view==='day')}>일</button>
        <button onClick={()=>setView('week')} style={btn(view==='week')}>주</button>
      </div>
      <div style={{display:'flex',gap:'4px'}}>
        {['‹','오늘','›'].map((t,i)=>(<button key={i} onClick={()=>{ if(t==='오늘') setCurDate(new Date()); else navigate(t==='‹'?-1:1) }} style={{height:'32px',padding:'0 12px',background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'7px',color:'#8a9ab0',cursor:'pointer',fontSize:'13px',fontFamily:'Noto Sans KR, sans-serif'}}>{t}</button>))}
      </div>
      <div style={{fontSize:'14px',fontWeight:'700',color:'#e8eaed'}}>{view==='day'?formatDate(curDate):`${getMon(curDate).getMonth()+1}월 ${getMon(curDate).getDate()}일 주간`}</div>
      <div style={{marginLeft:'auto',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:'4px',background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'8px',padding:'3px'}}>
          {[['all','전체'],['zone','구역별'],['package','패키지별'],['vendor','업체별']].map(([v,l])=>(<button key={v} onClick={()=>setGroup(v)} style={btn(group===v)}>{l}</button>))}
        </div>
        {conflictCnt>0&&(<div style={{padding:'4px 12px',background:'rgba(224,92,92,0.15)',border:'1px solid rgba(224,92,92,0.3)',borderRadius:'20px',fontSize:'12px',color:'#e05c5c',fontWeight:'700'}}>⚠ 겹침 {conflictCnt}건</div>)}
        <button onClick={()=>setModal(true)} style={{height:'32px',padding:'0 16px',background:'#4ecdc4',border:'none',borderRadius:'8px',color:'#0f1923',fontSize:'12px',fontWeight:'700',cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif'}}>+ 일정</button>
      </div>
    </div>

    {group==='zone'&&(<div style={{display:'flex',gap:'6px',marginBottom:'10px',flexWrap:'wrap'}}>
      {zones.map(z=>{ const cnt=reservations.filter(r=>r.zone===z.code).length; return(<button key={z.id} onClick={()=>setSelZone(z.code)} style={{height:'30px',padding:'0 14px',borderRadius:'7px',cursor:'pointer',fontFamily:'Noto Sans KR, sans-serif',fontSize:'12px',fontWeight:'600',border:'1px solid',background:selZone===z.code?'#4ecdc4':'#1a2535',color:selZone===z.code?'#0f1923':'#8a9ab0',borderColor:selZone===z.code?'#4ecdc4':'#2a3a4a'}}>{z.code} · {z.name} ({cnt}건)</button>) })}
    </div>)}

    <div style={{background:'#1a2535',border:'1px solid #2a3a4a',borderRadius:'12px',overflow:'hidden'}}>
      {loading?<div style={{padding:'60px',textAlign:'center',color:'#8a9ab0'}}>불러오는 중...</div>:view==='day'?<DayView/>:<WeekView/>}
    </div>
    <div style={{marginTop:'10px',fontSize:'11px',color:'#8a9ab0'}}>💡 이벤트 클릭하면 삭제됩니다 · ⚠ 빨간 테두리는 같은 업체 시간 겹침</div>

    <EventModal open={modal} onClose={()=>setModal(false)} onSave={handleSave} vendors={vendors} reservations={reservations} defaultDate={dateStr(curDate)}/>
  </div>)
}
