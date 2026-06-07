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

function rowXml(values, isHeader = false) {
  const style = isHeader ? ' ss:StyleID="header"' : ''
  return `<Row>${values.map(value => `<Cell${style}><Data ss:Type="String">${xmlEscape(safeExcelText(value))}</Data></Cell>`).join('')}</Row>`
}

function worksheetXml(name, rows) {
  const columns = columnsFor(rows)
  const body = rows.length
    ? [rowXml(columns, true), ...rows.map(row => rowXml(columns.map(column => row?.[column])))]
    : [rowXml(['데이터 없음'], true)]

  return `<Worksheet ss:Name="${xmlEscape(sheetName(name))}"><Table>${body.join('')}</Table></Worksheet>`
}

function workbookXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${sheets.map(sheet => worksheetXml(sheet.name, sheet.rows)).join('\n')}
</Workbook>`
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

  const xml = workbookXml([
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

  const bytes = new TextEncoder().encode(xml)
  const filename = `roadnvill_backup_${kstTimestamp()}.xls`

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
