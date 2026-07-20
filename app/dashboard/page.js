'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR = { confirmed:'var(--green)', pending:'var(--amber)', cancelled:'var(--red)', consult:'var(--accent)' }
const DAYS = ['일','월','화','수','목','금','토']
const NOTICE_TYPES = ['일반', '공지', '운영', '전달사항', '휴무', '특일']
const HANDOFF_STATUSES = ['일반', '긴급', '완료']
const HANDOFF_STATUS_COLOR = {
  일반: { color:'var(--accent)', bg:'rgba(78,205,196,.12)', border:'rgba(78,205,196,.26)' },
  긴급: { color:'var(--red)', bg:'rgba(255,107,107,.12)', border:'rgba(255,107,107,.32)' },
  완료: { color:'var(--green)', bg:'rgba(92,184,92,.12)', border:'rgba(92,184,92,.3)' },
}

function normalizeHandoffStatus(value) {
  return HANDOFF_STATUSES.includes(value) ? value : '일반'
}

function normalizeNoticeType(value) {
  return NOTICE_TYPES.includes(value) ? value : '일반'
}

function handoffStatusStyle(value) {
  return HANDOFF_STATUS_COLOR[normalizeHandoffStatus(value)]
}

function todayStr() {
  const d = new Date()
  return dateStr(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
function addDaysStr(baseDate, days) {
  const d = new Date(baseDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dateStr(y, m, d) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

function calendarRange(year, month) {
  const first = new Date(year, month - 1, 1).getDay()
  const lastDay = new Date(year, month, 0).getDate()
  const prevLast = new Date(year, month - 1, 0).getDate()
  const prevMonthDate = month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 }
  const nextMonthDate = month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 }
  const start = first > 0
    ? dateStr(prevMonthDate.year, prevMonthDate.month, prevLast - first + 1)
    : dateStr(year, month, 1)
  const cellCount = Math.ceil((first + lastDay) / 7) * 7
  const trailingCount = cellCount - first - lastDay
  const end = trailingCount > 0
    ? dateStr(nextMonthDate.year, nextMonthDate.month, trailingCount)
    : dateStr(year, month, lastDay)
  return { start, end }
}

function fmtMoney(n) {
  if (!n && n !== 0) return '-'
  return n.toLocaleString('ko-KR') + '원'
}

function componentSummaryForReservation(reservation, usages, packages = [], zoneList = []) {
  const zoneNameMap = Object.fromEntries(zoneList.map(zone => [zone.code, zone.name]))
  const rows = usages.filter(row =>
    row.reservation_no === reservation.no &&
    row.usage_type === 'product_operation' &&
    row.is_deleted !== true
  )
  if (!rows.length) {
    const zoneLabel = reservation.zone_code ? (zoneNameMap[reservation.zone_code] || reservation.zone_code) : '-'
    const packageLabel = reservation.package_name || reservation.pkg || '-'
    const maxPeople = Number(reservation.pax) || 0
    return {
      zoneCount: reservation.zone_code ? 1 : 0,
      packageCount: reservation.package_name ? 1 : 0,
      maxPeople,
      zoneLabel,
      zoneTitle: zoneLabel,
      packageLabel,
      packageTitle: packageLabel,
    }
  }
  const zoneCodes = new Set()
  const zoneNames = new Set()
  const packageNames = new Set()
  rows.forEach(row => {
    const pkg = packages.find(p => String(p.id) === String(row.package_id)) || packages.find(p => p.name === row.package_name)
    const packageZones = (pkg?.package_zones || [])
      .filter(zone => zone && zone.is_deleted !== true)
      .map(zone => zone.zone_code)
      .filter(Boolean)
    if (row.item_name || row.package_name) packageNames.add(row.item_name || row.package_name)
    if (Array.isArray(row.zone_codes) && row.zone_codes.length) {
      row.zone_codes.filter(Boolean).forEach(code => {
        zoneCodes.add(code)
        zoneNames.add(zoneNameMap[code] || code)
      })
    } else if (packageZones.length) {
      packageZones.forEach(code => {
        zoneCodes.add(code)
        zoneNames.add(zoneNameMap[code] || code)
      })
    } else if (row.zone_code || row.zone_name) {
      const code = row.zone_code || row.zone_name
      zoneCodes.add(code)
      zoneNames.add(row.zone_name || zoneNameMap[code] || code)
    }
  })
  const zoneNameList = [...zoneNames]
  const packageNameList = [...packageNames]
  const maxPeople = rows.length ? Math.max(...rows.map(row => Number(row.people_count) || 0), 0) : 0
  return {
    zoneCount: zoneCodes.size,
    packageCount: rows.length,
    maxPeople,
    zoneLabel: zoneNameList.length <= 2 ? zoneNameList.join(' · ') : `${zoneNameList.length}구역`,
    zoneTitle: zoneNameList.join(' / '),
    packageLabel: packageNameList.length === 1 ? packageNameList[0] : `${packageNameList.length}개 상품 구성`,
    packageTitle: packageNameList.join(' / '),
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState([])
  const [packages,     setPackages]     = useState([])
  const [zones,        setZones]        = useState([])
  const [notices,      setNotices]      = useState([])
  const [handoffNotes, setHandoffNotes] = useState([])
  const [vendorConfirms, setVendorConfirms] = useState([])
  const [lodgeConfirms,  setLodgeConfirms]  = useState([])
  const [pickups,        setPickups]        = useState([])
  const [budgetUsages,   setBudgetUsages]   = useState([])
  const [calYear,  setCalYear]  = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [openResNo, setOpenResNo] = useState('')
  const [noticePopup,  setNoticePopup]  = useState(null)  // { date, specials, notices }
  const [limitAlertSending, setLimitAlertSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [handoffText, setHandoffText] = useState('')
  const [handoffType, setHandoffType] = useState('일반')
  const [handoffSaving, setHandoffSaving] = useState(false)
  const [urgentQueue, setUrgentQueue] = useState([])
  const [urgentAcking, setUrgentAcking] = useState(false)
  const [openMetricDetail, setOpenMetricDetail] = useState('')
  const [mobileMetricsOpen, setMobileMetricsOpen] = useState(false)
  const [openHandoffDetail, setOpenHandoffDetail] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [resR, pkgR, zoneR, notR, vcR, lcR, pkR, usageR] = await Promise.all([
      supabase.from('reservations').select('no,date,end_date,customer,tel,package_name,pax,type,is_deleted,total,settle_status,reservation_status,biz_id,op,payto,inflow,platform_name,agency_name,pickup_fee').order('date', { ascending: false }),
      supabase.from('packages').select('id,name,zone_code,pax_limit,total_price,is_deleted,package_zones(zone_code,is_deleted),package_programs(vendor_key,prog_name,is_deleted,vendors(key,name,color))'),
      supabase.from('zones').select('code,name,is_deleted').order('code'),
      supabase.from('notices').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('date'),
      supabase.from('vendor_confirms').select('reservation_no,vendor_key,reply_status,status,request_date,is_deleted'),
      supabase.from('lodge_confirms').select('*').or('is_deleted.is.null,is_deleted.eq.false'),
      supabase.from('reservation_pickup').select('reservation_no,pickup_fee,is_deleted'),
      supabase.from('reservation_budget_usages').select('reservation_no,usage_type,zone_code,zone_codes,zone_name,package_id,package_name,item_name,sale_type,people_count,is_deleted').or('is_deleted.is.null,is_deleted.eq.false'),
    ])
    setReservations(resR.data || [])
    setPackages(pkgR.data || [])
    setZones(zoneR.data || [])
    if (notR.error) console.error('NOTICE load failed')
    setNotices(notR.data || [])
    setVendorConfirms(vcR.data || [])
    setLodgeConfirms(lcR.data || [])
    setPickups(pkR.data || [])
    setBudgetUsages(usageR.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const loadUrgentUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/handoff-notes/urgent-unread', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setUrgentQueue(Array.isArray(data) ? data : [])
    } catch {
      console.error('Urgent notice popup load failed')
    }
  }, [])

  useEffect(() => { loadUrgentUnread() }, [loadUrgentUnread])

  const loadHandoffNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/handoff-notes', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setHandoffNotes(Array.isArray(data) ? data : [])
    } catch {
      console.error('Handoff notes load failed')
    }
  }, [])

  useEffect(() => { loadHandoffNotes() }, [loadHandoffNotes])

  // ── KPI 계산: 달력에서 보고 있는 년/월 기준
  const selectedMonth = `${calYear}-${String(calMonth).padStart(2,'0')}`
  const selectedMonthAllRes = reservations.filter(r => r.date?.startsWith(selectedMonth) && r.is_deleted !== true)
  const selectedMonthRes = selectedMonthAllRes.filter(r => r.type !== 'cancelled')
  const confirmedReservations = selectedMonthAllRes.filter(r => r.type === 'confirmed')
  const consultReservations = selectedMonthAllRes.filter(r => r.type === 'consult')
  const cancelledReservations = selectedMonthAllRes.filter(r => r.type === 'cancelled')
  const selectedMonthNos = new Set(selectedMonthRes.map(r => String(r.no)))
  const reservationByNo = new Map(reservations.map(r => [String(r.no), r]))
  const selectedMonthSales = selectedMonthRes.reduce((s,r) => s + (r.total||0), 0)
  const unsettledReservations = selectedMonthRes.filter(r => (r.settle_status || 'unsettled') === 'unsettled')
  const unsettledCount = unsettledReservations.length
  const waitingVendorRows = vendorConfirms.filter(v => {
    if (v.is_deleted === true) return false
    const replyStatus = v.reply_status || v.status || '회신대기'
    const isWaiting = ['회신대기', 'wait', 'pending', '미회신'].includes(replyStatus)
    const inReservationMonth = selectedMonthNos.has(String(v.reservation_no))
    const inRequestMonth = v.request_date?.startsWith(selectedMonth)
    return isWaiting && (inReservationMonth || inRequestMonth)
  })
  const waitVendorCount = waitingVendorRows.length
  const waitingVendorReservations = [...waitingVendorRows.reduce((map, row) => {
    const key = String(row.reservation_no)
    const reservation = reservationByNo.get(key)
    if (!reservation || reservation.is_deleted === true || reservation.type === 'cancelled') return map
    const current = map.get(key) || { reservation, waitingCount: 0 }
    current.waitingCount += 1
    map.set(key, current)
    return map
  }, new Map()).values()].sort((a, b) => String(a.reservation.date || '').localeCompare(String(b.reservation.date || '')))
  const metricDetailRows = openMetricDetail === 'vendor'
    ? waitingVendorReservations
    : openMetricDetail === 'settle'
      ? unsettledReservations.map(reservation => ({ reservation }))
      : openMetricDetail === 'confirmed'
        ? confirmedReservations.map(reservation => ({ reservation }))
        : openMetricDetail === 'consult'
          ? consultReservations.map(reservation => ({ reservation }))
          : openMetricDetail === 'cancelled'
            ? cancelledReservations.map(reservation => ({ reservation }))
            : openMetricDetail === 'sales'
              ? selectedMonthRes.map(reservation => ({ reservation }))
      : []
  const metricDetailMeta = {
    confirmed: { title:'확정', subtitle:`${selectedMonth} · ${confirmedReservations.length}건` },
    consult: { title:'상담필요', subtitle:`${selectedMonth} · ${consultReservations.length}건` },
    vendor: { title:'업체 확인 대기', subtitle:`${selectedMonth} · 예약 ${waitingVendorReservations.length}건 · 회신 ${waitVendorCount}건` },
    settle: { title:'미정산', subtitle:`${selectedMonth} · ${unsettledCount}건` },
    sales: { title:'이번 달 매출', subtitle:`${selectedMonth} · ${selectedMonthRes.length}건 · ${fmtMoney(selectedMonthSales)}` },
    cancelled: { title:'취소', subtitle:`${selectedMonth} · ${cancelledReservations.length}건` },
  }
  const activeMetricMeta = metricDetailMeta[openMetricDetail] || { title:'운영 지표', subtitle:selectedMonth }

  function openMetricReservation(reservation) {
    if (reservation?.type === 'cancelled') {
      router.push(`/dashboard/reservations?no=${reservation.no}&from=dashboard`)
      return
    }
    if (!reservation?.date) return
    setSelectedDate(reservation.date)
    setOpenResNo(reservation.no)
  }

  // ── 달력 데이터
  const first    = new Date(calYear, calMonth-1, 1).getDay()
  const lastDay  = new Date(calYear, calMonth, 0).getDate()
  const prevLast = new Date(calYear, calMonth-1, 0).getDate()

  function getDateRes(ds) { return reservations.filter(r => r.date === ds && r.type !== 'cancelled') }
  function getReservationPeople(r) {
    const summary = componentSummaryForReservation(r, budgetUsages, packages, zones)
    return Number(summary.maxPeople) || Number(r.pax) || 0
  }
  function getDatePax(ds) { return getDateRes(ds).reduce((s,r) => s + getReservationPeople(r), 0) }

  // 구성 상품별 인원 알림 기준 초과 여부
  function getDateLimitWarnings(ds) {
    const rList = getDateRes(ds)
    const reservationNos = new Set(rList.map(r => r.no))
    const byPackage = new Map()

    budgetUsages
      .filter(row =>
        reservationNos.has(row.reservation_no) &&
        row.usage_type === 'product_operation' &&
        row.is_deleted !== true
      )
      .forEach(row => {
        const pkg = packages.find(p => String(p.id) === String(row.package_id)) || packages.find(p => p.name === row.package_name || p.name === row.item_name)
        const name = row.item_name || row.package_name || pkg?.name
        if (!name) return
        const limit = Number(pkg?.pax_limit) || 0
        if (!limit) return
        const current = byPackage.get(name) || { name, people: 0, limit }
        current.people += Number(row.people_count) || 0
        current.limit = limit
        byPackage.set(name, current)
      })

    rList.forEach(r => {
      const hasComponentRows = budgetUsages.some(row =>
        row.reservation_no === r.no &&
        row.usage_type === 'product_operation' &&
        row.is_deleted !== true
      )
      if (hasComponentRows) return
      const pkg = packages.find(p => p.name === (r.package_name || r.pkg))
      const limit = Number(pkg?.pax_limit) || 0
      if (!limit) return
      const name = r.package_name || r.pkg
      const current = byPackage.get(name) || { name, people: 0, limit }
      current.people += Number(r.pax) || 0
      current.limit = limit
      byPackage.set(name, current)
    })

    return [...byPackage.values()]
      .map(item => {
        const cautionAt = Math.ceil(item.limit * 0.85)
        const level = item.people >= item.limit ? 'over' : item.people >= cautionAt ? 'caution' : 'normal'
        return { ...item, cautionAt, level }
      })
      .filter(item => item.level !== 'normal')
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'over' ? -1 : 1
        return (b.people / b.limit) - (a.people / a.limit)
      })
  }

  function isOverLimit(ds) {
    return getDateLimitWarnings(ds).some(item => item.level === 'over')
  }

  function isCautionLimit(ds) {
    return getDateLimitWarnings(ds).some(item => item.level === 'caution')
  }

  function getDateNotices(ds) {
    return notices.filter(n => n.date <= ds && (n.end_date || n.date) >= ds && n.is_deleted !== true)
  }
  function isNoticeStartOn(n, ds) {
    return n.date === ds || !getDateNotices(addDaysStr(ds, -1)).some(prev => String(prev.id) === String(n.id))
  }
  function isNoticeEndOn(n, ds) {
    const end = n.end_date || n.date
    return end === ds || !getDateNotices(addDaysStr(ds, 1)).some(next => String(next.id) === String(n.id))
  }
  function noticeTitle(n) {
    return n.title || (n.content || '').split('\n')[0] || n.special || '알림'
  }
  function noticeTimeLabel(n) {
    if (n.is_all_day || (!n.start_time && !n.end_time)) return '종일'
    if (n.start_time && n.end_time) return `${n.start_time.slice(0,5)} ~ ${n.end_time.slice(0,5)}`
    return (n.start_time || n.end_time || '').slice(0,5)
  }
  function handoffDateLabel(n) {
    const ds = String(n.created_at || '').slice(0, 10)
    if (!ds) return '-'
    return ds === todayStr() ? '오늘' : ds.slice(5)
  }

  // 달력 셀 생성
  const cells = []
  const prevMonthDate = calMonth === 1
    ? { year: calYear - 1, month: 12 }
    : { year: calYear, month: calMonth - 1 }
  const nextMonthDate = calMonth === 12
    ? { year: calYear + 1, month: 1 }
    : { year: calYear, month: calMonth + 1 }
  for (let i = 0; i < first; i++) {
    const day = prevLast - first + i + 1
    cells.push({ day, cur: false, ds: dateStr(prevMonthDate.year, prevMonthDate.month, day) })
  }
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ day: d, cur: true, ds: dateStr(calYear, calMonth, d) })
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - lastDay - first + 1
    cells.push({ day, cur: false, ds: dateStr(nextMonthDate.year, nextMonthDate.month, day) })
  }

  // 선택 날짜 예약 목록
  const selRes = reservations.filter(r => r.date === selectedDate)
  const selectedDateWarnings = getDateLimitWarnings(selectedDate)

  async function sendLimitAlert() {
    if (!selectedDateWarnings.length || limitAlertSending) return
    setLimitAlertSending(true)
    try {
      const res = await fetch('/api/telegram/limit-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          reservationCount: selRes.length,
          totalPeople: getDatePax(selectedDate),
          warnings: selectedDateWarnings.map(item => ({
            name: item.name,
            people: item.people,
            limit: item.limit,
            cautionAt: item.cautionAt,
            level: item.level,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '텔레그램 알림 발송 실패')
      alert('대표님에게 텔레그램 인원 알림을 발송했습니다.')
    } catch (error) {
      alert('텔레그램 인원 알림 발송 실패: ' + error.message)
    } finally {
      setLimitAlertSending(false)
    }
  }

  function getPkg(r) {
    return packages.find(p => p.name === (r.package_name || r.pkg))
  }

  function getConfirmStatus(r) {
    const pkg = getPkg(r)
    const vendorKeys = [...new Set((pkg?.package_programs || []).map(p => p.vendor_key).filter(Boolean))]
    if (!vendorKeys.length) return 'none'
    const rows = vendorConfirms.filter(v => v.reservation_no === r.no && vendorKeys.includes(v.vendor_key))
    const okValues = ['ok', 'confirmed', '가능', 'done']
    const okCount = rows.filter(v => okValues.includes(v.status)).length
    if (okCount === vendorKeys.length) return 'confirmed'
    if (okCount > 0 || rows.length > 0) return 'partial'
    return 'wait'
  }

  function getLodges(no) {
    return lodgeConfirms.filter(l => String(l.reservation_no) === String(no) && l.is_deleted !== true)
  }

  function getPickups(no) {
    return pickups.filter(p => p.reservation_no === no)
  }

  function infoItem(label, value) {
    return (
      <div style={{ padding:'6px 10px', background:'var(--navy2)', borderRadius:'6px' }}>
        <div style={{ fontSize:'10px', color:'var(--text-muted)', marginBottom:'2px' }}>{label}</div>
        <div style={{ fontSize:'12px', fontWeight:500 }}>{value || '-'}</div>
      </div>
    )
  }

  function salesChannelLabel(row) {
    const platform = row?.platform_name || ''
    const agency = row?.agency_name || row?.payto || ''
    if (platform && agency) return `${platform} / ${agency}`
    if (platform) return platform
    if (agency) return `전화/직접 / ${agency}`
    return '-'
  }

  // 상태별 현황
  const byStatus = { confirmed:0, pending:0, cancelled:0, consult:0 }
  reservations
    .filter(r => r.date?.startsWith(selectedMonth) && r.is_deleted !== true)
    .forEach(r => { if (byStatus[r.type] !== undefined) byStatus[r.type]++ })

  function openNoticePopup(ds) {
    const ns = getDateNotices(ds)
    if (!ns.length) return
    setNoticePopup({ date: ds, notices: ns })
  }

  const handoffRows = handoffNotes
    .filter(n => n.is_deleted !== true)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.id || '').localeCompare(String(a.id || '')))
  const completedHandoffs = handoffRows.filter(n => normalizeHandoffStatus(n.status) === '완료')
  const pendingHandoffs = handoffRows.filter(n => normalizeHandoffStatus(n.status) !== '완료')
  const urgentHandoffs = pendingHandoffs.filter(n => normalizeHandoffStatus(n.status) === '긴급')
  const generalPendingHandoffs = pendingHandoffs.filter(n => normalizeHandoffStatus(n.status) !== '긴급')
  const handoffDetailRows = openHandoffDetail === 'done' ? completedHandoffs : pendingHandoffs
  const handoffDetailTitle = openHandoffDetail === 'done' ? '완료된 메모' : '작성된 메모'
  const handoffDetailSubtitle = openHandoffDetail === 'done'
    ? `완료 ${completedHandoffs.length}건`
    : `미완료 ${pendingHandoffs.length}건 · 긴급 ${urgentHandoffs.length}건`

  async function addHandoffNotice() {
    const title = handoffText.trim()
    if (!title) return
    setHandoffSaving(true)
    const res = await fetch('/api/handoff-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content: '',
        status: handoffType,
      }),
    })
    setHandoffSaving(false)
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      alert('전달사항 등록 실패: ' + (payload.error?.message || payload.error || res.status))
      return
    }
    setHandoffText('')
    setHandoffType('일반')
    await loadHandoffNotes()
    await loadUrgentUnread()
  }

  async function updateHandoffStatus(notice, done) {
    const currentStatus = normalizeHandoffStatus(notice.status)
    const restoreStatus = normalizeHandoffStatus(notice.previous_status)
    const nextStatus = done ? '완료' : (restoreStatus === '완료' ? '일반' : restoreStatus)
    const res = await fetch('/api/handoff-notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...notice,
        status: nextStatus,
        previous_status: done && currentStatus !== '완료' ? currentStatus : null,
      }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      alert('전달사항 상태 변경 실패: ' + (payload.error?.message || payload.error || res.status))
      return
    }
    await loadHandoffNotes()
    await loadUrgentUnread()
  }

  async function deleteHandoffNotice(notice) {
    if (!confirm('이 전달사항을 삭제하시겠습니까?')) return
    const res = await fetch('/api/handoff-notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notice.id }),
    })
    if (!res.ok) {
      alert('전달사항 삭제 실패')
      return
    }
    await loadHandoffNotes()
    await loadUrgentUnread()
  }

  async function acknowledgeUrgentNotice(notice) {
    if (!notice?.id || urgentAcking) return
    setUrgentAcking(true)
    try {
      await fetch('/api/handoff-notes/urgent-unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoff_id: notice.id }),
      })
    } finally {
      setUrgentAcking(false)
      setUrgentQueue(prev => prev.filter(item => String(item.id) !== String(notice.id)))
    }
  }

  function handoffRow(notice, done = false) {
    const type = normalizeHandoffStatus(notice.status)
    const typeStyle = handoffStatusStyle(type)
    return (
      <div key={notice.id} style={{
        display:'grid',
        gridTemplateColumns:'24px minmax(0,1fr) 76px 72px',
        alignItems:'center',
        gap:'8px',
        padding:'8px 10px',
        borderBottom:'1px solid var(--border2)',
      }}>
        <button
          className="icon-btn"
          style={{
            width:'20px',
            height:'20px',
            borderRadius:'5px',
            borderColor: done ? 'rgba(92,184,92,.4)' : 'var(--border)',
            color: done ? 'var(--green)' : 'var(--text-muted)',
            fontSize:'11px',
          }}
          onClick={() => updateHandoffStatus(notice, !done)}
          title={done ? '미완료로 되돌리기' : '완료 처리'}
        >
          {done ? '✓' : ''}
        </button>
        <div style={{ minWidth:0 }}>
          <div style={{
            fontSize:'12px',
            fontWeight:700,
            color: done ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: done ? 'line-through' : 'none',
            overflow:'hidden',
            textOverflow:'ellipsis',
            whiteSpace:'nowrap',
          }}>
            {noticeTitle(notice)}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'3px', minWidth:0 }}>
            <span style={{
              flex:'0 0 auto',
              fontSize:'10px',
              lineHeight:'16px',
              padding:'0 6px',
              borderRadius:'999px',
              background:typeStyle.bg,
              border:`1px solid ${typeStyle.border}`,
              color:typeStyle.color,
              fontWeight:700,
            }}>
              {type}
            </span>
            <span style={{ minWidth:0, fontSize:'10px', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {handoffDateLabel(notice)}
            </span>
          </div>
          {notice.content && <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{notice.content}</div>}
        </div>
        <span style={{ fontSize:'11px', color: handoffDateLabel(notice) === '오늘' && !done ? 'var(--amber)' : 'var(--text-muted)', textAlign:'center' }}>
          {handoffDateLabel(notice)}
        </span>
        <button className="btn-outline btn-sm" style={{ height:'26px', fontSize:'11px', padding:'0 8px' }} onClick={() => deleteHandoffNotice(notice)}>
          삭제
        </button>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'300px', color:'var(--text-muted)' }}>
      로딩 중…
    </div>
  )

  const urgentPopupNotice = urgentQueue[0]

  return (
    <div className="dashboard-page">
      {/* 운영 KPI 바 */}
      <div className={`card dashboard-metrics-card${mobileMetricsOpen ? ' metrics-open' : ''}`}>
        <div className="dashboard-metrics-head">
          <div>
            <div className="dashboard-metrics-title">오늘 확인할 운영 지표</div>
            <div className="dashboard-metrics-subtitle">바로 처리할 항목을 우선 표시합니다.</div>
          </div>
          <div className="dashboard-metrics-month">{selectedMonth} 기준</div>
          <button
            type="button"
            className="dashboard-metrics-toggle"
            onClick={() => setMobileMetricsOpen(v => !v)}
            aria-expanded={mobileMetricsOpen}
          >
            {mobileMetricsOpen ? '접기' : '펼치기'}
          </button>
        </div>
        <div className="dashboard-metrics-grid">
          {[
            { label:'확정', value:`${byStatus.confirmed}건`, color:'var(--green)', detailKey:'confirmed', enabled: byStatus.confirmed > 0 },
            { label:'상담필요', value:`${byStatus.consult}건`, color:'var(--accent)', detailKey:'consult', enabled: byStatus.consult > 0 },
            { label:'업체 확인 대기', value:`${waitVendorCount}건`, color: waitVendorCount > 0 ? 'var(--red)' : 'var(--green)', hot: waitVendorCount > 0, detailKey:'vendor', enabled: waitVendorCount > 0 },
            { label:'미정산', value:`${unsettledCount}건`, color: unsettledCount > 0 ? 'var(--amber)' : 'var(--green)', hot: unsettledCount > 0, detailKey:'settle', enabled: unsettledCount > 0 },
            { label:'이번 달 매출', value:fmtMoney(selectedMonthSales), color:'var(--text-primary)', detailKey:'sales', enabled: selectedMonthRes.length > 0 },
            { label:'취소', value:`${byStatus.cancelled}건`, color:'var(--red)', detailKey:'cancelled', enabled: byStatus.cancelled > 0 },
          ].map(item => (
            <div
              key={item.label}
              className={`dashboard-metric-card${item.hot ? ' is-hot' : ''}${item.enabled ? ' is-clickable' : ''}`}
              onClick={() => {
                if (item.href) router.push(item.href)
                if (item.detailKey && item.enabled) setOpenMetricDetail(item.detailKey)
              }}
              style={{
                cursor:item.href || (item.detailKey && item.enabled) ? 'pointer' : 'default',
              }}
            >
              <div className="dashboard-metric-label" style={{ color:item.hot ? 'rgba(255,180,180,.9)' : 'var(--text-muted)' }}>{item.label}</div>
              <div className="dashboard-metric-value" style={{ fontSize:item.label === '이번 달 매출' ? '17px' : '24px', color:item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-main-grid">
        {/* 달력 */}
        <div className="dashboard-calendar-pane">
          <div className="dashboard-calendar-header">
            <span className="dashboard-calendar-title">{calYear}년 {calMonth}월</span>
            <div className="dashboard-calendar-nav">
              <button className="cal-nav-btn" onClick={() => { if(calMonth===1){setCalYear(y=>y-1);setCalMonth(12)}else setCalMonth(m=>m-1) }}>‹</button>
              <button className="cal-nav-btn" onClick={() => { if(calMonth===12){setCalYear(y=>y+1);setCalMonth(1)}else setCalMonth(m=>m+1) }}>›</button>
            </div>
          </div>
          <div className="cal-card">
            <div className="dashboard-calendar-legend">
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid var(--border2)',borderRadius:'999px'}}>
                <span style={{ color:'var(--accent)', fontWeight:700 }}>예약 n건</span>
                <span>해당 날짜 예약 수</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid var(--border2)',borderRadius:'999px'}}>
                <span style={{ color:'var(--text-primary)', fontWeight:700 }}>총 n명</span>
                <span>요약 인원 합계</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid rgba(247,201,72,.28)',borderRadius:'999px'}}>
                <span style={{ color:'var(--amber)', fontWeight:700 }}>주의 85%</span>
                <span>알림</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid rgba(255,107,107,.28)',borderRadius:'999px'}}>
                <span style={{ color:'var(--red)', fontWeight:700 }}>초과 100%</span>
                <span>마감권고</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid var(--border2)',borderRadius:'999px'}}>
                <span className="cal-notice-dot" />
                <span>NOTICE</span>
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 7px',border:'1px solid rgba(255,107,107,.28)',borderRadius:'999px',color:'var(--red)',fontWeight:700}}>긴급</span>
            </div>
            <div className="cal-grid">
              {DAYS.map((d, idx) => (
                <div
                  key={d}
                  className={`cal-dow${idx === 0 ? ' is-sunday' : ''}${idx === 6 ? ' is-saturday' : ''}`}
                >
                  {d}
                </div>
              ))}
              {cells.map((c, i) => {
                const ds       = c.ds
                const today    = todayStr()
                const cnt      = getDateRes(ds).length
                const pax      = getDatePax(ds)
                const over     = isOverLimit(ds)
                const caution  = !over && isCautionLimit(ds)
                const ntcList  = getDateNotices(ds)
                const isToday  = ds === today
                const isSel    = ds === selectedDate
                return (
                  <div
                    key={i}
                    className={`cal-day${c.cur?'':' other-month'}${isToday?' today':''}${isSel?' cal-selected':''}${i % 7 === 0 ? ' is-sunday' : ''}${i % 7 === 6 ? ' is-saturday' : ''}`}
                    style={over
                      ? { boxShadow:'inset 0 0 0 2px rgba(255,107,107,0.62)' }
                      : caution
                        ? { boxShadow:'inset 0 0 0 2px rgba(247,201,72,0.54)' }
                        : null}
                    onClick={() => { setSelectedDate(ds); setOpenResNo('') }}
                    onDoubleClick={() => router.push(`/dashboard/reservations?new=1&date=${ds}&from=dashboard`)}
                  >
                    <div
                      className="cal-notice-list cal-notice-top"
                      onClick={e => { e.stopPropagation(); openNoticePopup(ds) }}
                    >
                      {ntcList.slice(0,2).map(n => {
                        const start = isNoticeStartOn(n, ds)
                        const end = isNoticeEndOn(n, ds)
                        const isRange = (n.end_date || n.date) !== n.date
                        const noticeType = normalizeNoticeType(n.notice_type)
                        const noticeStyle = noticeType === '긴급'
                          ? { borderColor:'rgba(255,107,107,.9)', color:'var(--red)', background:'transparent' }
                          : noticeType === '완료'
                            ? { borderColor:'rgba(92,184,92,.82)', color:'var(--green)', background:'transparent' }
                            : { borderColor:'rgba(78,205,196,.8)', color:'var(--accent)', background:'transparent' }
                        return (
                          <div
                            key={n.id}
                            className={`cal-notice-title${isRange ? ' cal-notice-range' : ''}${start ? ' range-start' : ''}${end ? ' range-end' : ''}`}
                            title={noticeTitle(n)}
                            style={noticeStyle}
                          >
                            {noticeType}
                          </div>
                        )
                      })}
                      {ntcList.length > 2 && <div className="cal-notice-more">+{ntcList.length - 2}</div>}
                    </div>
                    <div className="cal-day-num">{c.day}</div>
                    {cnt > 0 ? <div className="cal-res-count">예약{cnt}건</div> : <div style={{ height:'13px' }} />}
                    {pax > 0 ? (
                      <div style={{ fontSize:'9px', fontWeight:700, marginBottom:'2px', color: over ? 'var(--red)' : caution ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {over ? '초과 ' : caution ? '주의 ' : '총 '}{pax}명
                      </div>
                    ) : <div style={{ height:'13px' }} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 선택일 예약 목록 */}
        <div className="dashboard-selected-pane">
          <div className="section-header dashboard-list-header" style={{ marginBottom:'10px' }}>
            <div className="section-title" style={{ fontSize:'13px' }}>
              {selectedDate} 예약 목록
              <span style={{ fontSize:'12px', fontWeight:400, color:'var(--text-muted)', marginLeft:'8px' }}>{selRes.length}건</span>
            </div>
            <button className="btn-primary" style={{ fontSize:'12px', padding:'5px 10px' }} onClick={() => router.push(`/dashboard/reservations?new=1&date=${selectedDate}&from=dashboard`)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              등록
            </button>
          </div>
          {selectedDateWarnings.length > 0 && (
            <div
              style={{
                marginBottom:'10px',
                padding:'10px 12px',
                border:'1px solid rgba(247,201,72,.32)',
                borderRadius:'8px',
                background:'rgba(247,201,72,.08)',
              }}
            >
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',marginBottom:'7px'}}>
                <div style={{fontSize:'11px',fontWeight:800,color:'var(--amber)'}}>인원 알림 상품</div>
                <button
                  className="btn-outline"
                  style={{height:'28px',padding:'0 10px',fontSize:'11px'}}
                  onClick={sendLimitAlert}
                  disabled
                  title="대표님 텔레그램 chat_id 연동 후 사용할 수 있습니다"
                >
                  텔레그램 연동 후 사용
                </button>
              </div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {selectedDateWarnings.map(item => (
                  <span
                    key={item.name}
                    title={`${item.name} ${item.people}/${item.limit}명 · ${item.level === 'over' ? '초과' : '주의'} 기준 ${item.level === 'over' ? item.limit : item.cautionAt}명`}
                    style={{
                      display:'inline-flex',
                      alignItems:'center',
                      gap:'5px',
                      padding:'4px 8px',
                      borderRadius:'999px',
                      border:item.level === 'over' ? '1px solid rgba(255,107,107,.34)' : '1px solid rgba(247,201,72,.34)',
                      background:'rgba(10,31,48,.32)',
                      fontSize:'11px',
                      fontWeight:800,
                      color:'var(--text-primary)',
                    }}
                  >
                    <span style={{color:item.level === 'over' ? 'var(--red)' : 'var(--amber)'}}>{item.level === 'over' ? '초과' : '주의'}</span>
                    <span>{item.name}</span>
                    <span style={{color:item.level === 'over' ? 'var(--red)' : 'var(--amber)'}}>{item.people}/{item.limit}명</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {selRes.length === 0 ? (
            <div className="list-card" style={{ padding:'20px', textAlign:'center' }}>
              <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'10px' }}>해당 날짜 예약이 없습니다.</div>
              <button className="btn-primary" style={{ height:'28px', fontSize:'11px', padding:'0 12px' }} onClick={() => router.push(`/dashboard/reservations?new=1&date=${selectedDate}&from=dashboard`)}>
                + 예약 등록하기
              </button>
            </div>
          ) : (
            <div className="list-card" style={{ overflow:'hidden', maxHeight:'486px', overflowY:'auto' }}>
              {selRes.map(r => {
                const conf = getConfirmStatus(r)
                const componentSummary = componentSummaryForReservation(r, budgetUsages, packages, zones)
                const dot = conf === 'confirmed' ? 'var(--green)' : conf === 'partial' ? 'var(--amber)' : 'var(--text-muted)'
                const lodges = getLodges(r.no)
                const pickupRows = getPickups(r.no)
                const hasPickup = pickupRows.length > 0 || (r.pickup_fee || 0) > 0
                const isOpen = openResNo === r.no
                return (
                  <div key={r.no}>
                    <div
                      className={`dash-res-item${isOpen ? ' active' : ''}`}
                      onClick={() => setOpenResNo(isOpen ? '' : r.no)}
                    >
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
                          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:dot, flexShrink:0 }} />
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:'13px' }}>
                              {r.customer}
                              <span style={{ fontWeight:400, fontSize:'11px', color:'var(--text-muted)', marginLeft:'4px' }}>{componentSummary.zoneCount}구역 · 상품 {componentSummary.packageCount}건</span>
                            </div>
                            <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
                              <span title={componentSummary.packageTitle || '-'}>{componentSummary.packageLabel || '-'}</span>
                              <span style={{ color:'var(--text-muted)' }}> · </span>
                              <span title={componentSummary.zoneTitle || '-'}>{componentSummary.zoneLabel || '-'}</span>
                              <span style={{ color:'var(--text-muted)' }}> · </span>
                              <span className={`badge ${r.type}`} style={{ fontSize:'10px', padding:'1px 6px' }}>{STATUS_LABEL[r.type]}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
                          {hasPickup && <span style={{ fontSize:'10px', background:'rgba(184,184,255,.15)', color:'#B8B8FF', border:'1px solid rgba(184,184,255,.3)', borderRadius:'4px', padding:'2px 6px' }}>픽업</span>}
                          {lodges.length > 0
                            ? <span style={{ fontSize:'10px', background:'rgba(78,205,196,.1)', color:'var(--accent)', border:'1px solid rgba(78,205,196,.25)', borderRadius:'4px', padding:'2px 6px' }}>{lodges[0].lodge_name || '숙소'}</span>
                            : <span style={{ fontSize:'10px', color:'var(--text-muted)', border:'1px dashed var(--border2)', borderRadius:'4px', padding:'2px 6px' }}>숙소미정</span>}
                          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{isOpen ? '▴' : '▾'}</span>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="dash-res-card">
                        <div style={{ padding:'12px 16px 14px', background:'var(--navy3)', borderTop:'1px solid var(--border2)' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginBottom:'10px' }}>
                            {infoItem('고객명', r.customer)}
                            {infoItem('상품/패키지', componentSummary.packageLabel)}
                            {infoItem('구역', componentSummary.zoneLabel)}
                            {infoItem('구성', `${componentSummary.zoneCount}구역 / 상품 ${componentSummary.packageCount}건`)}
                            {infoItem('연락처', r.tel)}
                            {infoItem('날짜', `${r.date}${r.end_date && r.end_date !== r.date ? ` ~ ${r.end_date.slice(5)}` : ''}`)}
                            {infoItem('판매채널', salesChannelLabel(r))}
                          </div>
                          <div style={{ marginBottom:'8px', padding:'9px 12px', background:'var(--navy2)', borderRadius:'8px', border:`1px solid ${lodges.some(l => l.checked) ? 'rgba(78,205,196,.25)' : 'var(--border2)'}` }}>
                            <div style={{ fontSize:'10px', color:'var(--text-muted)', letterSpacing:'.5px', marginBottom:'4px' }}>숙소</div>
                            {lodges.length > 0 ? lodges.map(l => (
                              <div key={l.id} style={{ fontSize:'13px', fontWeight:600, marginTop:'3px' }}>
                                {l.lodge_name || '-'} <span style={{ fontWeight:400, color:'var(--text-secondary)' }}>· {l.room_name || '객실미정'}</span>
                                {l.room_price ? <span style={{ fontWeight:400, color:'var(--accent)', fontSize:'12px', marginLeft:'6px' }}>{fmtMoney(l.room_price)}</span> : null}
                              </div>
                            )) : <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>미배정 (숙소 확인 필요)</div>}
                          </div>
                          <div style={{ marginBottom:'10px', padding:'9px 12px', background:'var(--navy2)', borderRadius:'8px', border:`1px solid ${hasPickup ? 'rgba(184,184,255,.25)' : 'var(--border2)'}` }}>
                            <div style={{ fontSize:'10px', color:'var(--text-muted)', letterSpacing:'.5px', marginBottom:'4px' }}>픽업</div>
                            {hasPickup ? (
                              <div>
                                <div style={{ fontSize:'13px', fontWeight:600 }}>픽업/드랍 있음 <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:'12px' }}>· {fmtMoney(r.pickup_fee || pickupRows.reduce((s,p)=>s+(p.pickup_fee||0),0))}</span></div>
                                {pickupRows.map(p => <div key={p.id} style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'3px' }}>{p.pickup_type} · {p.drivers?.name || '수행자 미정'}</div>)}
                              </div>
                            ) : <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>픽업 없음</div>}
                          </div>
                          <div style={{ display:'flex', gap:'6px' }}>
                            <button className="btn-outline" style={{ flex:1, height:'30px', fontSize:'12px' }} onClick={e => { e.stopPropagation(); router.push(`/dashboard/reservations?no=${r.no}&from=dashboard`) }}>전체 상세</button>
                            <button className="btn-primary" style={{ flex:1, height:'30px', fontSize:'12px' }} onClick={e => { e.stopPropagation(); router.push(`/dashboard/reservations?no=${r.no}&from=dashboard`) }}>수정</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ padding:'7px 14px', fontSize:'11px', color:'var(--text-muted)', textAlign:'right', borderTop:'1px solid var(--border2)' }}>
                총 {selRes.length}건 · 클릭하면 상세 보기
              </div>
            </div>
          )}
          <div style={{ marginTop:'12px', padding:'10px 14px', background:'var(--navy3)', borderRadius:'8px', border:'1px dashed var(--border2)', textAlign:'center', fontSize:'11px', color:'var(--text-muted)' }}>
            달력 날짜를 클릭하면 해당 날짜 예약 조회 · 더블클릭하면 신규 예약 등록
          </div>
        </div>
      </div>

      {/* 운영 지표 상세 팝업 */}
      {openMetricDetail && (
        <div className="notice-popup open" onClick={e => { if(e.target===e.currentTarget) setOpenMetricDetail('') }}>
          <div className="notice-popup-box">
            <div className="notice-popup-header">
              <div>
                <div style={{ fontSize:'14px', fontWeight:700 }}>
                  {activeMetricMeta.title}
                </div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
                  {activeMetricMeta.subtitle}
                </div>
              </div>
              <button className="close-btn" onClick={() => setOpenMetricDetail('')}>✕</button>
            </div>
            <div style={{ padding:'16px 20px', maxHeight:'58vh', overflowY:'auto' }}>
              {metricDetailRows.map((row, i) => {
                const reservation = row.reservation
                return (
                  <button
                    key={`${openMetricDetail}-${reservation.no}`}
                    type="button"
                    className="notice-item"
                    onClick={() => {
                      openMetricReservation(reservation)
                      setOpenMetricDetail('')
                    }}
                    style={{ width:'100%', border:0, background:'transparent', color:'inherit', textAlign:'left', cursor:'pointer' }}
                  >
                    <div className="notice-item-num">{i+1}</div>
                    <div className="notice-item-content">
                      <div style={{fontWeight:800,color:'var(--text-primary)',marginBottom:'3px'}}>
                        #{reservation.no} {reservation.customer || '-'}
                      </div>
                      <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'4px'}}>
                        {reservation.date || '-'} · {reservation.package_name || '-'}
                      </div>
                      <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                        {openMetricDetail === 'vendor'
                          ? `업체 회신대기 ${row.waitingCount}건`
                          : openMetricDetail === 'settle'
                            ? `예약금액 ${fmtMoney(reservation.total || 0)}`
                            : openMetricDetail === 'sales'
                              ? `매출 ${fmtMoney(reservation.total || 0)}`
                              : STATUS_LABEL[reservation.type] || '예약'}
                      </div>
                    </div>
                  </button>
                )
              })}
              {!metricDetailRows.length && (
                <div style={{ padding:'14px', textAlign:'center', color:'var(--text-muted)', fontSize:'12px' }}>
                  표시할 예약이 없습니다.
                </div>
              )}
            </div>
            <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border2)', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button className="btn-outline" onClick={() => setOpenMetricDetail('')}>닫기</button>
              <button className="btn-primary" onClick={() => { setOpenMetricDetail(''); router.push('/dashboard/reservations') }}>예약 관리</button>
            </div>
          </div>
        </div>
      )}

      {/* NOTICE 팝업 */}
      {noticePopup && (
        <div className="notice-popup open" onClick={e => { if(e.target===e.currentTarget) setNoticePopup(null) }}>
          <div className="notice-popup-box">
            <div className="notice-popup-header">
              <div>
                <div style={{ fontSize:'14px', fontWeight:700 }}>{noticePopup.date}</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>{noticePopup.notices.length}개 알림</div>
              </div>
              <button className="close-btn" onClick={() => setNoticePopup(null)}>✕</button>
            </div>
            <div style={{ padding:'16px 20px' }}>
              {noticePopup.notices.map((n, i) => (
                <div key={n.id} className="notice-item">
                  <div className="notice-item-num">{i+1}</div>
                  <div className="notice-item-content">
                    <div style={{fontWeight:800,color:'var(--text-primary)',marginBottom:'3px'}}>{noticeTitle(n)}</div>
                    <div style={{fontSize:'11px',color:'var(--text-muted)',marginBottom:'4px'}}>
                      {noticeTimeLabel(n)}{n.place ? ` · ${n.place}` : ''}
                    </div>
                    {n.content && <div>{n.content}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border2)', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button className="btn-outline" onClick={() => setNoticePopup(null)}>닫기</button>
              <button className="btn-primary" onClick={() => { setNoticePopup(null); router.push('/dashboard/notice') }}>알림 관리</button>
            </div>
          </div>
        </div>
      )}

      {urgentPopupNotice && (
        <div className="modal-overlay open" style={{ zIndex: 1200 }}>
          <div className="modal-box" style={{ maxWidth:'520px', borderColor:'rgba(255,107,107,.36)' }}>
            <div className="modal-header" style={{ borderBottom:'1px solid rgba(255,107,107,.22)' }}>
              <div>
                <div className="modal-title" style={{ color:'var(--red)' }}>긴급 전달사항</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px' }}>
                  {handoffDateLabel(urgentPopupNotice)}
                </div>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text-primary)', marginBottom:'10px', lineHeight:1.45 }}>
                {noticeTitle(urgentPopupNotice)}
              </div>
              {urgentPopupNotice.content && (
                <div style={{ fontSize:'13px', color:'var(--text-secondary)', whiteSpace:'pre-wrap', lineHeight:1.65 }}>
                  {urgentPopupNotice.content}
                </div>
              )}
              {urgentPopupNotice.place && (
                <div style={{ marginTop:'12px', fontSize:'12px', color:'var(--text-muted)' }}>
                  장소: {urgentPopupNotice.place}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => acknowledgeUrgentNotice(urgentPopupNotice)} disabled={urgentAcking}>
                {urgentAcking ? '처리 중...' : '확인했습니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
