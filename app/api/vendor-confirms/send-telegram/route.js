import { supabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export const dynamic = 'force-dynamic'

const REPLY_BUTTONS = [
  [{ text: '가능', code: 'possible' }, { text: '불가능', code: 'impossible' }],
  [{ text: '시간조정 필요', code: 'time_adjust' }, { text: '인원조정 필요', code: 'people_adjust' }],
]

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function scheduleLines(schedule) {
  const items = Array.isArray(schedule) ? schedule : []
  if (!items.length) return '- 당일 등록된 일정 없음'

  return items.slice(0, 8).map((item, index) => {
    const time = item.time || item.request_time || item.start_time || item.range || '-'
    const program = item.program_name || item.prog_name || item.title || '-'
    const status = item.status || item.reply_status || item.reservation_status || '-'
    const people = item.people || item.pax || item.request_people_count
    const peopleText = people ? ` ${people}명` : ''
    const warning = item.overlap || item.overlap_warning ? ' / 시간중복 주의' : ''
    return `${index + 1}. ${time} / ${program} / ${status}${peopleText}${warning}`
  }).join('\n')
}

function buildMessage(row, reservation, vendor) {
  const vendorName = row.vendor_name || vendor?.name || row.vendor_key || '-'
  const people = row.request_people_count || reservation?.pax || '-'
  const confirmed = row.day_confirmed_people_count ?? 0
  const pending = row.day_pending_people_count ?? 0
  const maxExpected = row.day_max_expected_people_count ?? Number(confirmed) + Number(pending)
  const requestTime = [row.request_start_time, row.request_end_time].filter(Boolean).join(' ~ ') || '-'

  return [
    '📌 예약 가능 여부 확인 요청',
    '',
    '📍 요청 정보',
    `- 예약번호: ${row.reservation_no || '-'}`,
    `- 업체: ${vendorName}`,
    `- 프로그램: ${row.program_name || row.prog_name || '-'}`,
    '',
    '🗓 일정/장소',
    `- 예약일: ${formatDate(row.request_date || reservation?.date)}`,
    `- 요청 시간: ${requestTime}`,
    `- 장소/구역: ${row.place_name || row.zone_name || '-'}`,
    '',
    '👥 인원 현황',
    `- 이번 예약 인원: ${people}명`,
    `- 현재 확정 인원: ${confirmed}명`,
    `- 상담/대기 인원: ${pending}명`,
    `- 최대 예상 인원: ${maxExpected}명`,
    '',
    `📋 ${vendorName} 당일 일정`,
    scheduleLines(row.same_day_schedule),
    '',
    '✅ 확인 기준',
    `- 이번 예약 ${people}명 진행 가능 여부를 확인해 주세요.`,
    `- 최대 예상 인원은 ${maxExpected}명까지 늘어날 수 있습니다.`,
    '- 같은 시간대에 다른 요청이 있거나 인원 조정이 필요하면 조정 필요로 회신해 주세요.',
    '',
    `⏰ 회신 마감: ${formatDateTime(row.reply_deadline_at)}`,
  ].join('\n')
}

function keyboardFor(confirmId) {
  return {
    inline_keyboard: REPLY_BUTTONS.map(row =>
      row.map(button => ({
        text: button.text,
        callback_data: `vc:${confirmId}:${button.code}`,
      }))
    ),
  }
}

async function sendTelegramMessage(token, chatId, text, replyMarkup) {
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    }),
  })
  const payload = await res.json()
  if (!res.ok || !payload.ok) {
    throw new Error(payload.description || 'Telegram sendMessage failed.')
  }
  return payload.result
}

export async function POST(req) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 500 })
  }

  const body = await req.json()
  const ids = Array.isArray(body.ids) ? body.ids : [body.id].filter(Boolean)
  if (!ids.length) {
    return NextResponse.json({ error: 'ids is required.' }, { status: 400 })
  }

  const { data: rows, error: rowError } = await supabase
    .from('vendor_confirms')
    .select('*')
    .in('id', ids)
    .or('is_deleted.is.null,is_deleted.eq.false')

  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ error: 'No vendor confirmation rows found.' }, { status: 404 })

  const vendorKeys = [...new Set(rows.map(row => row.vendor_key).filter(Boolean))]
  const reservationNos = [...new Set(rows.map(row => row.reservation_no).filter(Boolean))]

  const [vendorRes, reservationRes] = await Promise.all([
    vendorKeys.length
      ? supabase.from('vendors').select('key,name,telegram_chat_id').in('key', vendorKeys)
      : Promise.resolve({ data: [], error: null }),
    reservationNos.length
      ? supabase.from('reservations').select('no,date,pax,reservation_status').in('no', reservationNos)
      : Promise.resolve({ data: [], error: null }),
  ])

  const lookupError = vendorRes.error || reservationRes.error
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const vendors = new Map((vendorRes.data || []).map(vendor => [vendor.key, vendor]))
  const reservations = new Map((reservationRes.data || []).map(reservation => [reservation.no, reservation]))

  const results = []

  for (const row of rows) {
    const vendor = vendors.get(row.vendor_key)
    const reservation = reservations.get(row.reservation_no)
    const chatId = row.telegram_chat_id || vendor?.telegram_chat_id

    if (!chatId) {
      const message = '업체 Telegram chat_id가 등록되어 있지 않습니다.'
      await supabase
        .from('vendor_confirms')
        .update({ send_status: '발송실패', send_error: message })
        .eq('id', row.id)
      results.push({ id: row.id, ok: false, error: message })
      continue
    }

    try {
      const sent = await sendTelegramMessage(token, chatId, buildMessage(row, reservation, vendor), keyboardFor(row.id))
      await supabase
        .from('vendor_confirms')
        .update({
          send_status: '발송완료',
          sent_at: new Date().toISOString(),
          send_error: null,
          telegram_chat_id: String(chatId),
          telegram_message_id: sent.message_id ? String(sent.message_id) : null,
        })
        .eq('id', row.id)
      results.push({ id: row.id, ok: true, message_id: sent.message_id })
    } catch (error) {
      await supabase
        .from('vendor_confirms')
        .update({ send_status: '발송실패', send_error: error.message })
        .eq('id', row.id)
      results.push({ id: row.id, ok: false, error: error.message })
    }
  }

  return NextResponse.json({ results })
}
