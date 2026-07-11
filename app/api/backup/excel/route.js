import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { forbiddenResponse, requireApiAdmin } from '@/lib/api-auth'
import { LODGE_CONFIRM_FIELDS, PACKAGE_FIELDS, PACKAGE_PROGRAM_FIELDS, PICKUP_FIELDS, RESERVATION_FIELDS } from '@/lib/api-dto'

export const dynamic = 'force-dynamic'

const BACKUP_COLUMNS = [
  '날짜',
  '고객명',
  '인원',
  '체험단가',
  '총 미정산금액',
  '총 정산금액',
  '총 결제금액',
  '업체명',
  '체험 프로그램명',
  '숙박업체명',
  '숙박공간명',
  '객실명',
  '숙박단가',
  '픽업자명',
  '픽업비',
]

function columnsForAmount(amountColumn) {
  return [
    '날짜',
    '고객명',
    '인원',
    '체험단가',
    amountColumn,
    '업체명',
    '체험 프로그램명',
    '숙박업체명',
    '숙박공간명',
    '객실명',
    '숙박단가',
    '픽업자명',
    '픽업비',
  ]
}

function kstTimestamp() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace('T', '_').slice(0, 16).replace(/[-:]/g, '')
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeExcelText(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function sheetName(name) {
  return name.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet'
}

function columnsFor(rows, preferredColumns = []) {
  if (preferredColumns.length) return preferredColumns
  const columns = [...preferredColumns]
  rows.forEach(row => {
    Object.keys(row || {}).forEach(key => {
      if (!columns.includes(key)) columns.push(key)
    })
  })
  return columns
}

function columnName(index) {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const mod = (n - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    n = Math.floor((n - mod) / 26)
  }
  return name
}

function isNumericCell(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function xlsxCell(value, ref, styleId = '') {
  const style = styleId ? ` s="${styleId}"` : ''
  if (isNumericCell(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(safeExcelText(value))}</t></is></c>`
}

function xlsxSheetXml(rows, preferredColumns = []) {
  const columns = columnsFor(rows, preferredColumns)
  const dataRows = rows.length ? rows : [{ [columns[0] || '데이터 없음']: '데이터 없음' }]
  const effectiveColumns = columns.length ? columns : ['데이터 없음']
  const sheetRows = [
    `<row r="1">${effectiveColumns.map((column, index) => xlsxCell(column, `${columnName(index)}1`, '1')).join('')}</row>`,
    ...dataRows.map((row, rowIndex) => {
      const excelRow = rowIndex + 2
      return `<row r="${excelRow}">${effectiveColumns.map((column, columnIndex) => xlsxCell(row?.[column], `${columnName(columnIndex)}${excelRow}`)).join('')}</row>`
    }),
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows.join('')}</sheetData>
</worksheet>`
}

function workbookXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
  </sheets>
</workbook>`
}

function workbookRelsXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
}

function contentTypesXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font/><font><b/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStore(files) {
  const localParts = []
  const centralParts = []
  let offset = 0

  files.forEach(file => {
    const nameBuffer = Buffer.from(file.name, 'utf8')
    const dataBuffer = Buffer.from(file.data, 'utf8')
    const crc = crc32(dataBuffer)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(dataBuffer.length, 18)
    localHeader.writeUInt32LE(dataBuffer.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuffer, dataBuffer)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(dataBuffer.length, 20)
    centralHeader.writeUInt32LE(dataBuffer.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralParts.push(centralHeader, nameBuffer)
    offset += localHeader.length + nameBuffer.length + dataBuffer.length
  })

  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(files.length, 8)
  endRecord.writeUInt16LE(files.length, 10)
  endRecord.writeUInt32LE(centralDirectory.length, 12)
  endRecord.writeUInt32LE(offset, 16)
  endRecord.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

function workbookXlsx(sheets) {
  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml(sheets) },
    { name: '_rels/.rels', data: rootRelsXml() },
    { name: 'xl/workbook.xml', data: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets) },
    { name: 'xl/styles.xml', data: stylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: xlsxSheetXml(sheet.rows, sheet.columns),
    })),
  ]
  return zipStore(files)
}

function activeRows(rows) {
  return (rows || []).filter(row => row && row.is_deleted !== true)
}

function isActiveReservation(row) {
  return row && row.is_deleted !== true && row.type !== 'cancelled' && row.reservation_status !== '취소'
}

function pkgName(reservation) {
  return reservation?.package_name || reservation?.pkg || ''
}

function lineTotal(price, settleType, pax) {
  const amount = Number(price) || 0
  return settleType === 'fixed' ? amount : amount * (Number(pax) || 0)
}

function unitFromTotal(total, pax) {
  const people = Number(pax) || 0
  if (!people) return Number(total) || 0
  return Math.round((Number(total) || 0) / people)
}

function settleKey(type, vendorKey, item) {
  return [
    type || '',
    vendorKey || '',
    item.no || item.reservation_no || '',
    item.detail || '',
    Number(item.amt) || 0,
  ].join('|')
}

function normalizeSettleType(type, vendorKey) {
  if (vendorKey) return '체험'
  if (['체험', '숙박', '픽업', '플랫폼', '여행사'].includes(type)) return type
  return type || ''
}

function lodgeSettleAmount(lodge, reservation) {
  const price = Number(lodge?.room_price) || 0
  if (lodge?.price_type === 'per_person') {
    return price * (Number(reservation?.pax) || 0)
  }
  return price
}

function lodgeVendorInfo(lodge, lodgeVendors = []) {
  const vendor = lodgeVendors.find(item =>
    activeRows(item.lodges).some(space => space?.name === lodge?.lodge_name)
  )
  return {
    vendorName: vendor?.name || lodge?.lodge_vendor_name || lodge?.lodge_name || '',
    spaceName: lodge?.lodge_name || '',
  }
}

function vendorByProgram(vendors, programName) {
  return (vendors || []).find(vendor =>
    activeRows(vendor.vendor_programs).some(program => program.prog_name === programName)
  )
}

function makeEmptyRow() {
  return Object.fromEntries(BACKUP_COLUMNS.map(column => [column, '']))
}

function reservationBase(reservation) {
  return {
    '날짜': reservation?.date || '',
    '고객명': reservation?.customer || '',
    '인원': Number(reservation?.pax) || '',
  }
}

function buildSettledSet(histories, vendors) {
  const settled = new Set()
  for (const history of activeRows(histories)) {
    const type = normalizeSettleType(history.settle_type, history.vendor_key)
    for (const item of activeRows(history.settle_history_items)) {
      settled.add(settleKey(history.settle_type, history.vendor_key, item))
      settled.add(settleKey(type, history.vendor_key, item))
      if (type === '체험') {
        const vendorKeys = history.vendor_key
          ? [history.vendor_key]
          : [vendorByProgram(vendors, item.detail)?.key].filter(Boolean)
        vendorKeys.forEach(key => settled.add(settleKey('체험', key, item)))
      }
    }
  }
  return settled
}

function findPackage(packages, reservation) {
  const name = pkgName(reservation)
  return (packages || []).find(item => item.name === name)
}

function experienceRowsFromSnapshots(snapshots, reservationByNo, amountColumn, amountMode = 'settle') {
  return activeRows(snapshots)
    .map(snapshot => {
      const reservation = reservationByNo.get(snapshot.reservation_no)
      if (!reservation) return null
      const pax = Number(snapshot.pax) || Number(reservation.pax) || 0
      const settleTotal = Number(snapshot.vendor_settle_total) || 0
      const paymentTotal = Number(snapshot.customer_total) || 0
      const unitPrice = amountMode === 'payment'
        ? Number(snapshot.customer_price) || unitFromTotal(paymentTotal, pax)
        : Number(snapshot.vendor_settle_price) || unitFromTotal(settleTotal, pax)
      const amount = amountMode === 'payment' ? paymentTotal : settleTotal
      if (amountMode !== 'payment' && amount <= 0) return null
      return {
        keyType: '체험',
        vendorKey: snapshot.vendor_key,
        item: { no: reservation.no, detail: snapshot.prog_name, amt: settleTotal },
        row: {
          ...makeEmptyRow(),
          ...reservationBase(reservation),
          '인원': pax || '',
          '체험단가': unitPrice || '',
          [amountColumn]: amount || '',
          '업체명': snapshot.vendor_name || snapshot.vendor_key || '',
          '체험 프로그램명': snapshot.prog_name || '',
        },
      }
    })
    .filter(Boolean)
}

function fallbackExperienceRows(reservations, packages, vendors, snapshotNos, amountColumn, amountMode = 'settle') {
  const rows = []
  for (const reservation of reservations) {
    if (snapshotNos.has(reservation.no)) continue
    const pack = findPackage(packages, reservation)
    if (!pack) continue
    const pax = Number(reservation.pax) || 0
    for (const program of activeRows(pack.package_programs)) {
      const vendor = vendors.find(item => item.key === program.vendor_key)
      const vendorProgram = activeRows(vendor?.vendor_programs).find(item => item.prog_name === program.prog_name)
      const settleType = program.settle_type || vendorProgram?.settle_type || 'per_person'
      const settleUnit = Number(program.vendor_settle_price ?? vendorProgram?.vendor_settle_price ?? vendorProgram?.unit_price) || 0
      const settleTotal = lineTotal(settleUnit, settleType, pax)
      const paymentUnit = Number(pack.total_price) || Number(reservation.price) || 0
      const paymentTotal = amountMode === 'payment' ? (Number(reservation.experience_sales_amount) || lineTotal(paymentUnit, 'per_person', pax)) : settleTotal
      const amount = amountMode === 'payment' ? paymentTotal : settleTotal
      if (amountMode !== 'payment' && amount <= 0) continue
      rows.push({
        keyType: '체험',
        vendorKey: program.vendor_key,
        item: { no: reservation.no, detail: program.prog_name, amt: settleTotal },
        row: {
          ...makeEmptyRow(),
          ...reservationBase(reservation),
          '체험단가': amountMode === 'payment' ? paymentUnit : settleUnit,
          [amountColumn]: amount || '',
          '업체명': vendor?.name || program.vendor_key || '',
          '체험 프로그램명': program.prog_name || '',
        },
      })
    }
  }
  return rows
}

function lodgeRows(lodges, reservationByNo, lodgeVendors, amountColumn) {
  return activeRows(lodges)
    .map(lodge => {
      const reservation = reservationByNo.get(lodge.reservation_no)
      if (!reservation || !lodge.lodge_name || !lodge.room_price) return null
      const amount = lodgeSettleAmount(lodge, reservation)
      if (amount <= 0) return null
      const info = lodgeVendorInfo(lodge, lodgeVendors)
      const detail = `${info.spaceName || '-'} · ${lodge.room_name || ''}${lodge.price_type === 'per_person' ? ' · 인원당' : ''}`
      return {
        keyType: '숙박',
        vendorKey: null,
        item: { no: reservation.no, detail, amt: amount },
        legacyItems: [
          { no: reservation.no, detail: `${lodge.room_name || ''}${lodge.price_type === 'per_person' ? ' · 인원당' : ''}`, amt: amount },
          { no: reservation.no, detail: lodge.room_name || '', amt: amount },
        ],
        row: {
          ...makeEmptyRow(),
          ...reservationBase(reservation),
          [amountColumn]: amount,
          '숙박업체명': info.vendorName,
          '숙박공간명': info.spaceName,
          '객실명': lodge.room_name || '',
          '숙박단가': Number(lodge.room_price) || '',
        },
      }
    })
    .filter(Boolean)
}

function pickupRows(pickups, reservationByNo, amountColumn) {
  return activeRows(pickups)
    .map(pickup => {
      const reservation = reservationByNo.get(pickup.reservation_no)
      const amount = Number(pickup.pickup_fee) || 0
      if (!reservation || amount <= 0) return null
      return {
        keyType: '픽업',
        vendorKey: null,
        item: { no: reservation.no, detail: pickup.pickup_place || '', amt: amount },
        row: {
          ...makeEmptyRow(),
          ...reservationBase(reservation),
          [amountColumn]: amount,
          '픽업자명': pickup.drivers?.name || pickup.driver_name || '',
          '픽업비': amount,
        },
      }
    })
    .filter(Boolean)
}

function applySettledFilter(candidates, settled, settledMode = false) {
  return candidates.filter(candidate => {
    const keys = [
      settleKey(candidate.keyType, candidate.vendorKey, candidate.item),
      settleKey(candidate.keyType, null, candidate.item),
      ...(candidate.legacyItems || []).flatMap(item => [
        settleKey(candidate.keyType, candidate.vendorKey, item),
        settleKey(candidate.keyType, null, item),
      ]),
    ]
    const found = keys.some(key => settled.has(key))
    return settledMode ? found : !found
  }).map(candidate => candidate.row)
}

function historyVendorName(history, vendors) {
  if (history.vendors?.name) return history.vendors.name
  const vendor = vendors.find(item => item.key === history.vendor_key)
  if (vendor?.name) return vendor.name
  const firstDetail = activeRows(history.settle_history_items)[0]?.detail || ''
  const detailVendor = vendorByProgram(vendors, firstDetail)
  if (detailVendor?.name) return detailVendor.name
  return ''
}

function matchLodgeForHistory(item, lodges, reservationByNo, lodgeVendors) {
  const reservation = reservationByNo.get(item.reservation_no || item.no)
  const candidates = activeRows(lodges).filter(lodge => lodge.reservation_no === (item.reservation_no || item.no))
  const matched = candidates.find(lodge =>
    String(item.detail || '').includes(lodge.lodge_name || '') ||
    String(item.detail || '').includes(lodge.room_name || '')
  ) || candidates.find(lodge => lodgeSettleAmount(lodge, reservation) === Number(item.amt))
  if (!matched) return {}
  const info = lodgeVendorInfo(matched, lodgeVendors)
  return {
    '숙박업체명': info.vendorName,
    '숙박공간명': info.spaceName,
    '객실명': matched.room_name || '',
    '숙박단가': Number(matched.room_price) || '',
  }
}

function matchPickupForHistory(item, pickups) {
  const candidates = activeRows(pickups).filter(pickup => pickup.reservation_no === (item.reservation_no || item.no))
  const matched = candidates.find(pickup => Number(pickup.pickup_fee) === Number(item.amt)) || candidates[0]
  if (!matched) return {}
  return {
    '픽업자명': matched.drivers?.name || matched.driver_name || '',
    '픽업비': Number(matched.pickup_fee) || '',
  }
}

function completedRows(histories, reservationByNo, vendors, lodges, lodgeVendors, pickups) {
  const rows = []
  for (const history of activeRows(histories)) {
    const type = normalizeSettleType(history.settle_type, history.vendor_key)
    const vendorName = historyVendorName(history, vendors)
    for (const item of activeRows(history.settle_history_items)) {
      const reservation = reservationByNo.get(item.reservation_no || item.no) || {}
      const amount = Number(item.amt) || 0
      if (amount <= 0) continue
      const row = {
        ...makeEmptyRow(),
        ...reservationBase(reservation),
        '날짜': item.date || reservation.date || '',
        '고객명': item.customer || reservation.customer || '',
        '인원': Number(item.pax) || Number(reservation.pax) || '',
        '총 정산금액': amount,
      }
      if (type === '체험') {
        row['체험단가'] = unitFromTotal(amount, row['인원'])
        row['업체명'] = vendorName
        row['체험 프로그램명'] = item.detail || ''
      } else if (type === '숙박') {
        Object.assign(row, matchLodgeForHistory(item, lodges, reservationByNo, lodgeVendors))
        if (!row['숙박공간명'] && item.detail) row['숙박공간명'] = item.detail
      } else if (type === '픽업') {
        Object.assign(row, matchPickupForHistory(item, pickups))
        if (!row['픽업자명'] && item.detail) row['픽업자명'] = item.detail
        if (!row['픽업비']) row['픽업비'] = amount
      } else {
        row['업체명'] = vendorName || item.detail || type
      }
      rows.push(row)
    }
  }
  return rows
}

function paymentSummaryRows(reservations, experienceCandidates, lodgeCandidates, pickupCandidates) {
  const rows = []
  const grouped = new Map()
  for (const reservation of reservations) {
    grouped.set(reservation.no, {
      reservation,
      vendors: new Set(),
      programs: new Set(),
      lodgeVendors: new Set(),
      lodgeSpaces: new Set(),
      rooms: new Set(),
      pickups: new Set(),
      lodgeAmount: 0,
      pickupAmount: 0,
      experienceUnit: Number(reservation.price) || '',
    })
  }

  for (const candidate of experienceCandidates) {
    const row = candidate.row
    const reservationNo = candidate.item.no
    const group = grouped.get(reservationNo)
    if (!group) continue
    if (row['업체명']) group.vendors.add(row['업체명'])
    if (row['체험 프로그램명']) group.programs.add(row['체험 프로그램명'])
    if (row['체험단가']) group.experienceUnit = row['체험단가']
  }
  for (const candidate of lodgeCandidates) {
    const row = candidate.row
    const group = grouped.get(candidate.item.no)
    if (!group) continue
    if (row['숙박업체명']) group.lodgeVendors.add(row['숙박업체명'])
    if (row['숙박공간명']) group.lodgeSpaces.add(row['숙박공간명'])
    if (row['객실명']) group.rooms.add(row['객실명'])
    group.lodgeAmount += Number(row['숙박단가']) || 0
  }
  for (const candidate of pickupCandidates) {
    const row = candidate.row
    const group = grouped.get(candidate.item.no)
    if (!group) continue
    if (row['픽업자명']) group.pickups.add(row['픽업자명'])
    group.pickupAmount += Number(row['픽업비']) || 0
  }

  for (const group of grouped.values()) {
    const reservation = group.reservation
    rows.push({
      ...makeEmptyRow(),
      ...reservationBase(reservation),
      '체험단가': group.experienceUnit || '',
      '총 결제금액': Number(reservation.total) || Number(reservation.experience_sales_amount) || '',
      '업체명': [...group.vendors].join(' / '),
      '체험 프로그램명': [...group.programs].join(' / '),
      '숙박업체명': [...group.lodgeVendors].join(' / '),
      '숙박공간명': [...group.lodgeSpaces].join(' / '),
      '객실명': [...group.rooms].join(' / '),
      '숙박단가': group.lodgeAmount || '',
      '픽업자명': [...group.pickups].join(' / '),
      '픽업비': group.pickupAmount || Number(reservation.pickup_fee) || '',
    })
  }
  return rows
}

export async function GET() {
  const user = await requireApiAdmin()
  if (!user) return forbiddenResponse()

  const supabase = createServerSupabase()

  const errors = []
  const [
    reservationRes,
    vendorRes,
    lodgeVendorRes,
    packageRes,
    lodgeRes,
    pickupRes,
    snapshotRes,
    settleRes,
  ] = await Promise.all([
    supabase.from('reservations').select(RESERVATION_FIELDS.join(',')).order('date', { ascending: false }).order('no', { ascending: false }),
    supabase.from('vendors').select('key,name,color,vendor_programs(prog_name,vendor_settle_price,unit_price,settle_type,is_deleted)').or('is_deleted.is.null,is_deleted.eq.false').order('key'),
    supabase.from('lodge_vendors').select('id,name,lodges(name,is_deleted)').or('is_deleted.is.null,is_deleted.eq.false').order('name'),
    supabase.from('packages').select(`${PACKAGE_FIELDS.join(',')}, package_programs(${PACKAGE_PROGRAM_FIELDS.join(',')})`).or('is_deleted.is.null,is_deleted.eq.false').order('name'),
    supabase.from('lodge_confirms').select(LODGE_CONFIRM_FIELDS.join(',')).or('is_deleted.is.null,is_deleted.eq.false'),
    supabase.from('reservation_pickup').select(`${PICKUP_FIELDS.join(',')}, drivers(name)`).or('is_deleted.is.null,is_deleted.eq.false'),
    supabase.from('reservation_program_snapshots').select('id,reservation_no,package_name,vendor_key,vendor_name,prog_name,customer_price,vendor_settle_price,customer_total,vendor_settle_total,settle_type,pax,price_basis_date,is_deleted').or('is_deleted.is.null,is_deleted.eq.false'),
    supabase.from('settle_history').select('id,vendor_key,settle_type,total_amt,settled_at,settled_by,is_deleted,settle_history_items(id,settle_history_id,reservation_no,customer,detail,amt,is_deleted),vendors(name)').order('settled_at', { ascending: false }),
  ])

  ;[
    ['reservations', reservationRes.error],
    ['vendors', vendorRes.error],
    ['lodge_vendors', lodgeVendorRes.error],
    ['packages', packageRes.error],
    ['lodge_confirms', lodgeRes.error],
    ['reservation_pickup', pickupRes.error],
    ['reservation_program_snapshots', snapshotRes.error],
    ['settle_history', settleRes.error],
  ].forEach(([table, error]) => {
    if (error) errors.push({ source: 'data-load', message: 'Some data could not be loaded.' })
  })

  const reservations = activeRows(reservationRes.data).filter(isActiveReservation)
  const reservationByNo = new Map(reservations.map(row => [row.no, row]))
  const vendors = activeRows(vendorRes.data)
  const lodgeVendors = activeRows(lodgeVendorRes.data)
  const packages = activeRows(packageRes.data)
  const lodges = activeRows(lodgeRes.data).filter(row => reservationByNo.has(row.reservation_no))
  const pickups = activeRows(pickupRes.data).filter(row => reservationByNo.has(row.reservation_no))
  const snapshots = activeRows(snapshotRes.data).filter(row => reservationByNo.has(row.reservation_no))
  const histories = activeRows(settleRes.data).map(row => ({
    ...row,
    settle_history_items: activeRows(row.settle_history_items),
  }))
  const settled = buildSettledSet(histories, vendors)

  const snapshotNos = new Set(snapshots.map(row => row.reservation_no))
  const settleExperienceCandidates = [
    ...experienceRowsFromSnapshots(snapshots, reservationByNo, '총 미정산금액', 'settle'),
    ...fallbackExperienceRows(reservations, packages, vendors, snapshotNos, '총 미정산금액', 'settle'),
  ]
  const lodgeCandidates = lodgeRows(lodges, reservationByNo, lodgeVendors, '총 미정산금액')
  const pickupCandidates = pickupRows(pickups, reservationByNo, '총 미정산금액')
  const allUnsettledCandidates = [...settleExperienceCandidates, ...lodgeCandidates, ...pickupCandidates]

  const paymentExperienceCandidates = [
    ...experienceRowsFromSnapshots(snapshots, reservationByNo, '총 결제금액', 'payment'),
    ...fallbackExperienceRows(reservations, packages, vendors, snapshotNos, '총 결제금액', 'payment'),
  ]
  const paymentRows = paymentSummaryRows(reservations, paymentExperienceCandidates, lodgeCandidates, pickupCandidates)
  const unsettledRows = applySettledFilter(allUnsettledCandidates, settled, false)
  const settledRows = completedRows(histories, reservationByNo, vendors, lodges, lodgeVendors, pickups)

  const sheets = [
    {
      name: '백업 정보',
      columns: ['생성일시', '생성자', '설명'],
      rows: [{
        '생성일시': new Date().toISOString(),
        '생성자': user.email || user.id,
        '설명': '예약 정산 확인용 수동 백업 파일입니다. 서버에는 저장되지 않습니다.',
      }],
    },
    { name: '미정산 내역', columns: columnsForAmount('총 미정산금액'), rows: unsettledRows },
    { name: '정산완료 내역', columns: columnsForAmount('총 정산금액'), rows: settledRows },
    { name: '전체 결제내역', columns: columnsForAmount('총 결제금액'), rows: paymentRows },
  ]

  if (errors.length) {
    sheets.push({ name: '백업오류', columns: ['source', 'message'], rows: errors })
  }

  const workbook = workbookXlsx(sheets)
  const filename = `roadnvill_backup_${kstTimestamp()}.xlsx`

  return new Response(workbook, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
