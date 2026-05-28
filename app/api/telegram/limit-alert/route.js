import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export const dynamic = 'force-dynamic'

function fmt(n) {
  return (Number(n) || 0).toLocaleString('ko-KR')
}

function buildMessage({ date, totalPeople, reservationCount, warnings }) {
  const rows = (warnings || []).slice(0, 20)
  const lines = [
    '📌 패키지 인원 알림',
    '',
    '📍 기준 정보',
    `- 일자: ${date || '-'}`,
    `- 예약: ${fmt(reservationCount)}건`,
    `- 총 요약 인원: ${fmt(totalPeople)}명`,
    '',
    '👥 알림 상품',
    ...rows.map((item, index) => {
      const label = item.level === 'over' ? '초과' : '주의'
      const icon = item.level === 'over' ? '🚨' : '⚠️'
      const threshold = item.level === 'over' ? item.limit : item.cautionAt
      return `${index + 1}. ${icon} ${label} / ${item.name || '-'} / 현재 ${fmt(item.people)}명 / 기준 ${fmt(item.limit)}명 / 알림 ${fmt(threshold)}명`
    }),
    '',
    '✅ 확인 요청',
    '- 웹앱 대시보드에서 해당 날짜 예약 구성을 확인해 주세요.',
    '- 필요하면 신규 예약 접수 전 상품별 가능 인원을 먼저 조율해 주세요.',
  ]
  return lines.join('\n')
}

async function sendTelegramMessage(token, chatId, text) {
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })
  const payload = await res.json()
  if (!res.ok || !payload.ok) {
    throw new Error(payload.description || 'Telegram sendMessage failed.')
  }
  return payload.result
}

async function requireUser() {
  const supabase = createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

export async function POST(req) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_AGENCY_CHAT_ID

  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 500 })
  }
  if (!chatId) {
    return NextResponse.json({ error: 'TELEGRAM_AGENCY_CHAT_ID is not configured.' }, { status: 500 })
  }

  const body = await req.json()
  const warnings = Array.isArray(body.warnings) ? body.warnings : []
  if (!warnings.length) {
    return NextResponse.json({ error: 'warnings is required.' }, { status: 400 })
  }

  const message = buildMessage({
    date: body.date,
    totalPeople: body.totalPeople,
    reservationCount: body.reservationCount,
    warnings,
  })

  const sent = await sendTelegramMessage(token, chatId, message)
  return NextResponse.json({ ok: true, message_id: sent.message_id })
}
