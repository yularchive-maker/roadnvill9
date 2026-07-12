'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTyping } from '@/lib/date-input'
import { useRouter } from 'next/navigation'

const fmt = n => (Number(n) || 0).toLocaleString()
const money = n => `₩${fmt(n)}`
const pctVal = (used, total) => total ? Math.round((used / total) * 100) : 0
const pctColor = p => p >= 100 ? 'var(--red)' : p >= 80 ? 'var(--amber)' : 'var(--accent)'

function norm(value) {
  return String(value || '').trim().toLowerCase()
}

function matchesName(value, target) {
  const a = norm(value)
  const b = norm(target)
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

function isCancelled(reservation) {
  return reservation?.type === 'cancelled' || reservation?.reservation_status === '취소'
}

function isBusinessReservation(reservation) {
  return reservation?.op === '사업비' || reservation?.operation_type === 'business' || !!reservation?.biz_id
}

function isBusinessUsage(usage) {
  return usage?.operation_type === 'business' || !!usage?.biz_id
}

function reimbursementStatus(total, reimbursed) {
  const paid = Number(reimbursed) || 0
  const amount = Number(total) || 0
  if (amount <= 0 || paid <= 0) return '미정산'
  if (paid >= amount) return '정산완료'
  return '일부정산'
}

function packageTarget(item) {
  return item?.match_package_name || item?.item_name || ''
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)
}

function usageDetailsFromRows(usages, reservations) {
  return usages
    .map(usage => {
      const reservation = reservations.find(r => r.no === usage.reservation_no)
      if (!reservation || isCancelled(reservation)) return null
      const people = Number(usage.people_count) || 0
      const amount = Number(usage.used_amount || usage.prepaid_total_amount) || people * (Number(usage.unit_amount || usage.prepaid_unit_amount) || 0)
      const reimbursed = Number(usage.reimbursed_amount) || 0
      return {
        no: reservation.no,
        date: reservation.date,
        customer: reservation.customer,
        zone_code: usage.zone_code || '',
        zone_codes: Array.isArray(usage.zone_codes) && usage.zone_codes.length ? usage.zone_codes : (usage.zone_code ? [usage.zone_code] : []),
        zone_name: usage.zone_name || '',
        item_name: usage.item_name || usage.package_name || reservation.package_name,
        package_name: usage.package_name || reservation.package_name,
        people,
        amount,
        discount_rate: Number(usage.discount_rate) || 0,
        customer_unit_price: Number(usage.customer_unit_price) || 0,
        normal_unit_price: Number(usage.normal_unit_price) || 0,
        prepaid_unit_amount: Number(usage.prepaid_unit_amount) || 0,
        reimbursed,
        unpaid: Math.max(amount - reimbursed, 0),
        target: usage.reimbursement_target || '',
        status: usage.reimbursement_status || reimbursementStatus(amount, reimbursed),
        memo: usage.reimbursement_memo || usage.memo || '',
      }
    })
    .filter(Boolean)
}

function collapseUsageDetailsByReservation(details) {
  const grouped = new Map()
  for (const detail of details || []) {
    const key = String(detail.no || '')
    if (!key) continue
    const prev = grouped.get(key)
    if (!prev) {
      grouped.set(key, {
        ...detail,
        zone_codes: Array.isArray(detail.zone_codes) ? [...detail.zone_codes] : [],
      })
      continue
    }

    const prevPeople = Number(prev.people) || 0
    const nextPeople = Number(detail.people) || 0
    if (nextPeople > prevPeople) {
      prev.people = nextPeople
      prev.amount = Number(detail.amount) || 0
      prev.customer_unit_price = Number(detail.customer_unit_price) || prev.customer_unit_price || 0
      prev.normal_unit_price = Number(detail.normal_unit_price) || prev.normal_unit_price || 0
      prev.prepaid_unit_amount = Number(detail.prepaid_unit_amount) || prev.prepaid_unit_amount || 0
    }
    prev.reimbursed = Math.max(Number(prev.reimbursed) || 0, Number(detail.reimbursed) || 0)
    prev.unpaid = Math.max(Number(prev.unpaid) || 0, Number(detail.unpaid) || 0)
    prev.zone_codes = [...new Set([...(prev.zone_codes || []), ...(detail.zone_codes || [])].filter(Boolean))]
    if (!prev.zone_code && detail.zone_code) prev.zone_code = detail.zone_code
    if (!prev.zone_name && detail.zone_name) prev.zone_name = detail.zone_name
    if (detail.item_name && !String(prev.item_name || '').includes(detail.item_name)) {
      prev.item_name = [prev.item_name, detail.item_name].filter(Boolean).join(', ')
    }
    if (detail.package_name && !String(prev.package_name || '').includes(detail.package_name)) {
      prev.package_name = [prev.package_name, detail.package_name].filter(Boolean).join(', ')
    }
    grouped.set(key, prev)
  }
  return [...grouped.values()]
}

function autoProductUsage(item, reservations, snapshots) {
  const targetPackage = packageTarget(item)
  const targetProgram = item.match_program_name
  const details = []
  const counted = new Set()

  for (const reservation of reservations) {
    if (isCancelled(reservation)) continue
    if (!isBusinessReservation(reservation)) continue
    if (item.biz_id && String(reservation.biz_id || '') !== String(item.biz_id)) continue

    const reservationSnapshots = snapshots.filter(s => s.reservation_no === reservation.no)
    const packageMatched =
      matchesName(reservation.package_name, targetPackage) ||
      reservationSnapshots.some(s => matchesName(s.package_name, targetPackage))
    const programMatched = targetProgram
      ? reservationSnapshots.some(s => matchesName(s.prog_name, targetProgram))
      : reservationSnapshots.some(s => matchesName(s.prog_name, item.item_name))

    if (!packageMatched && !programMatched) continue
    if (counted.has(reservation.no)) continue

    counted.add(reservation.no)
    const people = Number(reservation.pax) || 0
    details.push({
      no: reservation.no,
      date: reservation.date,
      customer: reservation.customer,
      package_name: reservation.package_name,
      people,
      amount: people * (Number(item.support_unit_amount) || 0),
    })
  }

  return {
    usedPeople: sum(details, 'people'),
    usedAmount: sum(details, 'amount'),
    details,
  }
}

