'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams, useRouter } from 'next/navigation'
import { formatDateTyping, formatMonthTyping } from '@/lib/date-input'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const INFLOW_OPTS  = ['플랫폼','여행사','직접']
const OP_OPTS      = ['일반','사업비']
const RESERVATION_LIST_GRID = '60px 78px 94px minmax(150px,1.05fr) minmax(150px,1fr) 74px 64px 104px 112px 72px 72px'
const VENDOR_CHECK_GRID = '44px minmax(92px, 1fr) minmax(118px, 1fr) 88px 96px 86px minmax(110px, 1.15fr) 88px'
const CENTER_CELL = { display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', width:'100%' }
const RIGHT_CELL = { display:'flex', alignItems:'center', justifyContent:'flex-end', textAlign:'right', width:'100%' }
const NOWRAP_CELL = { overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }
const COMPACT_ACTION_BUTTON = { display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:'78px', whiteSpace:'nowrap' }

// ── 금액 계산
function calcTotal(price, pax, discount, pickupFee, burden) {
  return (Number(price)||0) * (Number(pax)||0)
    - (Number(discount)||0)
    + (Number(pickupFee)||0)
    + (Number(burden)||0)
}

function calcRoomPrice(room, pax) {
  const unitPrice = Number(room?.price) || 0
  return (room?.price_type || 'per_room') === 'per_person'
    ? unitPrice * (Number(pax) || 0)
    : unitPrice
}

function priceTypeLabel(type) {
  return type === 'per_person' ? '인원당' : '객실당'
}

function StatusQuickPanel({ title, summary, value, options, onChange, hint, disabledOptions = [] }) {
  const disabled = new Set(disabledOptions)
  return (
    <div style={{
      display:'flex',
      alignItems:'center',
      justifyContent:'space-between',
      gap:'10px',
      padding:'10px 12px',
      marginBottom:'10px',
      border:'1px solid var(--border2)',
      borderRadius:'8px',
      background:'rgba(10,31,48,.35)',
    }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:'12px', fontWeight:700, color:'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'3px', lineHeight:1.35 }}>{summary}</div>
        {hint && <div style={{ fontSize:'11px', color:'var(--amber)', marginTop:'4px', lineHeight:1.35 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', flexWrap:'wrap', gap:'6px' }}>
        {options.map(option => {
          const active = value === option
          const isDisabled = disabled.has(option)
          return (
            <button
              key={option}
              type="button"
              className={active ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
              disabled={isDisabled}
              onClick={() => onChange(option)}
              style={{
                minWidth:'74px',
                height:'30px',
                opacity:isDisabled ? .45 : 1,
                whiteSpace:'nowrap',
              }}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function emptyLodgeRow() {
  return {
    lodge_vendor_id:'', lodge_id:'', lodge_name:'', room_name:'',
    room_price:0, price_type:'per_room',
    support_amt:0, support_by:'', burden:0, checked:false, note:'',
  }
}

function lodgePayload(row, reservationNo) {
  const burden = (Number(row.room_price)||0) - (Number(row.support_amt)||0)
  const { id, lodge_vendor_id, lodge_id, ...payload } = row
  return {
    ...payload,
    reservation_no: reservationNo,
    price_type: payload.price_type || 'per_room',
    burden: burden > 0 ? burden : 0,
  }
}

// ══════════════════════════════════════════════════════
// 예약 모달
// ══════════════════════════════════════════════════════
function nextDay(ds) {
  const d = new Date(ds); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10)
}

function ReservationModal({ editData, initDate, onClose, onSaved, zones, packages, platforms, drivers, bizList, lodgeVendors }) {
  const router = useRouter()
  const isEdit  = !!editData
  const baseDate = initDate || new Date().toISOString().slice(0,10)

  const EMPTY = {
    no:'', type:'confirmed', date: baseDate, end_date: nextDay(baseDate),
    zone_code:'', package_name:'', customer:'', tel:'', pax:1,
    price:0, discount:0, pickup_fee:0, burden:0, total:0,
    payto:'', inflow:'', platform_name:'', plat_fee:0, agency_name:'', ag_fee:0,
    op:'일반', biz_id:'', settle_status:'unsettled', memo:'',
    reservation_status:'상담중', payment_status:'미결제', payment_type:'전화예약미결제',
    lodging_status:'해당없음', pickup_status:'해당없음',
  }

  const [tab,    setTab]    = useState(0)
  const [form,   setForm]   = useState(isEdit ? { ...EMPTY, ...editData } : { ...EMPTY })
  const [pickups, setPickups] = useState([])   // reservation_pickup rows
  const [lodges,  setLodges]  = useState([])   // lodge_confirms rows
  const [vendorConfirms, setVendorConfirms] = useState([])
  const [packagePrograms, setPackagePrograms] = useState([])
  const [sameDayEvents, setSameDayEvents] = useState([])
  const [sameDayReservations, setSameDayReservations] = useState([])
  const [vendorCheckLoading, setVendorCheckLoading] = useState(false)
  const [selectedVendorKeys, setSelectedVendorKeys] = useState(new Set())
  const [readiness, setReadiness] = useState(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [telegramSending, setTelegramSending] = useState(false)
  const [vendorReplyRefreshing, setVendorReplyRefreshing] = useState(false)
  const [notice, setNotice] = useState(null)
  const noticeTimer = useRef(null)
  const [saving,  setSaving]  = useState(false)

  // pickup form row
  const [pkRow, setPkRow] = useState({ pickup_type:'픽업', driver_id:'', pickup_fee:0 })

  // lodge form row
  const [lgRow, setLgRow] = useState(emptyLodgeRow)

  const selectedLodgeVendor = lodgeVendors.find(v => v.id === lgRow.lodge_vendor_id)
  const lodgeSpaces = selectedLodgeVendor?.lodges || []
  const selectedLodgeSpace = lodgeSpaces.find(l => l.id === lgRow.lodge_id)
  const lodgeRooms = selectedLodgeSpace?.rooms || []

  // 편집 시 관련 데이터 로드
  useEffect(() => {
    if (!isEdit) return
    async function loadRelated() {
      const [pkR, lgR] = await Promise.all([
        supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', editData.no).or('is_deleted.is.null,is_deleted.eq.false'),
        supabase.from('lodge_confirms').select('*').eq('reservation_no', editData.no).or('is_deleted.is.null,is_deleted.eq.false'),
      ])
      setPickups(pkR.data || [])
      setLodges(lgR.data || [])
    }
    loadRelated()
  }, [isEdit, editData?.no])

  useEffect(() => {
    if (!isEdit || !form.no) return
    refreshReadiness(false)
  }, [isEdit, form.no])

  useEffect(() => {
    async function loadVendorChecks() {
      const pkg = packages.find(p => p.name === form.package_name)
      if (!pkg?.id) {
        setPackagePrograms([])
        setVendorConfirms([])
        setSameDayEvents([])
        setSameDayReservations([])
        return
      }

      setVendorCheckLoading(true)
      const [programRes, confirmRes, reservationRes, eventRes] = await Promise.all([
        supabase
          .from('package_programs')
          .select('id, vendor_key, prog_name, sort_order, vendors(key,name,color)')
          .eq('package_id', pkg.id)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('sort_order'),
        isEdit && form.no
          ? supabase.from('vendor_confirms').select('*').eq('reservation_no', form.no).or('is_deleted.is.null,is_deleted.eq.false')
          : Promise.resolve({ data: [], error: null }),
        form.date
          ? supabase.from('reservations').select('no,date,customer,package_name,pax,type,reservation_status').eq('date', form.date).or('is_deleted.is.null,is_deleted.eq.false')
          : Promise.resolve({ data: [], error: null }),
        form.date
          ? supabase.from('timetable_events').select('*').eq('date', form.date).or('is_deleted.is.null,is_deleted.eq.false')
          : Promise.resolve({ data: [], error: null }),
      ])

      setPackagePrograms(programRes.data || [])
      setVendorConfirms(confirmRes.data || [])
      setSameDayReservations((reservationRes.data || []).filter(r => r.no !== form.no))
      setSameDayEvents(eventRes.data || [])
      setVendorCheckLoading(false)
    }
    loadVendorChecks()
  }, [form.package_name, form.date, form.no, isEdit, packages])

  const inp = (k,v) => setForm(f => {
    const next = { ...f, [k]: v }
    // 자동계산
    next.total = calcTotal(next.price, next.pax, next.discount, next.pickup_fee, next.burden)
    return next
  })

  function onPaxChange(value) {
    inp('pax', value)
    setLgRow(r => {
      if (r.price_type !== 'per_person' || !r.room_name) return r
      const room = lodgeRooms.find(x => x.name === r.room_name)
      return { ...r, room_price: calcRoomPrice(room, value) }
    })
  }

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

  async function insertLodgeRows(rows) {
    const { error } = await supabase.from('lodge_confirms').insert(rows)
    if (!error) return null
    if (error.code === '42703' && error.message?.includes('price_type')) {
      const legacyRows = rows.map(({ price_type, ...row }) => row)
      const retry = await supabase.from('lodge_confirms').insert(legacyRows)
      return retry.error || null
    }
    return error
  }

  async function findLodgeConflict(row, { skipLocal = false } = {}) {
    if (!form.date || !row.lodge_name || !row.room_name) return null

    if (!skipLocal) {
      const localConflict = lodges.some(l =>
        l.lodge_name === row.lodge_name &&
        l.room_name === row.room_name &&
        l.id !== row.id
      )
      if (localConflict) return `${form.date}에 이미 추가된 객실입니다.`
    }

    let q = supabase
      .from('reservations')
      .select('no')
      .eq('date', form.date)
      .neq('type', 'cancelled')
    if (form.no) q = q.neq('no', form.no)

    const { data: sameDateReservations, error: reservationError } = await q
    if (reservationError) return `예약 중복 확인 실패: ${reservationError.message}`

    const reservationNos = (sameDateReservations || []).map(r => r.no).filter(Boolean)
    if (!reservationNos.length) return null

    const { data: conflicts, error: lodgeError } = await supabase
      .from('lodge_confirms')
      .select('id')
      .in('reservation_no', reservationNos)
      .eq('lodge_name', row.lodge_name)
      .eq('room_name', row.room_name)
      .limit(1)

    if (lodgeError) return `객실 중복 확인 실패: ${lodgeError.message}`
    return conflicts?.length ? `${form.date}에 이미 예약된 객실입니다.` : null
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
      reservation_status: form.reservation_status || '상담중',
      payment_status: form.payment_status || '미결제',
      payment_type: form.payment_type || '전화예약미결제',
      lodging_status: form.lodging_status || '해당없음',
      pickup_status: form.pickup_status || '해당없음',
    }

    let no = form.no
    if (!isEdit) {
      // 예약번호 자동생성
      const { data: last } = await supabase.from('reservations').select('no').order('no', { ascending: false }).limit(1)
      no = last?.length ? String(parseInt(last[0].no,10)+1).padStart(3,'0') : '001'
      const { error } = await supabase.from('reservations').insert({ ...payload, no })
      if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }

      const pendingLodges = lodges
        .filter(l => String(l.id || '').startsWith('tmp-'))
        .map(l => lodgePayload(l, no))
      if (pendingLodges.length) {
        for (const lodge of pendingLodges) {
          const conflict = await findLodgeConflict(lodge, { skipLocal: true })
          if (conflict) {
            alert(conflict)
            setSaving(false)
            return
          }
        }
        const lodgeError = await insertLodgeRows(pendingLodges)
        if (lodgeError) {
          alert('객실 저장 실패: ' + lodgeError.message)
          setSaving(false)
          return
        }
      }

      // 패키지 업체 자동으로 vendor_confirms 생성
      const pkg = packages.find(p => p.name === payload.package_name)
      if (pkg) {
        const { data: progs } = await supabase.from('package_programs').select('vendor_key, prog_name').eq('package_id', pkg.id).or('is_deleted.is.null,is_deleted.eq.false')
        const uniqueKeys = [...new Set((progs||[]).map(pr => pr.vendor_key))]
        if (uniqueKeys.length) {
          await supabase.from('vendor_confirms').insert(
            uniqueKeys.map(vk => {
              const names = (progs || []).filter(pr => pr.vendor_key === vk).map(pr => pr.prog_name).filter(Boolean)
              return {
                reservation_no: no,
                vendor_key: vk,
                vendor_name: null,
                program_name: names.join(', ') || null,
                request_date: payload.date,
                request_people_count: payload.pax,
                day_confirmed_people_count: dayConfirmedPeople,
                day_pending_people_count: dayPendingPeople,
                day_max_expected_people_count: dayMaxExpectedPeople,
                send_status: '미발송',
                reply_status: '회신대기',
                final_decision: '미회신',
                status: 'wait',
              }
            })
          )
        }
      }
    } else {
      for (const lodge of lodges) {
        const conflict = await findLodgeConflict(lodge, { skipLocal: true })
        if (conflict) {
          alert(conflict)
          setSaving(false)
          return
        }
      }
      const { error } = await supabase.from('reservations').update(payload).eq('no', no)
      if (error) { alert('수정 실패: ' + error.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
  }

  // 삭제
  async function del() {
    if (!confirm(`예약 #${form.no} (${form.customer})을 삭제하시겠습니까?`)) return
    await supabase.from('vendor_confirms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('reservation_no', form.no)
    await supabase.from('lodge_confirms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('reservation_no', form.no)
    await supabase.from('reservation_pickup').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('reservation_no', form.no)
    await supabase.from('reservations').update({ is_deleted: true, deleted_at: new Date().toISOString(), reservation_status: '취소', type: 'cancelled' }).eq('no', form.no)
    onSaved()
  }

  // 픽업 추가
  async function addPickup() {
    if (!isEdit) { alert('예약을 먼저 저장하세요.'); return }
    await supabase.from('reservation_pickup').insert({ reservation_no: form.no, pickup_type: pkRow.pickup_type, driver_id: pkRow.driver_id || null, pickup_fee: Number(pkRow.pickup_fee)||0 })
    const { data } = await supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', form.no).or('is_deleted.is.null,is_deleted.eq.false')
    setPickups(data || [])
    setPkRow({ pickup_type:'픽업', driver_id:'', pickup_fee:0 })
    // 픽업비 합계 업데이트
    const total_pickup = (data||[]).reduce((s,r)=>s+(r.pickup_fee||0),0)
    inp('pickup_fee', total_pickup)
  }

  async function delPickup(id) {
    await supabase.from('reservation_pickup').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
    const { data } = await supabase.from('reservation_pickup').select('*, drivers(name)').eq('reservation_no', form.no).or('is_deleted.is.null,is_deleted.eq.false')
    setPickups(data || [])
    const total_pickup = (data||[]).reduce((s,r)=>s+(r.pickup_fee||0),0)
    inp('pickup_fee', total_pickup)
  }

  // 숙소 배정 추가
  async function addLodge() {
    if (!lgRow.lodge_name || !lgRow.room_name) { alert('숙박공간과 객실을 선택하세요.'); return }
    const conflict = await findLodgeConflict(lgRow)
    if (conflict) { alert(conflict); return }

    if (!isEdit) {
      const pending = lodgePayload(lgRow, '')
      setLodges(list => [...list, { ...pending, id: `tmp-${Date.now()}` }])
      setLgRow(emptyLodgeRow())
      return
    }

    const error = await insertLodgeRows([lodgePayload(lgRow, form.no)])
    if (error) { alert('객실 저장 실패: ' + error.message); return }
    const { data, error: loadError } = await supabase.from('lodge_confirms').select('*').eq('reservation_no', form.no).or('is_deleted.is.null,is_deleted.eq.false')
    if (loadError) { alert('객실 목록 조회 실패: ' + loadError.message); return }
    setLodges(data || [])
    setLgRow(emptyLodgeRow())
  }

  async function delLodge(id) {
    if (String(id || '').startsWith('tmp-')) {
      setLodges(list => list.filter(l => l.id !== id))
      return
    }
    await supabase.from('lodge_confirms').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id)
    const { data } = await supabase.from('lodge_confirms').select('*').eq('reservation_no', form.no).or('is_deleted.is.null,is_deleted.eq.false')
    setLodges(data || [])
  }

  const dayConfirmedPeople = sameDayReservations
    .filter(r => r.type === 'confirmed' || r.reservation_status === '예약확정')
    .reduce((sum, r) => sum + (Number(r.pax) || 0), 0)
  const dayPendingPeople = sameDayReservations
    .filter(r => r.type === 'pending' || r.type === 'consult' || ['상담중', '가능여부확인중', '조정필요'].includes(r.reservation_status))
    .reduce((sum, r) => sum + (Number(r.pax) || 0), 0)
  const dayMaxExpectedPeople = dayConfirmedPeople + dayPendingPeople + (Number(form.pax) || 0)

  const vendorCheckRows = Object.values(packagePrograms.reduce((map, program) => {
    const key = program.vendor_key || 'unknown'
    if (!map[key]) {
      const confirm = vendorConfirms.find(c => c.vendor_key === key)
      map[key] = {
        vendor_key: key,
        vendor_name: confirm?.vendor_name || program.vendors?.name || key,
        programs: [],
        confirm,
        events: sameDayEvents.filter(ev => ev.vendor_key === key),
      }
    }
    if (program.prog_name && !map[key].programs.includes(program.prog_name)) map[key].programs.push(program.prog_name)
    return map
  }, {}))

  useEffect(() => {
    if (!vendorCheckRows.length) {
      setSelectedVendorKeys(new Set())
      return
    }
    setSelectedVendorKeys(prev => {
      const available = new Set(vendorCheckRows.map(row => row.vendor_key))
      const kept = [...prev].filter(key => available.has(key))
      return new Set(kept.length ? kept : [...available])
    })
  }, [vendorCheckRows.map(row => row.vendor_key).join('|')])

  function vendorReplyLabel(row) {
    return row.confirm?.reply_status || row.confirm?.status || '회신대기'
  }

  function vendorSendLabel(row) {
    return row.confirm?.send_status || '미발송'
  }

  function vendorDecision(row) {
    return row.confirm?.final_decision || '미회신'
  }

  function openVendorConfirmManager() {
    const qs = form.no ? `?q=${encodeURIComponent(form.no)}` : ''
    router.push(`/dashboard/vendor-confirms${qs}`)
  }

  function toggleVendorSelection(key) {
    setSelectedVendorKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function showNotice(type, title, message) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ type, title, message })
    noticeTimer.current = setTimeout(() => setNotice(null), 3600)
  }

  async function reloadVendorConfirms() {
    if (!form.no) return
    const { data } = await supabase
      .from('vendor_confirms')
      .select('*')
      .eq('reservation_no', form.no)
      .or('is_deleted.is.null,is_deleted.eq.false')
    setVendorConfirms(data || [])
    return data || []
  }

  async function refreshVendorReplies(showMessage = false) {
    if (!form.no) return
    setVendorReplyRefreshing(true)
    await reloadVendorConfirms()
    await refreshReadiness(false)
    setVendorReplyRefreshing(false)
    if (showMessage) {
      showNotice('success', '회신 상태 새로고침', '업체 회신 상태를 다시 불러왔습니다.')
    }
  }

  useEffect(() => {
    if (!isEdit || tab !== 1 || !form.no) return
    const timer = setInterval(() => {
      reloadVendorConfirms()
    }, 5000)
    return () => clearInterval(timer)
  }, [isEdit, tab, form.no])

  function confirmPayloadForRow(row, extra = {}) {
    return {
      reservation_no: form.no,
      vendor_key: row.vendor_key,
      vendor_name: row.vendor_name,
      program_name: row.programs.join(', ') || null,
      request_date: form.date || null,
      request_start_time: row.confirm?.request_start_time || null,
      request_end_time: row.confirm?.request_end_time || null,
      request_people_count: Number(form.pax) || null,
      day_confirmed_people_count: dayConfirmedPeople,
      day_pending_people_count: dayPendingPeople,
      day_max_expected_people_count: dayMaxExpectedPeople,
      same_day_schedule: row.events || [],
      send_status: row.confirm?.send_status || '미발송',
      reply_status: row.confirm?.reply_status || '회신대기',
      final_decision: row.confirm?.final_decision || '미회신',
      status: row.confirm?.status || 'wait',
      is_deleted: false,
      ...extra,
    }
  }

  async function bulkMarkVendorsPossible(scope = 'selected') {
    if (!isEdit || !form.no) {
      alert('예약을 먼저 저장하세요.')
      return
    }
    const rows = scope === 'all'
      ? vendorCheckRows
      : vendorCheckRows.filter(row => selectedVendorKeys.has(row.vendor_key))

    if (!rows.length) {
      alert('가능 처리할 업체를 선택하세요.')
      return
    }

    const replyMethod = prompt('확인 방법을 입력하세요. 예: 전화, 카카오톡, 문자, 대면/현장', '전화')
    if (replyMethod === null) return
    const confirmedBy = prompt('확인자를 입력하세요.', '') ?? ''
    const replyMemo = prompt('공통 메모를 입력하세요.', '') ?? ''
    const repliedAt = new Date().toISOString()

    setBulkConfirming(true)
    const payloads = rows.map(row => confirmPayloadForRow(row, {
      reply_status: '가능',
      manual_reply: true,
      reply_method: replyMethod || '전화',
      confirmed_by: confirmedBy || null,
      replied_at: repliedAt,
      reply_memo: replyMemo || null,
      final_decision: '확정 가능',
      status: 'ok',
    }))

    const { error } = await supabase
      .from('vendor_confirms')
      .upsert(payloads, { onConflict: 'reservation_no,vendor_key' })

    setBulkConfirming(false)
    if (error) {
      alert('업체 일괄 가능 처리 실패: ' + error.message)
      return
    }

    await reloadVendorConfirms()
    await refreshReadiness(true)
    alert(`${rows.length}개 업체를 수동 가능 처리했습니다.`)
  }

  const REPLIED_VENDOR_STATUSES = ['가능', '불가능', '시간조정 필요', '인원조정 필요', '보류']

  async function sendTelegramToSelectedVendors({ forceResend = false } = {}) {
    if (!isEdit || !form.no) {
      alert('예약을 먼저 저장하세요.')
      return
    }
    const rows = vendorCheckRows.filter(row => selectedVendorKeys.has(row.vendor_key))
    if (!rows.length) {
      alert('텔레그램 요청을 보낼 업체를 선택하세요.')
      return
    }

    if (forceResend) {
      const ok = confirm('선택한 업체에 다시 가능 여부를 요청할까요?\n\n기존 회신 상태는 회신대기로 변경되고, 업체가 다시 버튼으로 회신해야 합니다.')
      if (!ok) return
    }

    const pendingRows = forceResend
      ? rows
      : rows.filter(row => !REPLIED_VENDOR_STATUSES.includes(row.confirm?.reply_status))
    const skippedCount = forceResend ? 0 : rows.length - pendingRows.length

    if (!pendingRows.length) {
      showNotice('warning', '발송할 업체가 없습니다', '이미 회신을 받은 업체는 선택 재요청으로 다시 보낼 수 있습니다.')
      return
    }

    setTelegramSending(true)
    const payloads = pendingRows.map(row => confirmPayloadForRow(row, {
      send_status: forceResend || row.confirm?.send_status === '발송완료' ? '재발송필요' : row.confirm?.send_status || '미발송',
      reply_status: '회신대기',
      final_decision: '미회신',
      status: 'wait',
      manual_reply: false,
      reply_method: null,
      confirmed_by: null,
      replied_at: null,
      available_people_count: null,
      suggested_time: null,
      unavailable_reason: null,
      reply_memo: forceResend ? '정보 변경 또는 운영자 판단으로 재요청' : row.confirm?.reply_memo || null,
    }))

    const { data, error } = await supabase
      .from('vendor_confirms')
      .upsert(payloads, { onConflict: 'reservation_no,vendor_key' })
      .select('id,vendor_key')

    if (error) {
      setTelegramSending(false)
      showNotice('error', '텔레그램 요청 준비 실패', error.message)
      return
    }

    const ids = (data || []).map(row => row.id).filter(Boolean)
    const res = await fetch('/api/vendor-confirms/send-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    const result = await res.json().catch(() => ({}))
    setTelegramSending(false)
    await reloadVendorConfirms()

    if (!res.ok) {
      showNotice('error', '텔레그램 발송 실패', result.error || res.statusText)
      return
    }

    const failed = (result.results || []).filter(item => !item.ok)
    if (failed.length) {
      showNotice('warning', forceResend ? '일부 업체 재요청 실패' : '일부 업체 발송 실패', `${pendingRows.length - failed.length}개 발송완료 · ${failed.length}개 발송실패${skippedCount ? ` · 회신완료 ${skippedCount}개 제외` : ''}`)
      return
    }

    showNotice('success', forceResend ? '텔레그램 재요청 발송완료' : '텔레그램 요청 발송완료', `${pendingRows.length}개 업체에 가능 여부 확인 메시지를 보냈습니다.${skippedCount ? ` 회신완료 ${skippedCount}개는 제외했습니다.` : ''}`)
  }

  async function refreshReadiness(persist = false) {
    if (!form.no) return
    setReadinessLoading(true)
    const res = await fetch(`/api/reservations/${encodeURIComponent(form.no)}/readiness`, {
      method: persist ? 'POST' : 'GET',
    })
    const data = await res.json().catch(() => ({}))
    setReadinessLoading(false)
    if (!res.ok) {
      alert('확정 조건 확인 실패: ' + (data.error || res.statusText))
      return
    }
    setReadiness(data)
    if (data.reservation_status) {
      setForm(f => ({ ...f, reservation_status: data.reservation_status }))
    }
  }

  async function confirmReservation() {
    if (!form.no) return
    if (!confirm('고객에게 확정 안내 발송을 완료했고, 예약을 최종 확정하시겠습니까?')) return
    setReadinessLoading(true)
    const res = await fetch(`/api/reservations/${encodeURIComponent(form.no)}/confirm`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setReadinessLoading(false)
    if (!res.ok) {
      alert('예약확정 처리 실패: ' + (data.error || res.statusText))
      return
    }
    setForm(f => ({
      ...f,
      reservation_status: data.reservation_status,
      type: 'confirmed',
      customer_notice_sent_at: data.customer_notice_sent_at,
      confirmed_at: data.confirmed_at,
      confirmed_by: data.confirmed_by,
    }))
    await refreshReadiness(false)
    alert('예약확정 처리되었습니다.')
  }

  const filteredPkgs = form.zone_code
    ? packages.filter(p => p.zone_code === form.zone_code)
    : packages

  return (
    <div className="modal-overlay open" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{width:'820px', maxWidth:'calc(100vw - 32px)'}}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? `예약 수정 — #${form.no}` : '예약 등록'}</div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {notice && (
          <div
            style={{
              margin:'12px 20px 0',
              padding:'12px 14px',
              borderRadius:'8px',
              border:`1px solid ${notice.type === 'success' ? 'rgba(92,184,92,.35)' : notice.type === 'warning' ? 'rgba(247,201,72,.38)' : 'rgba(224,92,92,.38)'}`,
              background: notice.type === 'success' ? 'rgba(92,184,92,.12)' : notice.type === 'warning' ? 'rgba(247,201,72,.12)' : 'rgba(224,92,92,.12)',
              display:'grid',
              gridTemplateColumns:'20px 1fr auto',
              alignItems:'center',
              gap:'10px',
            }}
          >
            <span
              style={{
                width:'20px',
                height:'20px',
                borderRadius:'50%',
                display:'inline-flex',
                alignItems:'center',
                justifyContent:'center',
                fontSize:'12px',
                fontWeight:800,
                color:'var(--navy)',
                background: notice.type === 'success' ? 'var(--green)' : notice.type === 'warning' ? 'var(--amber)' : 'var(--red)',
              }}
            >
              {notice.type === 'success' ? '✓' : '!'}
            </span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text-primary)' }}>{notice.title}</div>
              <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>{notice.message}</div>
            </div>
            <button
              className="close-btn"
              style={{ width:'24px', height:'24px', fontSize:'16px' }}
              onClick={() => setNotice(null)}
              aria-label="알림 닫기"
            >
              ×
            </button>
          </div>
        )}

        {/* 탭 */}
        <div className="modal-tabs">
          <div className={`modal-tab${tab===0?' active':''}`} onClick={()=>setTab(0)}>기본정보 · 결제</div>
          <div className={`modal-tab${tab===1?' active':''}`} onClick={()=>setTab(1)}>업체 확인</div>
          <div className={`modal-tab${tab===2?' active':''}`} onClick={()=>setTab(2)}>픽업정보</div>
          <div className={`modal-tab${tab===3?' active':''}`} onClick={()=>setTab(3)}>확정 조건</div>
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
                    <label>예약 진행 상태</label>
                    <select className="form-select" value={form.reservation_status || '상담중'} onChange={e=>inp('reservation_status',e.target.value)}>
                      {['상담중','가능여부확인중','조정필요','확정가능','예약확정','취소','완료'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>예약날짜 <span className="req">*</span></label>
                    <input className="form-input" type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" value={form.date} onChange={e=>inp('date',formatDateTyping(e.target.value))}/>
                  </div>
                  <div className="form-field">
                    <label>체험종료</label>
                    <input className="form-input" type="text" inputMode="numeric" maxLength={10} placeholder="2026-05-09" value={form.end_date||''} onChange={e=>inp('end_date',formatDateTyping(e.target.value))}/>
                  </div>
                </div>
                <div className="form-grid form-grid-3" style={{marginBottom:'10px'}}>
                  <div className="form-field">
                    <label>결제 상태</label>
                    <select className="form-select" value={form.payment_status || '미결제'} onChange={e=>inp('payment_status',e.target.value)}>
                      {['미결제','선결제완료','후결제예정','일부결제','결제완료','환불필요','환불완료'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>숙소 상태</label>
                    <select className="form-select" value={form.lodging_status || '해당없음'} onChange={e=>inp('lodging_status',e.target.value)}>
                      {['해당없음','배정필요','배정완료','확정완료'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>픽업 상태</label>
                    <select className="form-select" value={form.pickup_status || '해당없음'} onChange={e=>inp('pickup_status',e.target.value)}>
                      {['해당없음','확정필요','확정완료'].map(v => <option key={v}>{v}</option>)}
                    </select>
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
                    <input className="form-input" type="number" min="1" value={form.pax} onChange={e=>onPaxChange(e.target.value)} placeholder="명"/>
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
                <StatusQuickPanel
                  title="숙소 확정 상태"
                  summary={`배정 객실 ${lodges.length}개 · 현재 상태 ${form.lodging_status || '해당없음'}`}
                  value={form.lodging_status || '해당없음'}
                  options={['해당없음', '배정필요', '배정완료', '확정완료']}
                  disabledOptions={lodges.length === 0 ? ['배정완료', '확정완료'] : []}
                  hint={lodges.length === 0 ? '숙박이 없는 예약은 해당없음, 숙박이 있으면 객실 추가 후 배정완료/확정완료를 선택하세요.' : '상태 변경 후 하단 저장 버튼을 눌러야 반영됩니다.'}
                  onChange={value => inp('lodging_status', value)}
                />
                <div className="form-grid form-grid-4" style={{marginBottom:'8px',gap:'8px'}}>
                  <div className="form-field">
                    <label>숙박업체</label>
                    <select className="form-select" value={lgRow.lodge_vendor_id||''} onChange={e=>setLgRow(r=>({
                      ...r,
                      lodge_vendor_id:e.target.value,
                      lodge_id:'',
                      lodge_name:'',
                      room_name:'',
                      room_price:0,
                      price_type:'per_room',
                    }))}>
                      <option value="">선택</option>
                      {lodgeVendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>숙박공간</label>
                    <select className="form-select" value={lgRow.lodge_id||''} disabled={!lgRow.lodge_vendor_id} onChange={e=>{
                      const space = lodgeSpaces.find(s=>s.id===e.target.value)
                      setLgRow(r=>({
                        ...r,
                        lodge_id:e.target.value,
                        lodge_name:space?.name||'',
                        room_name:'',
                        room_price:0,
                        price_type:'per_room',
                      }))
                    }}>
                      <option value="">선택</option>
                      {lodgeSpaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>객실</label>
                    <select className="form-select" value={lgRow.room_name||''} disabled={!lgRow.lodge_id} onChange={e=>{
                      const room = lodgeRooms.find(x=>x.name===e.target.value)
                      setLgRow(r=>({
                        ...r,
                        room_name:room?.name||'',
                        room_price:calcRoomPrice(room, form.pax),
                        price_type:room?.price_type || 'per_room',
                      }))
                    }}>
                      <option value="">선택</option>
                      {lodgeRooms.map((room,i)=><option key={`${room.name}-${i}`} value={room.name}>{room.name} · {(room.price||0).toLocaleString()}원 ({priceTypeLabel(room.price_type)})</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>객실금액 ({priceTypeLabel(lgRow.price_type)})</label>
                    <input className="form-input auto-fill" type="number" value={lgRow.room_price||0} onChange={e=>setLgRow(r=>({...r,room_price:e.target.value}))}/>
                  </div>
                </div>
                <div className="form-grid form-grid-2" style={{marginBottom:'8px',gap:'8px'}}>
                  <div className="form-field">
                    <label>숙박지원금</label>
                    <input className="form-input" type="number" value={lgRow.support_amt||0} onChange={e=>setLgRow(r=>({...r,support_amt:e.target.value}))}/>
                  </div>
                  <div className="form-field">
                    <label>비고</label>
                    <input className="form-input" value={lgRow.note||''} onChange={e=>setLgRow(r=>({...r,note:e.target.value}))}/>
                  </div>
                </div>
                <button className="btn-add-row" onClick={addLodge} style={{marginBottom:'8px'}}>+ 객실 추가</button>
                <div className="list-box">
                  <div className="list-box-header" style={{gridTemplateColumns:'1fr 1fr 70px 80px 80px 40px'}}>
                    <span>숙소</span><span>객실</span><span>유형</span><span>금액</span><span>부담금</span><span/>
                  </div>
                  {lodges.length === 0 && <div className="list-box-empty">배정된 객실 없음</div>}
                  {lodges.map(l=>(
                    <div key={l.id} className="list-box-row" style={{gridTemplateColumns:'1fr 1fr 70px 80px 80px 40px'}}>
                      <span>{l.lodge_name||'-'}</span>
                      <span>{l.room_name||'-'}</span>
                      <span style={{fontSize:'11px',color:'var(--text-muted)'}}>{priceTypeLabel(l.price_type)}</span>
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


          {/* 업체 가능 여부 확인 */}
          {tab === 1 && (
            <div className="form-section">
              <div className="form-section-label">업체 가능 여부 확인</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', marginBottom:'12px', gap:'12px' }}>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', lineHeight:1.5, minWidth:0 }}>
                  이번 예약 {Number(form.pax)||0}명 · 당일 확정 {dayConfirmedPeople}명 · 상담/대기 {dayPendingPeople}명 · 최대 예상 {dayMaxExpectedPeople}명
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:'6px', flexWrap:'wrap', maxWidth:'520px' }}>
                  <button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={() => refreshVendorReplies(true)} disabled={!isEdit || vendorReplyRefreshing} title="텔레그램 버튼 회신 후 상태를 다시 불러오기">
                    {vendorReplyRefreshing ? '확인중' : '회신 새로고침'}
                  </button>
                  <button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={sendTelegramToSelectedVendors} disabled={!isEdit || telegramSending} title="체크한 업체에 텔레그램 가능 여부 요청">
                    {telegramSending ? '발송중' : '텔레그램 요청'}
                  </button>
                  <button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={() => sendTelegramToSelectedVendors({ forceResend: true })} disabled={!isEdit || telegramSending} title="시간, 장소, 인원 등 정보 변경 후 체크한 업체에 다시 요청">
                    선택 재요청
                  </button>
                  <button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={() => bulkMarkVendorsPossible('selected')} disabled={!isEdit || bulkConfirming} title="체크한 업체를 수동 가능 처리">
                    선택 가능처리
                  </button>
                  <button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={() => bulkMarkVendorsPossible('all')} disabled={!isEdit || bulkConfirming} title="전체 업체를 수동 가능 처리">
                    전체 가능처리
                  </button>
                  <button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={openVendorConfirmManager} title="업체 회신관리에서 보기">회신관리</button>
                </div>
              </div>

              {!form.package_name ? (
                <div className="list-box-empty">패키지를 먼저 선택하면 포함 업체가 표시됩니다.</div>
              ) : vendorCheckLoading ? (
                <div className="list-box-empty">업체 확인 정보를 불러오는 중입니다.</div>
              ) : vendorCheckRows.length === 0 ? (
                <div className="list-box-empty">선택한 패키지에 연결된 업체 프로그램이 없습니다.</div>
              ) : (
                <div className="list-box">
                  <div className="list-box-header" style={{gridTemplateColumns:VENDOR_CHECK_GRID}}>
                    <span style={CENTER_CELL}>선택</span><span>프로그램</span><span>업체</span><span style={CENTER_CELL}>발송</span><span style={CENTER_CELL}>회신</span><span style={CENTER_CELL}>판단</span><span>당일 업체 일정</span><span style={CENTER_CELL}>관리</span>
                  </div>
                  {vendorCheckRows.map(row => (
                    <div key={row.vendor_key} className="list-box-row" style={{gridTemplateColumns:VENDOR_CHECK_GRID}}>
                      <span style={CENTER_CELL}>
                        <input type="checkbox" checked={selectedVendorKeys.has(row.vendor_key)} onChange={() => toggleVendorSelection(row.vendor_key)} />
                      </span>
                      <span style={NOWRAP_CELL} title={row.programs.join(', ') || '-'}>{row.programs.join(', ') || '-'}</span>
                      <span style={NOWRAP_CELL} title={row.vendor_name}>{row.vendor_name}</span>
                      <span style={CENTER_CELL}><span className="badge pending" style={{ minWidth:'76px', justifyContent:'center' }}>{vendorSendLabel(row)}</span></span>
                      <span style={CENTER_CELL}><span className="badge consult" style={{ minWidth:'82px', justifyContent:'center' }}>{vendorReplyLabel(row)}</span></span>
                      <span style={{ ...CENTER_CELL, fontSize:'11px', color:'var(--text-muted)', fontWeight:600 }}>{vendorDecision(row)}</span>
                      <span style={{ fontSize:'11px', color: row.events.length ? 'var(--amber)' : 'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {row.events.length
                          ? row.events.map(ev => `${ev.start_time || ''}${ev.end_time ? '~' + ev.end_time : ''} ${ev.title || ev.prog_name || ''}`).join(' / ')
                          : '등록된 일정 없음'}
                      </span>
                      <span style={CENTER_CELL}><button className="btn-outline btn-sm" style={COMPACT_ACTION_BUTTON} onClick={openVendorConfirmManager}>수동 입력</button></span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop:'10px', fontSize:'11px', color:'var(--text-muted)', lineHeight:1.5 }}>
                업체 확인 탭이 열려 있으면 회신 상태를 자동으로 다시 확인합니다. 바로 확인하려면 회신 새로고침을 누르세요. 시간, 장소, 인원 등을 조율해 다시 확인해야 할 때는 선택 재요청을 사용합니다.
              </div>
            </div>
          )}
          {/* ── 탭1: 픽업정보 */}
          {tab === 2 && (
            <div className="form-section">
              <div className="form-section-label">픽업 정보</div>
              <StatusQuickPanel
                title="픽업 확정 상태"
                summary={`등록 픽업 ${pickups.length}건 · 픽업비 합계 ${(form.pickup_fee || 0).toLocaleString()}원 · 현재 상태 ${form.pickup_status || '해당없음'}`}
                value={form.pickup_status || '해당없음'}
                options={['해당없음', '확정필요', '확정완료']}
                disabledOptions={pickups.length === 0 ? ['확정완료'] : []}
                hint={pickups.length === 0 ? '픽업이 없는 예약은 해당없음, 픽업이 있으면 수행자 등록 후 확정완료를 선택하세요.' : '상태 변경 후 하단 저장 버튼을 눌러야 반영됩니다.'}
                onChange={value => inp('pickup_status', value)}
              />
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

          {tab === 3 && (
            <div className="form-section">
              <div className="form-section-label">예약 확정 조건</div>
              {!isEdit ? (
                <div className="list-box-empty">예약을 먼저 저장하면 확정 조건을 확인할 수 있습니다.</div>
              ) : (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                    <div style={{ fontSize:'12px', color:'var(--text-muted)', lineHeight:1.5 }}>
                      현재 상태 <b style={{ color:'var(--text-primary)' }}>{form.reservation_status || '-'}</b>
                      {' · '}결제 상태 <b style={{ color:'var(--text-primary)' }}>{readiness?.payment_status || form.payment_status || '-'}</b>
                    </div>
                    <button className="btn-outline btn-sm" onClick={() => refreshReadiness(true)} disabled={readinessLoading}>
                      {readinessLoading ? '확인 중...' : '확정가능 갱신'}
                    </button>
                  </div>

                  {!readiness ? (
                    <div className="list-box-empty">확정 조건을 불러오는 중입니다.</div>
                  ) : (
                    <div className="list-box">
                      <div className="list-box-header" style={{gridTemplateColumns:'90px 94px 1fr'}}>
                        <span>조건</span><span>상태</span><span>내용</span>
                      </div>
                      {readiness.conditions.map(item => (
                        <div key={item.key} className="list-box-row" style={{gridTemplateColumns:'90px 94px 1fr'}}>
                          <span>{item.label}</span>
                          <span className={`badge ${item.passed ? 'confirmed' : item.status === '조정 필요' || item.status === '확정 불가' ? 'cancelled' : 'pending'}`}>
                            {item.passed ? '통과' : item.status}
                          </span>
                          <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>{item.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop:'12px', padding:'12px', border:'1px solid var(--border2)', borderRadius:'8px', fontSize:'12px', color:'var(--text-muted)', lineHeight:1.6 }}>
                    체험 업체가 모두 가능이고, 숙소/픽업 조건이 통과되면 예약 상태가 <b style={{ color:'var(--green)' }}>확정가능</b>으로 갱신됩니다.
                    고객 안내는 운영자가 문자/전화 등으로 직접 진행하고, 이 화면에서는 완료 여부만 기록합니다.
                  </div>

                  <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'12px' }}>
                    <button className="btn-primary" onClick={confirmReservation} disabled={readinessLoading || form.reservation_status !== '확정가능'}>
                      고객 안내 완료 및 예약확정
                    </button>
                  </div>
                </>
              )}
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
  const [lodgeVendors, setLodgeVendors] = useState([])
  const [loading,   setLoading]   = useState(true)

  const [search,    setSearch]    = useState('')
  const [filterType,setFilterType]= useState(searchParams.get('type')||'')
  const [filterMonth,setFilterMonth] = useState('')

  const [modal, setModal] = useState(() => {
    const newParam  = searchParams.get('new')
    const dateParam = searchParams.get('date')
    const noParam   = searchParams.get('no')
    if (newParam === '1') return { mode:'new', date: dateParam || new Date().toISOString().slice(0,10) }
    if (noParam)          return { mode:'openByNo', no: noParam }
    return null
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [resR, zoneR, pkgR, platR, drvR, bizR, lodgeR] = await Promise.all([
      supabase.from('reservations').select('*').order('date', { ascending: false }).order('no', { ascending: false }),
      supabase.from('zones').select('*').order('code'),
      supabase.from('packages').select('*, package_programs(vendor_key)').order('name'),
      supabase.from('platforms').select('*').order('type').order('name'),
      supabase.from('drivers').select('*').order('name'),
      supabase.from('biz').select('*').order('name'),
      supabase.from('lodge_vendors').select('*, lodges(*)').order('name'),
    ])
    setReservations(resR.data || [])
    setZones(zoneR.data || [])
    setPackages(pkgR.data || [])
    setPlatforms(platR.data || [])
    setDrivers(drvR.data || [])
    setBizList(bizR.data || [])
    setLodgeVendors(lodgeR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
        <input type="text" inputMode="numeric" maxLength={7} className="filter-select" value={filterMonth} onChange={e=>setFilterMonth(formatMonthTyping(e.target.value))} placeholder="2026-05" style={{width:'140px'}}/>
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
        <div className="list-header" style={{gridTemplateColumns:RESERVATION_LIST_GRID, gap:'12px'}}>
          <span style={CENTER_CELL}>NO</span>
          <span style={CENTER_CELL}>상태</span>
          <span style={CENTER_CELL}>날짜</span>
          <span>고객명</span>
          <span>패키지명</span>
          <span style={CENTER_CELL}>구역</span>
          <span style={CENTER_CELL}>인원</span>
          <span style={RIGHT_CELL}>총금액</span>
          <span style={CENTER_CELL}>결제처</span>
          <span style={CENTER_CELL}>운영</span>
          <span style={CENTER_CELL}>정산</span>
        </div>
        {filtered.length === 0 && (
          <div style={{padding:'40px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}}>예약 없음</div>
        )}
        {filtered.map(r => (
          <div key={r.no} className="list-row" style={{gridTemplateColumns:RESERVATION_LIST_GRID, gap:'12px'}} onClick={()=>openEdit(r)}>
            <span className="no-col" style={CENTER_CELL}>#{r.no}</span>
            <span style={CENTER_CELL}><span className={`badge ${r.type}`} style={{minWidth:'46px',justifyContent:'center'}}>{STATUS_LABEL[r.type]}</span></span>
            <span style={{...CENTER_CELL,fontSize:'12px',fontFamily:'DM Mono,monospace',color:'var(--text-secondary)'}}>{r.date}</span>
            <span style={{...NOWRAP_CELL,fontWeight:600}} title={r.customer}>{r.customer}</span>
            <span style={{...NOWRAP_CELL,fontSize:'12px',color:'var(--text-secondary)'}} title={r.package_name || '-'}>{r.package_name||'-'}</span>
            <span style={{...CENTER_CELL,fontSize:'11px',color:'var(--text-muted)'}}>{r.zone_code||'-'}</span>
            <span style={{...CENTER_CELL,fontSize:'13px',fontWeight:600}}>{r.pax}명</span>
            <span style={{...RIGHT_CELL,fontFamily:'DM Mono,monospace',fontSize:'12px',fontWeight:700}}>{(r.total||0).toLocaleString()}</span>
            <span style={{...CENTER_CELL,fontSize:'12px',color:'var(--text-secondary)', ...NOWRAP_CELL}} title={r.payto || '-'}>{r.payto||'-'}</span>
            <span style={CENTER_CELL}>
              <span style={{fontSize:'11px',minWidth:'52px',textAlign:'center',padding:'2px 8px',borderRadius:'4px',background: r.op==='사업비'?'rgba(123,104,238,.1)':'rgba(78,205,196,.08)',color: r.op==='사업비'?'var(--purple)':'var(--text-muted)',fontWeight:600}}>{r.op}</span>
            </span>
            <span style={{...CENTER_CELL,fontSize:'11px',color: r.settle_status==='settled'?'var(--green)':'var(--amber)',fontWeight:700}}>{r.settle_status==='settled'?'완료':'미정산'}</span>
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
          lodgeVendors={lodgeVendors}
        />
      )}
    </div>
  )
}
