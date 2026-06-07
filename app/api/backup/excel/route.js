import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

function columnsFor(rows) {
  const columns = []
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

function xlsxCell(value, ref, styleId = '') {
  const style = styleId ? ` s="${styleId}"` : ''
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(safeExcelText(value))}</t></is></c>`
}

function xlsxSheetXml(rows) {
  const columns = columnsFor(rows)
  const dataRows = rows.length ? rows : [{ '데이터 없음': '' }]
  const effectiveColumns = rows.length ? columns : ['데이터 없음']
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
      data: xlsxSheetXml(sheet.rows),
    })),
  ]
  return zipStore(files)
}

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const errors = []

  const [{ data: reservations, error: reservationError }, { data: settleHistory, error: settleError }] = await Promise.all([
    supabase.from('reservations').select('*').order('date', { ascending: false }).order('no', { ascending: false }),
    supabase
      .from('settle_history')
      .select('*, settle_history_items(*), vendors(name)')
      .order('settled_at', { ascending: false }),
  ])

  if (reservationError) errors.push({ table: 'reservations', message: reservationError.message })
  if (settleError) errors.push({ table: 'settle_history', message: settleError.message })

  const settleRows = (settleHistory || [])
    .filter(row => row?.is_deleted !== true)
    .flatMap(history => {
      const items = (history.settle_history_items || []).filter(item => item?.is_deleted !== true)
      if (!items.length) {
        return [{
          settle_history_id: history.id,
          settle_type: history.settle_type,
          vendor_name: history.vendors?.name || history.vendor_key || history.settle_type || '',
          settled_at: history.settled_at,
          period_start: history.period_start,
          period_end: history.period_end,
          total_amt: history.total_amt,
          settled_by: history.settled_by,
        }]
      }
      return items.map(item => ({
        settle_history_id: history.id,
        settle_type: history.settle_type,
        vendor_name: history.vendors?.name || history.vendor_key || history.settle_type || '',
        settled_at: history.settled_at,
        period_start: history.period_start,
        period_end: history.period_end,
        total_amt: history.total_amt,
        settled_by: history.settled_by,
        reservation_no: item.reservation_no,
        customer: item.customer,
        date: item.date,
        pax: item.pax,
        detail: item.detail,
        amt: item.amt,
      }))
    })

  const sheets = [
    { name: '예약 목록', rows: reservations || [] },
    { name: '업체별 정산내역', rows: settleRows },
  ]

  if (errors.length) {
    sheets.push({ name: '백업오류', rows: errors })
  }

  const workbook = workbookXlsx([
    {
      name: '백업 정보',
      rows: [{
        created_at: new Date().toISOString(),
        created_by: user.email || user.id,
        format: 'Excel XML',
        note: '예약 목록과 업체별 정산내역만 포함한 수동 백업 파일입니다. 서버에는 저장되지 않습니다.',
      }],
    },
    ...sheets,
  ])

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
