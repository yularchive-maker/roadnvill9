import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export const dynamic = 'force-dynamic'

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN
}

function compactUpdate(update) {
  const message = update.message || update.edited_message
  const chat = message?.chat
  const from = message?.from
  return {
    update_id: update.update_id,
    chat_id: chat?.id ? String(chat.id) : null,
    chat_type: chat?.type || null,
    chat_title: chat?.title || null,
    username: chat?.username || from?.username || null,
    first_name: chat?.first_name || from?.first_name || null,
    last_name: chat?.last_name || from?.last_name || null,
    text: message?.text || null,
    date: message?.date ? new Date(message.date * 1000).toISOString() : null,
  }
}

async function requireUser() {
  const supabase = createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
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

  const updates = (payload.result || [])
    .map(compactUpdate)
    .filter(update => update.chat_id)
    .slice(-20)

  return NextResponse.json({ updates })
}
