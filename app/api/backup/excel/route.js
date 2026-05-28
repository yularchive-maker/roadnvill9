import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TABLES = [
  ['reservations', '예약'],
  ['vendor_confirms', '업체회신'],
  ['lodge_confirms', '숙소배정'],
  ['reservation_pickup', '픽업'],
  ['reservation_program_snapshots', '예약가격스냅샷'],
  ['reservation_budget_usages', '예약구성상품'],
  ['reservation_profit_adjustments', '수익조정'],
  ['program_price_history', '가격이력'],
  ['biz_budget_items', '사업비항목'],
  ['timetable_events', '타임테이블'],
  ['settle_history', '정산이력'],
  ['settle_history_items', '정산상세'],
  ['vendors', '체험업체'],
  ['vendor_programs', '업체체험'],
  ['packages', '패키지'],
  ['package_zones', '패키지구역'],
  ['package_programs', '패키지체험'],
  ['lodge_vendors', '숙박업체'],
  ['lodges', '숙소객실'],
  ['zones', '구역'],
  ['platforms', '플랫폼'],
  ['drivers', '픽업수행자'],
  ['biz', '사업비'],
  ['biz_payments', '사업비결제'],
  ['notices', '공지'],
]

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

  const sheets = []
  const errors = []

  for (const [table, name] of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      errors.push({ table, message: error.message })
      continue
    }
    sheets.push({ name, rows: data || [] })
  }

  if (errors.length) sheets.push({ name: '백업오류', rows: errors })

  const xml = workbookXml([
    {
      name: '백업정보',
      rows: [{
        created_at: new Date().toISOString(),
        created_by: user.email || user.id,
        format: 'Excel XML',
        note: '서버에서 즉시 생성된 수동 백업 파일입니다. 서버에는 저장되지 않습니다.',
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
