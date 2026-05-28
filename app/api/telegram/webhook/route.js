import { createAdminSupabase } from '@/lib/supabase-admin'
import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export const dynamic = 'force-dynamic'

const REPLY_MAP = {
  possible: { reply_status: '가능', final_decision: '확정 가능', label: '가능' },
  impossible: { reply_status: '불가능', final_decision: '확정 불가', label: '불가능' },
  time_adjust: { reply_status: '시간조정 필요', final_decision: '조정 필요', label: '시간조정 필요' },
  people_adjust: { reply_status: '인원조정 필요', final_decision: '조정 필요', label: '인원조정 필요' },
}

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN
}

function getSupabase() {
  const supabase = createAdminSupabase()
  if (!supabase) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
  }
  return supabase
}

async function requireUser() {
  const supabase = createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

function parseCallbackData(value) {
  const parts = String(value || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'vc') return null

  const [, confirmId, code] = parts
  const reply = REPLY_MAP[code]
  if (!confirmId || !reply) return null

  return { confirmId, code, reply }
}

async function telegram(method, body) {
  const token = getToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.')

  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json()
  if (!res.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram ${method} failed.`)
  }
  return payload.result
}

async function answerCallback(callbackQueryId, text) {
  if (!callbackQueryId) return
  try {
    await telegram('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    })
  } catch {
    // Telegram callback answers expire quickly; DB persistence is the source of truth.
  }
}

async function markMessage(callbackQuery, reply) {
  const message = callbackQuery?.message
  const chatId = message?.chat?.id
  const messageId = message?.message_id
  if (!chatId || !messageId) return

  try {
    await telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    })
    await telegram('sendMessage', {
      chat_id: chatId,
      text: `회신이 저장되었습니다: ${reply.label}`,
      reply_to_message_id: messageId,
    })
  } catch {
    // Failing to decorate the Telegram chat should not roll back the saved reply.
  }
}

async function processCallback(callbackQuery) {
  const parsed = parseCallbackData(callbackQuery?.data)
  if (!parsed) {
    await answerCallback(callbackQuery?.id, '처리할 수 없는 회신입니다.')
    return { ok: false, skipped: true, reason: 'Unsupported callback_data' }
  }

  const message = callbackQuery.message
  const payload = {
    reply_status: parsed.reply.reply_status,
    replied_at: new Date().toISOString(),
    manual_reply: false,
    reply_method: '텔레그램',
    final_decision: parsed.reply.final_decision,
    telegram_chat_id: message?.chat?.id ? String(message.chat.id) : null,
    telegram_message_id: message?.message_id ? String(message.message_id) : null,
    send_error: null,
  }

  let data = null
  let error = null

  try {
    const result = await getSupabase()
      .from('vendor_confirms')
      .update(payload)
      .eq('id', parsed.confirmId)
      .select('id,reservation_no,vendor_key,reply_status,final_decision')
      .maybeSingle()
    data = result.data
    error = result.error
  } catch (configError) {
    await answerCallback(callbackQuery?.id, '서버 설정이 필요합니다.')
    return { ok: false, id: parsed.confirmId, error: configError.message }
  }

  if (error) {
    await answerCallback(callbackQuery?.id, '회신 저장에 실패했습니다.')
    return { ok: false, id: parsed.confirmId, error: error.message }
  }

  if (!data) {
    await answerCallback(callbackQuery?.id, '회신 요청을 찾을 수 없습니다.')
    return { ok: false, id: parsed.confirmId, error: 'Vendor confirmation row was not found.' }
  }

  await answerCallback(callbackQuery?.id, `${parsed.reply.label} 회신이 저장되었습니다.`)
  await markMessage(callbackQuery, parsed.reply)

  return { ok: true, data }
}

async function processUpdate(update) {
  if (!update?.callback_query) {
    return { ok: true, skipped: true, reason: 'No callback_query' }
  }
  return processCallback(update.callback_query)
}

function verifySecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return true
  return req.headers.get('x-telegram-bot-api-secret-token') === expected
}

export async function POST(req) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Invalid Telegram webhook secret.' }, { status: 401 })
  }

  const update = await req.json()
  const result = await processUpdate(update)
  return NextResponse.json(result)
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = getToken()
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 500 })
  }

  const res = await fetch(`${TELEGRAM_API}${token}/getUpdates`, { cache: 'no-store' })
  const payload = await res.json()

  if (!res.ok || !payload.ok) {
    return NextResponse.json({ error: payload.description || 'Telegram getUpdates failed.' }, { status: 502 })
  }

  const results = []
  const updates = payload.result || []
  for (const update of updates) {
    if (update.callback_query) {
      results.push({ update_id: update.update_id, ...(await processUpdate(update)) })
    }
  }

  const lastUpdateId = updates.length ? Math.max(...updates.map(update => update.update_id)) : null
  if (lastUpdateId !== null) {
    try {
      await fetch(`${TELEGRAM_API}${token}/getUpdates?offset=${lastUpdateId + 1}`, { cache: 'no-store' })
    } catch {
      // Local polling cleanup is best-effort only.
    }
  }

  return NextResponse.json({ processed: results })
}
