'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams, useRouter } from 'next/navigation'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const INFLOW_OPTS  = ['플랫폼','여행사','직접']
const OP_OPTS      = ['일반','사업비']

// ── 금액 계산
function calcTotal(price, pax, discount, pickupFee, burden) {
  return (Number(price)||0) * (Number(pax)||0)
    - (Number(discount)||0)
    + (Number(pickupFee)||0)
    + (Number(burden)||0)
}

// ══════════════════════════════════════════════════════
// 예약 모달
// ══════════════════════════════════════════════════════
function nextDay(ds) {
  const d = new Date(ds); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10)
}

function ReservationModal({ editData, initDate, onClose, onSaved, zones, packages, platforms, drivers, bizList }) {
  const isEdit  = !!editData
  const baseDate = initDate || new Date().toISOString().slice(0,10)

  const EMPTY = {
    no:'', type:'confirmed', date: baseDate, end_date: nextDay(baseDate),
    zone_code:'', package_name:'', customer:'', tel:'', pax:1,
    price:0, discount:0, pickup_fee:0, burden:0, total:0,
    payto:'', inflow:'', platform_name:'', plat_fee:0, agency_name:'', ag_fee:0,
    op:'일반', biz_id:'', settle_status:'unsettled', memo:'',
  }

  const [tab,    setTab]    = useState(0)
  const [form,   setForm]   = useState(isEdit ? { ...EMPTY, ...editData } : { ...EMPTY })
  const [pickups, setPickups] = useState([])   // reservation_pickup rows
  const [lodges,  setLodges]  = useState([])   // lodge_confirms rows
  const [saving,  setSaving]  = useState(false)

  // pickup form row
  const [pkRow, setPkRow] = useState({ pickup_type:'픽업', driver_id:'', pickup_fee:0 })

  // lodge form row
  const [lgRow, setLgRow] = useState({ lodge_name:'', room_name:'', room_price:0, support_amt:0, support_by:'', burden:0, checked:false, note:'' })

  // 편집 시 관련 데이터 로드
  useEffect(() => {
    if (!isEdit) return
    async function loadRelated() {
      const [pkR, lgR] = await Promise.all([
        supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', editData.no),
        supabase.from('lodge_confirms').select('*').eq('reservation_no', editData.no),
      ])
      setPickups(pkR.data || [])
      setLodges(lgR.data || [])
    }
    loadRelated()
  }, [isEdit, editData?.no])

  const inp = (k,v) => setForm(f => {
    const next = { ...f, [k]: v }
    // 자동계산
    next.total = calcTotal(next.price, next.pax, next.discount, next.pickup_fee, next.burden)
    return next
  })

  // 패키지 선택 → 1인 판매가 자동입력
  function onPkgChange(pkgName) {
    const pkg = packages.find(p => p.name === pkgName)
    setForm(f => {
      const next = { ...f, package_name: pkgName }
      if (pkg) {
        next.price    = pkg.total_price || 0
        next.zone_code = pkg.zone_code || f.zone_code
      }
      next.total = calcTotal(next.price, next.pax, next.discount, next.pickup_fee, next.burden)
      return next
    })
  }

  // 결제처 선택 → 수수료 자동입력
  function onPaytoChange(val) {
    const plat = platforms.find(p => p.name === val && p.type === '플랫폼')
    const agnt = platforms.find(p => p.name === val && p.type === '여행사')
    setForm(f => ({
      ...f, payto: val,
      inflow:        plat ? '플랫폼' : agnt ? '여행사' : f.inflow,
      platform_name: plat ? val : '',
      plat_fee:      plat ? (f.pax >= 10 ? plat.fee_grp : plat.fee_ind) : 0,
      agency_name:   agnt ? val : '',
      ag_fee:        agnt ? (f.pax >= 10 ? agnt.fee_grp : agnt.fee_ind) : 0,
    }))
  }

  // 저장
  async function save() {
    if (!form.customer) { alert('고객명을 입력하세요.'); return }
    if (!form.date)      { alert('예약날짜를 입력하세요.'); return }
    setSaving(true)

    const payload = {
      type: form.type, date: form.date, end_date: form.end_date || form.date,
      zone_code: form.zone_code || null, package_name: form.package_name || null,
      customer: form.customer, tel: form.tel, pax: Number(form.pax)||1,
      price: Number(form.price)||0, discount: Number(form.discount)||0,
      pickup_fee: Number(form.pickup_fee)||0, burden: Number(form.burden)||0,
      total: Number(form.total)||0,
      payto: form.payto, inflow: form.inflow,
      platform_name: form.platform_name, plat_fee: Number(form.plat_fee)||0,
      agency_name: form.agency_name, ag_fee: Number(form.ag_fee)||0,
      op: form.op, biz_id: form.biz_id || null,
      settle_status: form.settle_status, memo: form.memo,
    }

    let no = form.no
    if (!isEdit) {
      // 예약번호 자동생성
      const { data: last } = await supabase.from('reservations').select('no').order('no', { ascending: false }).limit(1)
      no = last?.length ? String(parseInt(last[0].no,10)+1).padStart(3,'0') : '001'
      const { error } = await supabase.from('reservations').insert({ ...payload, no })
      if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }

      // 패키지 업체 자동으로 vendor_confirms 생성
      const pkg = packages.find(p => p.name === payload.package_name)
      if (pkg) {
        const { data: progs } = await supabase.from('package_programs').select('vendor_key').eq('package_id', pkg.id)
        const uniqueKeys = [...new Set((progs||[]).map(pr => pr.vendor_key))]
        if (uniqueKeys.length) {
          await supabase.from('vendor_confirms').insert(
            uniqueKeys.map(vk => ({ reservation_no: no, vendor_key: vk, status: 'wait' }))
          )
        }
      }
    } else {
      const { error } = await supabase.from('reservations').update(payload).eq('no', no)
      if (error) { alert('수정 실패: ' + error.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
  }

  // 삭제
  async function del() {
    if (!confirm(`예약 #${form.no} (${form.customer})을 삭제하시겠습니까?`)) return
    await supabase.from('vendor_confirms').delete().eq('reservation_no', form.no)
    await supabase.from('lodge_confirms').delete().eq('reservation_no', form.no)
    await supabase.from('reservation_pickup').delete().eq('reservation_no', form.no)
    await supabase.from('reservations').delete().eq('no', form.no)
    onSaved()
  }

  // 픽업 추가
  async function addPickup() {
    if (!isEdit) { alert('예약을 먼저 저장하세요.'); return }
    await supabase.from('reservation_pickup').insert({ reservation_no: form.no, pickup_type: pkRow.pickup_type, driver_id: pkRow.driver_id || null, pickup_fee: Number(pkRow.pickup_fee)||0 })
    const { data } = await supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', form.no)
    setPickups(data || [])
    setPkRow({ pickup_type:'픽업', driver_id:'', pickup_fee:0 })
    // 픽업비 합계 업데이트
    const total_pickup = (data||[]).reduce((s,r)=>s+(r.pickup_fee||0),0)
    inp('pickup_fee', total_pickup)
  }

  async function delPickup(id) {
    await supabase.from('reservation_pickup').delete().eq('id', id)
    const { data } = await supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', form.no)
    setPickups(data || [])
    const total_pickup = (data||[]).reduce((s,r)=>s+(r.pickup_fee||0),0)
    inp('pickup_fee', total_pickup)
  }

  // 숙소 배정 추가
  async function addLodge() {
    if (!isEdit) { alert('예약을 먼저 저장하세요.'); return }
    const burden = (Number(lgRow.room_price)||0) - (Number(lgRow.support_amt)||0)
    await supabase.from('lodge_confirms').insert({ reservation_no: form.no, ...lgRow, burden: burden > 0 ? burden : 0 })
    const { data } = await supabase.from('lodge_confirms').select('*').eq('reservation_no', form.no)
    setLodges(data || [])
    setLgRow({ lodge_name:'', room_name:'', room_price:0, support_amt:0, support_by:'', burden:0, checked:false, note:'' })
  }

  async function delLodge(id) {
    await supabase.from('lodge_confirms').delete().eq('id', id)
    const { data } = await supabase.from('lodge_confirms').select('*').eq('reservation_no', form.no)
    setLodges(data || [])
  }

  const filteredPkgs = form.zone_code
    ? packages.filter(p => p.zone_code === form.zone_code)
    : packages

  return (
    <div className="modal-overlay open" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{width:'680px'}}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? `예약 수정 — #${form.no}` : '예약 등록'}</div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 탭 */}
        <div className="modal-tabs">
          <div className={`modal-tab${tab===0?' active':''}`} onClick={()=>setTab(0)}>기본정보 · 결제</div>
          <div className={`modal-tab${tab===1?' active':''}`} onClick={()=>setTab(1)}>픽업정보</div>
        </div>

        <div className="modal-body">
          {/* ── 탭0: 기본정보 */}
          {tab === 0 && (
            <>
              {/* 기본 정보 */}
              <div className="form-section">
                <div className="form-section-label">기본 정보</div>
                <div className="form-grid form-grid-4" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>NO <span className="auto">자동</span></label>
                    <input className="form-input auto-fill" value={form.no || '자동생성'} readOnly/>
                  </div>
                  <div className="form-field">
                    <label>예약구분 <span className="req">*</span></label>
                    <select className="form-select" value={form.type} onChange={e=>inp('type',e.target.value)}>
                      <option value="confirmed">확정</option>
                      <option value="pending">대기</option>
                      <option value="cancelled">취소</option>
                      <option value="consult">상담필요</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>예약날짜 <span className="req">*</span></label>
                    <input className="form-input" type="date" value={form.date} onChange={e=>inp('date',e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>체험종료</label>
                    <input className="form-input" type="date" value={form.end_date||''} onChange={e=>inp('end_date',e.target.value)}/>
                  </div>
                </div>
                <div className="form-grid form-grid-3" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>구역</label>
                    <select className="form-select" value={form.zone_code||''} onChange={e=>inp('zone_code',e.target.value)}>
                      <option value="">선택</option>
                      {zones.map(z=><option key={z.code} value={z.code}>{z.code} · {z.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>패키지명 <span className="req">*</span></label>
                    <select className="form-select" value={form.package_name||''} onChange={e=>onPkgChange(e.target.value)}>
                      <option value="">선택</option>
                      {filteredPkgs.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>인원 <span className="req">*</span></label>
                    <input className="form-input" type="number" min="1" value={form.pax} onChange={e=>inp('pax',e.target.value)} placeholder="명"/>
                  </div>
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-field">
                    <label>고객명 <span className="req">*</span></label>
                    <input className="form-input" value={form.customer} onChange={e=>inp('customer',e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>연락처</label>
                    <input className="form-input" value={form.tel} onChange={e=>inp('tel',e.target.value)} placeholder="010-0000-0000"/>
                  </div>
                </div>
              </div>

              {/* 객실 배정 */}
              <div className="form-section">
                <div className="form-section-label">객실 배정</div>
                <div className="form-grid form-grid-4" style={{marginBottom:'8px',gap:'8px'}}>
                  <div className="form-field">
                    <label>숙소명</label>
                    <input className="form-input" value={lgRow.lodge_name} onChange={e=>setLgRow(r=>({...r,lodge_name:e.target.value}))} placeholder="숙소명"/>
                  </div>
                  <div className="form-field">
                    <label>객실명</label>
                    <input className="form-input" value={lgRow.room_name} onChange={e=>setLgRow(r=>({...r,room_name:e.target.value}))} placeholder="객실명"/>
                  </div>
                  <div className="form-field">
                    <label>객실금액</label>
                    <input className="form-input" type="number" value={lgRow.room_price||0} onChange={e=>setLgRow(r=>({...r,room_price:e.target.value}))}/>
                  </div>
                  <div className="form-field">
                    <label>숙박지원금</label>
                    <input className="form-input" type="number" value={lgRow.support_amt||0} onChange={e=>setLgRow(r=>({...r,support_amt:e.target.value}))}/>
                  </div>
                </div>
                <button className="btn-add-row" onClick={addLodge} style={{marginBottom:'8px'}}>+ 객실 추가</button>
                <div className="list-box">
                  <div className="list-box-header" style={{gridTemplateColumns:'1fr 1fr 80px 80px 40px'}}>
                    <span>숙소</span><span>객실</span><span>금액</span><span>부담금</span><span/>
                  </div>
                  {lodges.length === 0 && <div className="list-box-empty">배정된 객실 없음</div>}
                  {lodges.map(l=>(
                    <div key={l.id} className="list-box-row" style={{gridTemplateColumns:'1fr 1fr 80px 80px 40px'}}>
                      <span>{l.lodge_name||'-'}</span>
                      <span>{l.room_name||'-'}</span>
                      <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px'}}>{(l.room_price||0).toLocaleString()}</span>
                      <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px'}}>{(l.burden||0).toLocaleString()}</span>
                      <button className="icon-btn" onClick={()=>delLodge(l.id)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 결제 · 수수료 */}
              <div className="form-section">
                <div className="form-section-label">결제 · 수수료</div>
                <div className="form-grid form-grid-3" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>1인 판매가 <span className="req">*</span></label>
                    <input className="form-input" type="number" value={form.price} onChange={e=>inp('price',e.target.value)} placeholder="원"/>
                  </div>
                  <div className="form-field">
                    <label>할인금액</label>
                    <input className="form-input" type="number" value={form.discount} onChange={e=>inp('discount',e.target.value)}/>
                  </div>
                  <div className="form-field">
                    <label>픽업비 <span className="auto">합산</span></label>
                    <input className="form-input auto-fill" type="number" value={form.pickup_fee} onChange={e=>inp('pickup_fee',e.target.value)}/>
                  </div>
                </div>
                <div className="form-grid form-grid-2" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>고객결제처 <span className="req">*</span></label>
                    <select className="form-select" value={form.payto||''} onChange={e=>onPaytoChange(e.target.value)}>
                      <option value="">선택</option>
                      {platforms.map(p=><option key={p.id} value={p.name}>{p.name} ({p.type})</option>)}
                      <option value="계좌이체">계좌이체</option>
                      <option value="현금">현금</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>유입처</label>
                    <select className="form-select" value={form.inflow||''} onChange={e=>inp('inflow',e.target.value)}>
                      <option value="">선택</option>
                      {INFLOW_OPTS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-grid form-grid-2" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>플랫폼명</label>
                    <select className="form-select" value={form.platform_name||''} onChange={e=>{
                      const p = platforms.find(x=>x.name===e.target.value&&x.type==='플랫폼')
                      setForm(f=>({...f, platform_name:e.target.value, plat_fee: p ? (f.pax>=10?p.fee_grp:p.fee_ind) : f.plat_fee}))
                    }}>
                      <option value="">선택</option>
                      {platforms.filter(p=>p.type==='플랫폼').map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>플랫폼 수수료(%) <span className="auto">자동</span></label>
                    <input className="form-input fee-input" type="number" value={form.plat_fee||0} onChange={e=>inp('plat_fee',e.target.value)}/>
                  </div>
                </div>
                <div className="form-grid form-grid-2" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>여행사명</label>
                    <select className="form-select" value={form.agency_name||''} onChange={e=>{
                      const a = platforms.find(x=>x.name===e.target.value&&x.type==='여행사')
                      setForm(f=>({...f, agency_name:e.target.value, ag_fee: a ? (f.pax>=10?a.fee_grp:a.fee_ind) : f.ag_fee}))
                    }}>
                      <option value="">선택</option>
                      {platforms.filter(p=>p.type==='여행사').map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>여행사 수수료(%) <span className="auto">자동</span></label>
                    <input className="form-input fee-input" type="number" value={form.ag_fee||0} onChange={e=>inp('ag_fee',e.target.value)}/>
                  </div>
                </div>
                <div className="form-grid form-grid-2" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>운영구분 <span className="req">*</span></label>
                    <select className="form-select" value={form.op} onChange={e=>inp('op',e.target.value)}>
                      {OP_OPTS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>사업명</label>
                    <select className="form-select" value={form.biz_id||''} onChange={e=>inp('biz_id',e.target.value)} disabled={form.op!=='사업비'}>
                      <option value="">선택</option>
                      {bizList.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-field" style={{marginBottom:'10px'}}>
                  <label>총 결제금액 <span className="auto">자동계산</span></label>
                  <input className="form-input total" value={(form.total||0).toLocaleString()+'원'} readOnly/>
                </div>
                <div className="form-field">
                  <label>비고</label>
                  <input className="form-input" value={form.memo||''} onChange={e=>inp('memo',e.target.value)}/>
                </div>
              </div>
            </>
          )}

          {/* ── 탭1: 픽업정보 */}
          {tab === 1 && (
            <div className="form-section">
              <div className="form-section-label">픽업 정보</div>
              <div className="form-grid form-grid-3" style={{marginBottom:'8px'}}>
                <div className="form-field">
                  <label>픽업구분</label>
                  <select className="form-select" value={pkRow.pickup_type} onChange={e=>setPkRow(r=>({...r,pickup_type:e.target.value}))}>
                    <option value="픽업">픽업</option>
                    <option value="드랍">드랍</option>
                    <option value="픽/드랍">픽/드랍</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>픽업수행자</label>
                  <select className="form-select" value={pkRow.driver_id||''} onChange={e=>setPkRow(r=>({...r,driver_id:e.target.value}))}>
                    <option value="">선택</option>
                    {drivers.map(d=><option key={d.id} value={d.id}>{d.name} ({d.affil})</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>픽업비(원)</label>
                  <input className="form-input" type="number" value={pkRow.pickup_fee||0} onChange={e=>setPkRow(r=>({...r,pickup_fee:e.target.value}))}/>
                </div>
              </div>
              <button className="btn-add-row" onClick={addPickup} style={{marginBottom:'8px'}}>+ 추가</button>
              <div className="list-box">
                <div className="list-box-header" style={{gridTemplateColumns:'1fr 1fr 80px 40px'}}>
                  <span>구분</span><span>수행자</span><span>픽업비</span><span/>
                </div>
                {pickups.length === 0 && <div className="list-box-empty">등록된 픽업 없음</div>}
                {pickups.map(p=>(
                  <div key={p.id} className="list-box-row" style={{gridTemplateColumns:'1fr 1fr 80px 40px'}}>
                    <span style={{fontSize:'12px'}}>{p.pickup_type}</span>
                    <span style={{fontSize:'12px'}}>{p.drivers?.name||'-'}</span>
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:'11px'}}>{(p.pickup_fee||0).toLocaleString()}</span>
                    <button className="icon-btn" onClick={()=>delPickup(p.id)}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{marginTop:'10px',textAlign:'right',fontSize:'12px',color:'var(--text-muted)'}}>
                픽업비 합계: <span style={{color:'var(--accent)',fontWeight:700}}>{(form.pickup_fee||0).toLocaleString()}원</span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {isEdit && <button className="btn-danger" onClick={del}>삭제</button>}
          <button className="btn-outline" onClick={onClose}>닫기</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 예약 목록 페이지
// ══════════════════════════════════════════════════════
export default function ReservationsPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const fromDashboard = searchParams.get('from') === 'dashboard'

  const [reservations, setReservations] = useState([])
  const [zones,     setZones]     = useState([])
  const [packages,  setPackages]  = useState([])
  const [platforms, setPlatforms] = useState([])
  const [drivers,   setDrivers]   = useState([])
  const [bizList,   setBizList]   = useState([])
  const [loading,   setLoading]   = useState(true)

  const [search,    setSearch]    = useState('')
  const [filterType,setFilterType]= useState(searchParams.get('type')||'')
  const [filterMonth,setFilterMonth] = useState('')

  const [modal,    setModal]    = useState(null)  // null | { mode:'new', date } | { mode:'edit', data }

  const load = useCallback(async () => {
    setLoading(true)
    const [resR, zoneR, pkgR, platR, drvR, bizR] = await Promise.all([
      supabase.from('reservations').select('*').order('date', { ascending: false }).order('no', { ascending: false }),
      supabase.from('zones').select('*').order('code'),
      supabase.from('packages').select('*, package_programs(vendor_key)').order('name'),
      supabase.from('platforms').select('*').order('type').order('name'),
      supabase.from('drivers').select('*').order('name'),
      supabase.from('biz').select('*').order('name'),
    ])
    setReservations(resR.data || [])
    setZones(zoneR.data || [])
    setPackages(pkgR.data || [])
    setPlatforms(platR.data || [])
    setDrivers(drvR.data || [])
    setBizList(bizR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // URL 파라미터로 모달 자동 열기
  useEffect(() => {
    const newParam  = searchParams.get('new')
    const dateParam = searchParams.get('date')
    const noParam   = searchParams.get('no')
    if (newParam === '1') {
      setModal({ mode:'new', date: dateParam || new Date().toISOString().slice(0,10) })
    } else if (noParam) {
      // no 파라미터가 있으면 해당 예약 모달 열기 (데이터 로드 후)
      setModal({ mode:'openByNo', no: noParam })
    }
  }, [searchParams])

  // no로 모달 열기
  useEffect(() => {
    if (modal?.mode === 'openByNo' && reservations.length > 0) {
      const r = reservations.find(x => x.no === modal.no)
      if (r) setModal({ mode:'edit', data: r })
    }
  }, [modal, reservations])

  // 필터링
  const filtered = reservations.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.customer?.toLowerCase().includes(q) ||
      r.no?.includes(q) ||
      r.package_name?.toLowerCase().includes(q)
    const matchType  = !filterType  || r.type === filterType
    const matchMonth = !filterMonth || r.date?.startsWith(filterMonth)
    return matchSearch && matchType && matchMonth
  })

  function openNew() {
    setModal({ mode:'new', date: new Date().toISOString().slice(0,10) })
  }

  function openEdit(r) { setModal({ mode:'edit', data: r }) }

  function closeModal() {
    setModal(null)
    if (fromDashboard) router.replace('/dashboard')
    else router.replace('/dashboard/reservations')
  }
  function onSaved() { setModal(null); load(); if (fromDashboard) router.replace('/dashboard'); else router.replace('/dashboard/reservations') }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'300px',color:'var(--text-muted)'}}>로딩 중…</div>
  )

  return (
    <div>
      {/* 검색·필터 바 */}
      <div className="search-bar">
        <input className="search-input" placeholder="고객명, 예약번호, 패키지명 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="filter-select" value={filterType} onChange={e=>setFilterType(e.target.value)}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <input type="month" className="filter-select" value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{width:'140px'}}/>
        <button className="btn-primary" onClick={openNew}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          예약 등록
        </button>
      </div>

      {/* 요약 카운트 */}
      <div style={{display:'flex',gap:'8px',marginBottom:'14px',flexWrap:'wrap'}}>
        {Object.entries(STATUS_LABEL).map(([type,label])=>{
          const cnt = reservations.filter(r=>r.type===type).length
          return (
            <div key={type} onClick={()=>setFilterType(filterType===type?'':type)} style={{cursor:'pointer',padding:'4px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background: filterType===type ? 'rgba(78,205,196,.15)' : 'var(--navy2)',border:`1px solid ${filterType===type?'var(--accent)':'var(--border2)'}`,color: filterType===type?'var(--accent)':'var(--text-secondary)'}}>
              <span className={`badge ${type}`} style={{marginRight:'6px'}}>{label}</span>{cnt}
            </div>
          )
        })}
        <div style={{marginLeft:'auto',fontSize:'12px',color:'var(--text-muted)',alignSelf:'center'}}>
          {filtered.length}건 표시 / 전체 {reservations.length}건
        </div>
      </div>

      {/* 목록 */}
      <div className="list-card">
        <div className="list-header" style={{gridTemplateColumns:'60px 80px 90px 1fr 80px 70px 90px 100px 70px 60px'}}>
          <span>NO</span><span>상태</span><span>날짜</span><span>고객명 / 패키지</span><span>구역</span><span>인원</span><span>총금액</span><span>결제처</span><span>운영</span><span>정산</span>
        </div>
        {filtered.length === 0 && (
          <div style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>예약 없음</div>
        )}
        {filtered.map(r => (
          <div key={r.no} className="list-row" style={{gridTemplateColumns:'60px 80px 90px 1fr 80px 70px 90px 100px 70px 60px'}} onClick={()=>openEdit(r)}>
            <span className="no-col">#{r.no}</span>
            <span><span className={`badge ${r.type}`}>{STATUS_LABEL[r.type]}</span></span>
            <span style={{fontSize:'12px',fontFamily:'DM Mono,monospace',color:'var(--text-secondary)'}}>{r.date}</span>
            <div>
              <div style={{fontWeight:500}}>{r.customer}</div>
              <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'2px'}}>{r.package_name||'-'}</div>
            </div>
            <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{r.zone_code||'-'}</span>
            <span style={{fontSize:'13px'}}>{r.pax}명</span>
            <span style={{fontFamily:'DM Mono,monospace',fontSize:'12px'}}>{(r.total||0).toLocaleString()}</span>
            <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>{r.payto||'-'}</span>
            <span style={{fontSize:'11px',padding:'2px 6px',borderRadius:'4px',background: r.op==='사업비'?'rgba(123,104,238,.1)':'rgba(78,205,196,.08)',color: r.op==='사업비'?'var(--purple)':'var(--text-muted)',fontWeight:600}}>{r.op}</span>
            <span style={{fontSize:'11px',color: r.settle_status==='settled'?'var(--green)':'var(--amber)',fontWeight:600}}>{r.settle_status==='settled'?'완료':'미정산'}</span>
          </div>
        ))}
      </div>

      {/* 모달 */}
      {modal && modal.mode !== 'openByNo' && (
        <ReservationModal
          key={modal.mode === 'new' ? 'new' : modal.data?.no}
          editData={modal.mode === 'edit' ? modal.data : null}
          initDate={modal.mode === 'new' ? modal.date : undefined}
          onClose={closeModal}
          onSaved={onSaved}
          zones={zones}
          packages={packages}
          platforms={platforms}
          drivers={drivers}
          bizList={bizList}
        />
      )}
    </div>
  )
}