function buildProductUsage(item, reservations, snapshots, budgetUsages) {
  const explicit = budgetUsages.filter(usage =>
    usage.usage_type === 'product_operation' &&
    isBusinessUsage(usage) &&
    String(usage.budget_item_id || '') === String(item.id || '')
  )
  if (explicit.length) {
    const details = collapseUsageDetailsByReservation(usageDetailsFromRows(explicit, reservations))
    return { usedPeople: sum(details, 'people'), usedAmount: sum(details, 'amount'), details }
  }
  return autoProductUsage(item, reservations, snapshots)
}

function buildPromotionUsage(item, reservations, budgetUsages) {
  const explicit = budgetUsages.filter(usage =>
    usage.usage_type === 'promotion_discount' &&
    isBusinessUsage(usage) &&
    String(usage.budget_item_id || '') === String(item.id || '')
  )
  const details = collapseUsageDetailsByReservation(usageDetailsFromRows(explicit, reservations))
  return {
    usedPeople: sum(details, 'people'),
    usedAmount: sum(details, 'amount'),
    reimbursedAmount: sum(details, 'reimbursed'),
    unpaidAmount: sum(details, 'unpaid'),
    details,
  }
}

function usageForZone(usage, zoneCode) {
  if (!zoneCode) return usage
  const details = (usage.details || []).filter(detail =>
    (Array.isArray(detail.zone_codes) && detail.zone_codes.includes(zoneCode)) ||
    detail.zone_code === zoneCode
  )
  return {
    usedPeople: sum(details, 'people'),
    usedAmount: sum(details, 'amount'),
    reimbursedAmount: sum(details, 'reimbursed'),
    unpaidAmount: sum(details, 'unpaid'),
    details,
  }
}

function uniqueUsageDetails(details) {
  const seen = new Set()
  return (details || []).filter(detail => {
    const key = `${detail.no || ''}|${detail.package_name || detail.item_name || ''}|${detail.amount}|${detail.people}|${detail.date || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function reservationUsageRows(productUsage, promoUsage, cardOrFallbackCustomerUnit) {
  const promoByKey = new Map((promoUsage.details || []).map(detail => [
    `${detail.no || ''}|${detail.package_name || detail.item_name || ''}|${detail.date || ''}`,
    detail,
  ]))
  return uniqueUsageDetails(productUsage.details || [])
    .map(detail => {
      const key = `${detail.no || ''}|${detail.package_name || detail.item_name || ''}|${detail.date || ''}`
      const promo = promoByKey.get(key)
      const discountRate = Number(promo?.discount_rate || detail.discount_rate || 0)
      const fallbackCustomerUnit =
        typeof cardOrFallbackCustomerUnit === 'object'
          ? (discountRate > 0 ? Number(cardOrFallbackCustomerUnit.discountCustomerUnit) : Number(cardOrFallbackCustomerUnit.normalUnit))
          : Number(cardOrFallbackCustomerUnit || 0)
      const customerUnit = Number(promo?.customer_unit_price || detail.customer_unit_price || fallbackCustomerUnit || 0)
      const prepaid = Number(promo?.amount || promo?.prepaid_unit_amount * promo?.people || 0)
      const reimbursed = Number(promo?.reimbursed || 0)
      return {
        ...detail,
        discount_rate: discountRate,
        discountRate,
        customer_unit: customerUnit,
        customer_total: customerUnit * (Number(detail.people) || 0),
        customerTotal: customerUnit * (Number(detail.people) || 0),
        prepaid,
        reimbursed,
        unpaid: Math.max(prepaid - reimbursed, 0),
        status: promo?.status || (prepaid > 0 ? reimbursementStatus(prepaid, reimbursed) : '-'),
      }
    })
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.no || '').localeCompare(String(b.no || '')))
}

function aggregateVendorRows(packageName, snapshots, reservations, usageDetails = []) {
  const detailNos = new Set((usageDetails || []).map(detail => detail.no).filter(Boolean))
  const activeNos = detailNos.size
    ? detailNos
    : new Set(reservations.filter(r => !isCancelled(r) && isBusinessReservation(r)).map(r => r.no))
  const grouped = new Map()
  for (const snap of snapshots) {
    if (!activeNos.has(snap.reservation_no)) continue
    if (!matchesName(snap.package_name, packageName)) continue
    const key = `${snap.vendor_key || ''}|${snap.vendor_name || ''}|${snap.prog_name || ''}`
    const prev = grouped.get(key) || {
      vendor_key: snap.vendor_key,
      vendor_name: snap.vendor_name || snap.vendor_key || '-',
      prog_name: snap.prog_name || '-',
      people: 0,
      amount: 0,
    }
    prev.people += Number(snap.pax) || 0
    prev.amount += Number(snap.vendor_settle_total) || 0
    grouped.set(key, prev)
  }
  return [...grouped.values()].sort((a, b) => `${a.vendor_name}${a.prog_name}`.localeCompare(`${b.vendor_name}${b.prog_name}`))
}

export default function BizPage() {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [reservations, setReservations] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [budgetUsages, setBudgetUsages] = useState([])
  const [bizList, setBizList] = useState([])
  const [packages, setPackages] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [tab, setTab] = useState('structure')
  const [selectedBizId, setSelectedBizId] = useState('')
  const [selectedZones, setSelectedZones] = useState([])
  const [reimburseBizId, setReimburseBizId] = useState('')
  const [reimburseZones, setReimburseZones] = useState([])
  const [reimburseView, setReimburseView] = useState('pending')
  const [open, setOpen] = useState({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function load() {
    setLoading(true)
    const [itemRes, reservationRes, snapshotRes, usageRes, bizRes, packageRes, zoneRes] = await Promise.all([
      supabase
        .from('biz_budget_items')
        .select('id,biz_id,category,item_name,sale_type,match_package_name,match_program_name,support_unit_amount,planned_people_count,total_budget_amount,support_rate,sort_order,is_active,is_deleted,default_reimbursement_target,zone_code')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('category')
        .order('sort_order'),
      supabase
        .from('reservations')
        .select('no,date,customer,package_name,pax,type,reservation_status,biz_id,op')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('date', { ascending: false }),
      supabase
        .from('reservation_program_snapshots')
        .select('reservation_no,package_name,prog_name,vendor_key,vendor_name,pax,vendor_settle_total,is_deleted')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      supabase
        .from('reservation_budget_usages')
        .select('id,reservation_no,usage_type,operation_type,biz_id,biz_name,budget_item_id,zone_code,zone_codes,zone_name,item_name,package_name,people_count,used_amount,unit_amount,prepaid_total_amount,prepaid_unit_amount,reimbursed_amount,reimbursed_at,reimbursement_target,reimbursement_status,reimbursement_memo,memo,discount_label,discount_rate,customer_unit_price,normal_unit_price,updated_at,is_deleted')
        .or('is_deleted.is.null,is_deleted.eq.false'),
      supabase
        .from('biz')
        .select('id,name,is_deleted')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('name'),
      supabase
        .from('packages')
        .select('id,name,zone_code,is_deleted,package_zones(zone_code,is_deleted),package_programs(code,vendor_key,prog_name,is_deleted,vendors(key,name,vendor_programs(prog_name,zone_code,is_deleted)))')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('zone_code')
        .order('name'),
      supabase
        .from('zones')
        .select('code,name,is_deleted')
        .order('code'),
    ])

    setSchemaMissing(!!itemRes.error || !!usageRes.error)
    setItems(itemRes.data || [])
    setReservations(reservationRes.data || [])
    setSnapshots(snapshotRes.data || [])
    setBudgetUsages(usageRes.data || [])
    setBizList(bizRes.data || [])
    setPackages(packageRes.data || [])
    setZones(zoneRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const zoneMap = useMemo(() => {
    const map = {}
    for (const zone of zones) map[zone.code] = zone.name
    return map
  }, [zones])

  const packageZoneCodes = pkg => {
    const linked = (pkg?.package_zones || []).filter(z => z && z.is_deleted !== true).map(z => z.zone_code).filter(Boolean)
    return linked.length ? [...new Set(linked)] : (pkg?.zone_code ? [pkg.zone_code] : [])
  }

  const packageProgramZoneCodes = pkg => {
    const codes = (pkg?.package_programs || []).map(program => {
      const codePrefix = String(program.code || '').split('-')[0]
      return zoneMap[codePrefix] ? codePrefix : ''
    }).filter(Boolean)
    return [...new Set(codes)]
  }

  const packageZoneLabel = pkg => {
    const codes = packageZoneCodes(pkg)
    if (!codes.length) return ''
    const names = codes.map(code => zoneMap[code] || code)
    return names.length <= 2 ? names.join(' · ') : `${names.length}구역`
  }

  const productItems = useMemo(() => {
    return items
      .filter(item => item.is_active !== false && item.category === 'product_operation')
      .filter(item => !selectedBizId || !item.biz_id || String(item.biz_id) === String(selectedBizId))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [items, selectedBizId])

  const promotionItems = useMemo(() => {
    return items
      .filter(item => item.is_active !== false && item.category === 'promotion_discount')
      .filter(item => !selectedBizId || !item.biz_id || String(item.biz_id) === String(selectedBizId))
  }, [items, selectedBizId])

  const businessPackages = useMemo(() => {
    return packages.filter(pkg => (pkg.package_type || 'general') === 'business')
  }, [packages])

  const cards = useMemo(() => {
    return productItems.map(product => {
      const promo = promotionItems.find(item =>
        matchesName(item.item_name, product.item_name) &&
        (item.sale_type || 'package') === (product.sale_type || 'package') &&
        String(item.biz_id || '') === String(product.biz_id || '')
      )
      const pkg = (product.sale_type || 'package') === 'package'
        ? businessPackages.find(p => matchesName(p.name, packageTarget(product)))
        : null
      const biz = bizList.find(item => String(item.id) === String(product.biz_id))
      const actualZoneCodes = packageProgramZoneCodes(pkg)
      const pkgZoneCodes = packageZoneCodes(pkg)
      const zoneCodes = pkg
        ? (pkgZoneCodes.length ? pkgZoneCodes : actualZoneCodes)
        : ((product.sale_type || 'package') === 'package' ? [] : (product.zone_code ? [product.zone_code] : []))
      const zoneCode = zoneCodes[0] || ''
      const productUsage = buildProductUsage(product, reservations, snapshots, budgetUsages)
      const promoUsage = promo ? buildPromotionUsage(promo, reservations, budgetUsages) : { usedPeople: 0, usedAmount: 0, reimbursedAmount: 0, unpaidAmount: 0, details: [] }
      const plannedPeople = Number(product.planned_people_count) || 0
      const discountPlanPeople = Number(promo?.planned_people_count) || 0
      const normalPlanPeople = Math.max(plannedPeople - discountPlanPeople, 0)
      const totalUsedPeople = productUsage.usedPeople
      const discountUsedPeople = promoUsage.usedPeople
      const normalUsedPeople = normalPlanPeople > 0 ? Math.max(totalUsedPeople - discountUsedPeople, 0) : 0
      const normalUnit = Number(product.support_unit_amount) || 0
      const discountRate = Number(promo?.support_rate) || 0
      const discountCustomerUnit = promo ? Math.round(normalUnit * (100 - discountRate) / 100) : 0
      const vendorRows = aggregateVendorRows(packageTarget(product), snapshots, reservations, productUsage.details)

      return {
        id: product.id,
        product,
        promo,
        pkg,
        bizId: product.biz_id || '',
        bizName: biz?.name || product.biz_name || '사업비 미지정',
        zoneCode,
        zoneCodes,
        actualZoneCodes,
        zoneName: packageZoneLabel(pkg) || zoneMap[zoneCode] || zoneCode || '구역 미지정',
        plannedPeople,
        normalPlanPeople,
        discountPlanPeople,
        normalUsedPeople,
        discountUsedPeople,
        totalUsedPeople,
        normalUnit,
        discountRate,
        discountCustomerUnit,
        prepaidUnit: Number(promo?.support_unit_amount) || 0,
        prepaidTotal: promoUsage.usedAmount,
        reimbursedAmount: promoUsage.reimbursedAmount,
        unpaidAmount: promoUsage.unpaidAmount,
        productUsage,
        promoUsage,
        vendorRows,
      }
    })
  }, [productItems, promotionItems, businessPackages, reservations, snapshots, budgetUsages, zoneMap, bizList])

  const availableZones = useMemo(() => {
    const codes = [...new Set(cards.flatMap(card => card.zoneCodes || []).filter(Boolean))]
    return codes.map(code => ({ code, name: zoneMap[code] || code }))
  }, [cards, zoneMap])

  const visibleCards = useMemo(() => {
    if (!selectedZones.length) return cards
    return cards.filter(card => (card.zoneCodes || []).some(code => selectedZones.includes(code)))
  }, [cards, selectedZones])

  const groupedByZone = useMemo(() => {
    const grouped = new Map()
    for (const card of visibleCards) {
      const key = (card.zoneCodes || []).join('|') || 'none'
      if (!grouped.has(key)) grouped.set(key, { code: card.zoneCode, name: card.zoneName, cards: [] })
      grouped.get(key).cards.push(card)
    }
    return [...grouped.values()]
  }, [visibleCards])

  const groupedByBiz = useMemo(() => {
    const grouped = new Map()
    for (const card of visibleCards) {
      const bizKey = card.bizId || 'none'
      if (!grouped.has(bizKey)) {
        grouped.set(bizKey, {
          id: card.bizId,
          name: card.bizName,
          cards: [],
          zoneMap: new Map(),
        })
      }
      const bizGroup = grouped.get(bizKey)
      const targetZoneCodes = selectedZones.length
        ? selectedZones.filter(code => (card.zoneCodes || []).includes(code))
        : [(card.zoneCodes || []).join('|') || 'none']
      if (!targetZoneCodes.length) continue
      bizGroup.cards.push(card)
      for (const zoneKey of targetZoneCodes) {
        const isCombinedZone = !selectedZones.length
        const groupCode = isCombinedZone ? card.zoneCode : zoneKey
        const groupName = isCombinedZone ? card.zoneName : (zoneMap[zoneKey] || zoneKey)
        if (!bizGroup.zoneMap.has(zoneKey)) {
          bizGroup.zoneMap.set(zoneKey, { key: zoneKey, code: groupCode, name: groupName, cards: [] })
        }
        bizGroup.zoneMap.get(zoneKey).cards.push({
          ...card,
          viewZoneCode: isCombinedZone ? '' : zoneKey,
          viewZoneName: groupName,
          viewHasProgram: isCombinedZone || (card.actualZoneCodes || []).includes(zoneKey),
        })
      }
    }

    return [...grouped.values()].map(group => ({
      ...group,
      zones: [...group.zoneMap.values()].filter(zone => !selectedZones.length || selectedZones.includes(zone.code)),
      zoneMap: undefined,
    })).filter(group => group.zones.length > 0)
  }, [visibleCards, selectedZones, zoneMap])

  const totals = useMemo(() => {
    const totalCards = selectedZones.length
      ? visibleCards.filter(card => !card.pkg || (card.actualZoneCodes || []).some(code => selectedZones.includes(code)))
      : visibleCards
    const cardUsageForSelectedZones = (card, usage) => {
      if (!selectedZones.length) return usage
      const details = uniqueUsageDetails(selectedZones.flatMap(code => usageForZone(usage, code).details || []))
      return {
        usedPeople: sum(details, 'people'),
        usedAmount: sum(details, 'amount'),
        reimbursedAmount: sum(details, 'reimbursed'),
        unpaidAmount: sum(details, 'unpaid'),
        details,
      }
    }
    const productUsages = totalCards.map(card => cardUsageForSelectedZones(card, card.productUsage))
    const promoUsages = totalCards.map(card => cardUsageForSelectedZones(card, card.promoUsage))
    return {
      plannedPeople: sum(totalCards, 'plannedPeople'),
      usedPeople: sum(productUsages, 'usedPeople'),
      discountPeople: sum(promoUsages, 'usedPeople'),
      prepaid: sum(promoUsages, 'usedAmount'),
      unpaid: sum(promoUsages, 'unpaidAmount'),
      reimbursed: sum(promoUsages, 'reimbursedAmount'),
    }
  }, [visibleCards, selectedZones])

  const reimbursementRows = useMemo(() => {
    return budgetUsages
      .filter(usage => usage.usage_type === 'promotion_discount')
      .map(usage => {
        const reservation = reservations.find(r => r.no === usage.reservation_no)
        if (!reservation || isCancelled(reservation)) return null
        const prepaid = Number(usage.prepaid_total_amount || usage.used_amount) || 0
        const reimbursed = Number(usage.reimbursed_amount) || 0
        const status = usage.reimbursement_status || reimbursementStatus(prepaid, reimbursed)
        return {
          id: usage.id,
          reservation_no: usage.reservation_no,
          date: reservation.date,
          customer: reservation.customer,
          biz_id: usage.biz_id || '',
          biz_name: usage.biz_name || bizList.find(b => String(b.id) === String(usage.biz_id))?.name || '-',
          zone_code: usage.zone_code || '',
          zone_codes: Array.isArray(usage.zone_codes) && usage.zone_codes.length ? usage.zone_codes : (usage.zone_code ? [usage.zone_code] : []),
          zone_name: usage.zone_name || zoneMap[usage.zone_code] || usage.zone_code || '-',
          package_name: usage.item_name || usage.package_name || reservation.package_name || '-',
          discount_label: usage.discount_label || `${Number(usage.discount_rate) || 0}% 할인`,
          people: Number(usage.people_count) || 0,
          target: usage.reimbursement_target || '-',
          prepaid,
          reimbursed,
          unpaid: Math.max(prepaid - reimbursed, 0),
          status,
          completed_at: usage.reimbursed_at || usage.updated_at || null,
        }
      })
      .filter(Boolean)
      .filter(row => !reimburseBizId || String(row.biz_id || '') === String(reimburseBizId))
      .filter(row => !reimburseZones.length || reimburseZones.some(code => (row.zone_codes || []).includes(code) || row.zone_code === code))
      .filter(row => !dateFrom || row.date >= dateFrom)
      .filter(row => !dateTo || row.date <= dateTo)
  }, [budgetUsages, reservations, bizList, zoneMap, reimburseBizId, reimburseZones, dateFrom, dateTo])

  const pendingReimbursementRows = useMemo(() => {
    return reimbursementRows.filter(row => row.status !== '정산완료')
  }, [reimbursementRows])

  const completedReimbursementRows = useMemo(() => {
    return reimbursementRows.filter(row => row.status === '정산완료')
  }, [reimbursementRows])

  const visibleReimbursementRows = reimburseView === 'completed'
    ? completedReimbursementRows
    : pendingReimbursementRows

  function toggleZone(code) {
    setSelectedZones(prev => prev.includes(code) ? prev.filter(item => item !== code) : [...prev, code])
  }

  function toggleReimburseZone(code) {
    setReimburseZones(prev => prev.includes(code) ? prev.filter(item => item !== code) : [...prev, code])
  }

  async function updateReimbursement(row, mode) {
    const paidAmount = mode === 'complete' ? row.prepaid : 0
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('reservation_budget_usages')
      .update({
        reimbursed_amount: paidAmount,
        reimbursement_status: mode === 'complete' ? '정산완료' : '미정산',
        reimbursed_at: mode === 'complete' ? now : null,
        updated_at: now,
      })
      .eq('id', row.id)

    if (error) {
      alert('지원금 정산 상태 변경 실패: ' + error.message)
      return
    }
    await load()
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>조회 중...</div>
  }

  return (
    <div className="biz-page">
      <div className="section-header" style={{ marginBottom: '14px' }}>
        <div>
          <div className="section-title">사업비 관리</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            사업비명, 구역, 패키지별로 이용 인원과 지원금 정산 금액을 확인합니다.
          </div>
        </div>
        <button className="btn-outline" onClick={load}>새로고침</button>
      </div>

      {schemaMissing && (
        <div className="list-card" style={{ padding: '12px 14px', marginBottom: '14px', borderColor: 'rgba(247,201,72,.35)' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--amber)', marginBottom: '4px' }}>사업비 사용 내역 테이블 확인 필요</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Supabase에서 `supabase_reservation_budget_usages_schema_20260514.sql` 실행 여부를 확인하세요.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button className={tab === 'structure' ? 'btn-primary' : 'btn-outline'} onClick={() => setTab('structure')}>사업비 구조 현황</button>
        <button className={tab === 'reimburse' ? 'btn-primary' : 'btn-outline'} onClick={() => setTab('reimburse')}>지원금 정산 내역</button>
      </div>

      {tab === 'structure' ? (
        <>
          <div className="list-card" style={{ padding: '14px', marginBottom: '14px' }}>
            <div className="biz-filter-grid" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'start' }}>
              <div className="form-field" style={{ margin: 0 }}>
                <label>사업비명</label>
                <select className="form-select" value={selectedBizId} onChange={e => setSelectedBizId(e.target.value)}>
                  <option value="">전체 / 미지정 포함</option>
                  {bizList.map(biz => <option key={biz.id} value={biz.id}>{biz.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>구역 체크</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className={!selectedZones.length ? 'btn-primary' : 'btn-outline'} style={{ height: '30px', padding: '0 10px', fontSize: '12px' }} onClick={() => setSelectedZones([])}>전체</button>
                  {availableZones.map(zone => (
                    <button
                      key={zone.code}
                      className={selectedZones.includes(zone.code) ? 'btn-primary' : 'btn-outline'}
                      style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
                      onClick={() => toggleZone(zone.code)}
                    >
                      {zone.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="kpi-grid" style={{ marginBottom: '16px' }}>
            <div className="kpi-card">
              <div className="kpi-label">총 계획 인원</div>
              <div className="kpi-value" style={{ fontSize: '22px' }}>{fmt(totals.plannedPeople)}명</div>
              <div className="kpi-sub">선택 구역 기준</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">실제 이용 인원</div>
              <div className="kpi-value" style={{ fontSize: '22px', color: totals.usedPeople > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{fmt(totals.usedPeople)}명</div>
              <div className="kpi-sub">할인/비할인 합산</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">할인 적용 인원</div>
              <div className="kpi-value" style={{ fontSize: '22px', color: totals.discountPeople > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{fmt(totals.discountPeople)}명</div>
              <div className="kpi-sub">명시 연결된 예약 기준</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">미정산 지원금</div>
              <div className="kpi-value" style={{ fontSize: '22px', color: totals.unpaid > 0 ? 'var(--red)' : 'var(--green)' }}>{money(totals.unpaid)}</div>
              <div className="kpi-sub">지원금 {money(totals.prepaid)} / 정산완료 {money(totals.reimbursed)}</div>
            </div>
          </div>

          {groupedByBiz.length === 0 ? (
            <div className="list-card" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>표시할 사업비 패키지가 없습니다.</div>
          ) : groupedByBiz.map(bizGroup => (
            <div key={bizGroup.id || 'none'} style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 900 }}>{bizGroup.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {bizGroup.zones.length}개 구역 · {bizGroup.cards.length}개 사업비 패키지
                  </div>
                </div>
              </div>
              {bizGroup.zones.map(group => (
                <div key={`${bizGroup.id || 'none'}-${group.key || group.code || 'none'}`} style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 900, marginBottom: '8px', color: 'var(--accent)' }}>{group.name}</div>
                  <div className="biz-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '12px' }}>
                    {group.cards.map(card => {
                      const cardOpenKey = `${card.id}-${card.viewZoneCode || 'combined'}`
                      const opened = !!open[cardOpenKey]
                      const emptyZone = card.viewHasProgram === false
                      const zoneProductUsage = card.viewZoneCode ? usageForZone(card.productUsage, card.viewZoneCode) : card.productUsage
                      const zonePromoUsage = card.viewZoneCode ? usageForZone(card.promoUsage, card.viewZoneCode) : card.promoUsage
                      const displayUsedPeople = emptyZone ? 0 : zoneProductUsage.usedPeople
                      const displayPlannedPeople = emptyZone ? 0 : card.plannedPeople
                      const progress = pctVal(displayUsedPeople, displayPlannedPeople)
                      const displayNormalPlanPeople = emptyZone ? 0 : card.normalPlanPeople
                      const displayNormalUsedPeople = emptyZone ? 0 : Math.max(displayUsedPeople - zonePromoUsage.usedPeople, 0)
                      const displayDiscountPlanPeople = emptyZone ? 0 : card.discountPlanPeople
                      const displayDiscountUsedPeople = emptyZone ? 0 : zonePromoUsage.usedPeople
                      const displayPrepaidTotal = emptyZone ? 0 : zonePromoUsage.usedAmount
                      const displayUnpaidAmount = emptyZone ? 0 : zonePromoUsage.unpaidAmount
                      const displayReimbursedAmount = emptyZone ? 0 : zonePromoUsage.reimbursedAmount
                      const displayVendorRows = emptyZone ? [] : card.vendorRows
                      const displayReservationRows = emptyZone ? [] : reservationUsageRows(zoneProductUsage, zonePromoUsage, card)
                      const reservationCount = displayReservationRows.length
                      const recentCustomers = [...new Set(displayReservationRows.map(row => row.customer).filter(Boolean))].slice(0, 2)
                      return (
                        <div key={`${card.id}-${card.viewZoneCode || 'combined'}`} className="list-card biz-card" style={{ padding: '14px', borderColor: opened ? 'rgba(78,205,196,.45)' : 'var(--border)' }}>
                          <button
                            type="button"
                            onClick={() => setOpen(prev => ({ ...prev, [cardOpenKey]: !prev[cardOpenKey] }))}
                            style={{ width: '100%', border: 0, background: 'transparent', color: 'inherit', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '15px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.product.item_name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{card.viewZoneName || card.zoneName}</div>
                                {!emptyZone && (
                                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                                    <span style={{ border: '1px solid rgba(78,205,196,.22)', background: 'rgba(78,205,196,.09)', color: 'var(--accent)', borderRadius: '999px', padding: '3px 7px', fontSize: '10px', fontWeight: 900 }}>
                                      예약 {fmt(reservationCount)}건
                                    </span>
                                    {recentCustomers.map(name => (
                                      <span key={name} style={{ border: '1px solid var(--border2)', background: 'rgba(255,255,255,.035)', color: 'var(--text-secondary)', borderRadius: '999px', padding: '3px 7px', fontSize: '10px', fontWeight: 800, maxWidth: '96px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {name}
                                      </span>
                                    ))}
                                    {reservationCount > recentCustomers.length && (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '10px', padding: '3px 0' }}>외 {fmt(reservationCount - recentCustomers.length)}건</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '15px', fontWeight: 900 }}>총 {fmt(displayUsedPeople)} / {fmt(displayPlannedPeople)}명</div>
                                <div style={{ fontSize: '11px', color: emptyZone ? 'var(--text-muted)' : pctColor(progress), marginTop: '3px' }}>{emptyZone ? '구성 없음' : `진행률 ${progress}%`}</div>
                              </div>
                            </div>

                            <div className="biz-discount-list" style={{ display: 'grid', gap: '7px' }}>
                              {emptyZone && (
                                <div style={{ background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '7px', padding: '10px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 800 }}>
                                  해당 구역 구성 프로그램 없음
                                </div>
                              )}
                              {!emptyZone && displayNormalPlanPeople > 0 && (
                                <div className="biz-discount-row" style={{ display: 'grid', gridTemplateColumns: '82px 82px 1fr', gap: '8px', alignItems: 'center', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: '7px', padding: '8px 10px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>할인 없음</span>
                                  <span style={{ fontSize: '12px', fontWeight: 800 }}>{fmt(displayNormalUsedPeople)} / {fmt(displayNormalPlanPeople)}명</span>
                                  <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px', color: 'var(--accent)' }}>고객가 {money(card.normalUnit)}</span>
                                </div>
                              )}
                              {!emptyZone && card.promo && (
                                <div className="biz-discount-row" style={{ display: 'grid', gridTemplateColumns: '82px 82px 1fr auto', gap: '8px', alignItems: 'center', background: 'rgba(247,201,72,.08)', border: '1px solid rgba(247,201,72,.22)', borderRadius: '7px', padding: '8px 10px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--amber)' }}>{Number(card.discountRate)}% 할인</span>
                                  <span style={{ fontSize: '12px', fontWeight: 800 }}>{fmt(displayDiscountUsedPeople)} / {fmt(displayDiscountPlanPeople)}명</span>
                                  <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px' }}>고객가 {money(card.discountCustomerUnit)}</span>
                                  <span style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px', color: 'var(--amber)', whiteSpace: 'nowrap' }}>지원금 {money(displayPrepaidTotal)}</span>
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', fontSize: '11px' }}>
                              <span style={{ color: 'var(--amber)' }}>지원금 {money(displayPrepaidTotal)}</span>
                              <span style={{ color: displayUnpaidAmount > 0 ? 'var(--red)' : 'var(--green)' }}>미정산 {money(displayUnpaidAmount)}</span>
                              <span style={{ color: 'var(--green)' }}>정산완료 {money(displayReimbursedAmount)}</span>
                              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontWeight: 800 }}>{opened ? '접기 ▲' : '상세 보기 ▼'}</span>
                            </div>
                          </button>

                          {opened && (
                            <div style={{ marginTop: '14px', borderTop: '1px solid var(--border2)', paddingTop: '12px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 900 }}>예약 사용 내역</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmt(displayReservationRows.length)}건</div>
                              </div>
                              <div style={{ display: 'grid', gap: '8px', marginBottom: '12px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                                {displayReservationRows.length === 0 ? (
                                  <div className="list-box-empty" style={{ border: '1px solid var(--border2)', borderRadius: '8px' }}>연결된 예약 사용 내역이 없습니다.</div>
                                ) : displayReservationRows.map(row => (
                                  <div
                                    key={`${row.no}-${row.date}-${row.customer}-${row.package_name}-${row.discountRate}`}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '1fr auto',
                                      gap: '10px',
                                      alignItems: 'center',
                                      border: '1px solid var(--border2)',
                                      borderRadius: '8px',
                                      padding: '10px',
                                      background: 'rgba(255,255,255,.025)',
                                    }}
                                  >
                                    <div style={{ minWidth: 0 }}>
                                      <div className="biz-usage-head" style={{ display: 'grid', gridTemplateColumns: '86px 96px 1fr', gap: '8px', alignItems: 'stretch', marginBottom: '8px' }}>
                                        <div style={{ border: '1px solid var(--border2)', borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.26)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>예약번호</div>
                                          <div style={{ fontFamily: 'DM Mono,monospace', fontSize: '12px', fontWeight: 900 }}>#{row.no}</div>
                                        </div>
                                        <div style={{ border: '1px solid var(--border2)', borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.26)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>예약일</div>
                                          <div style={{ fontSize: '12px', fontWeight: 900 }}>{row.date || '-'}</div>
                                        </div>
                                        <div style={{ border: '1px solid var(--border2)', borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.26)', minWidth: 0 }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>고객명</div>
                                          <div style={{ fontSize: '13px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.customer || '-'}</div>
                                        </div>
                                      </div>
                                      <div style={{ border: '1px solid var(--border2)', borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.18)', marginBottom: '6px', minWidth: 0 }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>상품</div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.package_name || row.item_name || '-'}</div>
                                      </div>
                                      <div className="biz-usage-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
                                        <div style={{ borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.22)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>인원</div>
                                          <div style={{ fontSize: '12px', fontWeight: 900 }}>{fmt(row.people)}명</div>
                                        </div>
                                        <div style={{ borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.22)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>고객결제</div>
                                          <div style={{ color: 'var(--accent)', fontFamily: 'DM Mono,monospace', fontSize: '12px', fontWeight: 900 }}>{money(row.customerTotal)}</div>
                                        </div>
                                        <div style={{ borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.22)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>지원금</div>
                                          <div style={{ color: row.prepaid > 0 ? 'var(--amber)' : 'var(--text-muted)', fontFamily: 'DM Mono,monospace', fontSize: '12px', fontWeight: 900 }}>{money(row.prepaid)}</div>
                                        </div>
                                        <div style={{ borderRadius: '7px', padding: '7px 8px', background: 'rgba(10,31,48,.22)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>정산상태</div>
                                          <div style={{ color: row.status === '정산완료' ? 'var(--green)' : row.prepaid > 0 ? 'var(--amber)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 900 }}>{row.status}</div>
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="btn-outline btn-sm"
                                      onClick={() => router.push(`/dashboard/reservations?no=${encodeURIComponent(row.no)}&from=biz`)}
                                      style={{ height: '30px', minWidth: '62px', padding: '0 10px', justifyContent: 'center' }}
                                    >
                                      수정
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '8px' }}>패키지 구성 프로그램</div>
                              <div className="list-box biz-program-list" style={{ marginBottom: '12px' }}>
                                <div className="list-box-header" style={{ gridTemplateColumns: '1fr 1fr 80px 110px' }}>
                                  <span>업체</span><span>프로그램</span><span>이용</span><span>업체 정산액</span>
                                </div>
                                {displayVendorRows.length === 0 ? (
                                  <div className="list-box-empty">정산 스냅샷이 없습니다.</div>
                                ) : displayVendorRows.map(row => (
                                  <div key={`${row.vendor_key}-${row.prog_name}`} className="list-box-row" style={{ gridTemplateColumns: '1fr 1fr 80px 110px' }}>
                                    <span>{row.vendor_name}</span>
                                    <span>{row.prog_name}</span>
                                    <span>{fmt(row.people)}명</span>
                                    <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--amber)' }}>{money(row.amount)}</span>
                                  </div>
                                ))}
                              </div>

                              <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '8px' }}>지원금 정산</div>
                              <div className="biz-support-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                                {[
                                  ['인당 지원금', money(card.prepaidUnit)],
                                  ['지원금 총액', money(card.prepaidTotal)],
                                  ['정산완료액', money(card.reimbursedAmount)],
                                  ['미정산액', money(card.unpaidAmount)],
                                ].map(([label, value]) => (
                                  <div key={label} style={{ border: '1px solid var(--border2)', borderRadius: '8px', padding: '10px', background: 'rgba(255,255,255,.02)' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '5px' }}>{label}</div>
                                    <div style={{ fontFamily: 'DM Mono,monospace', fontSize: '13px', fontWeight: 900 }}>{value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="list-card" style={{ padding: '14px', marginBottom: '14px' }}>
            <div className="biz-filter-grid" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '12px', alignItems: 'start', marginBottom: '12px' }}>
              <div className="form-field" style={{ margin: 0 }}>
                <label>사업비명</label>
                <select className="form-select" value={reimburseBizId} onChange={e => setReimburseBizId(e.target.value)}>
                  <option value="">전체 / 미지정 포함</option>
                  {bizList.map(biz => <option key={biz.id} value={biz.id}>{biz.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>구역 체크</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className={!reimburseZones.length ? 'btn-primary' : 'btn-outline'} style={{ height: '30px', padding: '0 10px', fontSize: '12px' }} onClick={() => setReimburseZones([])}>전체</button>
                  {availableZones.map(zone => (
                    <button
                      key={zone.code}
                      className={reimburseZones.includes(zone.code) ? 'btn-primary' : 'btn-outline'}
                      style={{ height: '30px', padding: '0 10px', fontSize: '12px' }}
                      onClick={() => toggleReimburseZone(zone.code)}
                    >
                      {zone.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="biz-date-grid" style={{ display: 'grid', gridTemplateColumns: '150px 150px auto', gap: '10px', alignItems: 'end' }}>
              <div className="form-field" style={{ margin: 0 }}>
                <label>정산 시작일</label>
                <input className="form-input" value={dateFrom} onChange={e => setDateFrom(formatDateTyping(e.target.value))} placeholder="2026-05-01" maxLength={10} inputMode="numeric" />
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label>정산 종료일</label>
                <input className="form-input" value={dateTo} onChange={e => setDateTo(formatDateTyping(e.target.value))} placeholder="2026-05-31" maxLength={10} inputMode="numeric" />
              </div>
              <button className="btn-outline" onClick={() => { setReimburseBizId(''); setReimburseZones([]); setDateFrom(''); setDateTo(''); setReimburseView('pending') }}>초기화</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 12px' }}>
            <button className={reimburseView === 'pending' ? 'btn-primary' : 'btn-outline'} onClick={() => setReimburseView('pending')}>
              미정산 내역 <span style={{ opacity: .78, marginLeft: '6px' }}>{pendingReimbursementRows.length}건</span>
            </button>
            <button className={reimburseView === 'completed' ? 'btn-primary' : 'btn-outline'} onClick={() => setReimburseView('completed')}>
              정산 완료 이력 <span style={{ opacity: .78, marginLeft: '6px' }}>{completedReimbursementRows.length}건</span>
            </button>
          </div>

          <div className="list-card" style={{ padding: '12px' }}>
            {visibleReimbursementRows.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {reimburseView === 'completed' ? '정산 완료 이력이 없습니다.' : '미정산 지원금 내역이 없습니다.'}
              </div>
            ) : visibleReimbursementRows.map(row => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(170px, 1.15fr) minmax(260px, 1.65fr) auto',
                  gap: '12px',
                  alignItems: 'center',
                  border: '1px solid var(--border2)',
                  borderRadius: '10px',
                  padding: '12px',
                  background: 'rgba(255,255,255,.025)',
                  marginBottom: '10px',
                }}
              className="biz-reimburse-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'DM Mono,monospace', color: 'var(--accent)', fontWeight: 900 }}>#{row.reservation_no}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{row.date || '-'}</span>
                    <span style={{ border: '1px solid var(--border2)', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 800, color: row.status === '정산완료' ? 'var(--green)' : row.unpaid > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{row.status}</span>
                    {row.status === '정산완료' && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>완료일 {String(row.completed_at || '').slice(0, 10) || '-'}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.package_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{row.biz_name} · {row.zone_name}</div>
                </div>

                <div className="biz-reimburse-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '7px' }}>
                  {[
                    ['정산처', row.target],
                    ['인원', `${fmt(row.people)}명`],
                    ['지원금', money(row.prepaid)],
                    ['정산완료', money(row.reimbursed)],
                    ['미정산', money(row.unpaid)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ borderRadius: '8px', background: 'rgba(10,31,48,.22)', padding: '8px', minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '12px', fontWeight: 900, color: label === '지원금' ? 'var(--amber)' : label === '정산완료' ? 'var(--green)' : label === '미정산' && row.unpaid > 0 ? 'var(--red)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className="biz-reimburse-actions" style={{ display: 'flex', justifyContent: 'center' }}>
                  {row.status === '정산완료' ? (
                    <button className="btn-outline btn-sm" style={{ minWidth: '82px' }} onClick={() => updateReimbursement(row, 'reset')}>정산취소</button>
                  ) : (
                    <button className="btn-primary btn-sm" style={{ minWidth: '82px' }} onClick={() => updateReimbursement(row, 'complete')}>정산완료</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
