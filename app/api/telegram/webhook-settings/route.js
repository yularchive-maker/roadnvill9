import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export const dynamic = 'force-dynamic'

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN
}

function getWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET
}

async function requireUser() {
  const supabase = createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

async function telegram(method, body) {
  const token = getToken()
  if (!token) {
    return {
      ok: false,
      status: 500,
      payload: { error: 'TELEGRAM_BOT_TOKEN is not configured.' },
    }
  }

  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    cache: 'no-store',
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      status: 502,
      payload: { error: payload.description || `Telegram ${method} failed.` },
    }
  }

  return { ok: true, payload: payload.result }
}

function webhookUrlFromRequest(req, bodyUrl) {
  if (bodyUrl) return bodyUrl
  const url = new URL(req.url)
  return `${url.origin}/api/telegram/webhook`
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await telegram('getWebhookInfo')
  if (!result.ok) return NextResponse.json(result.payload, { status: result.status })
  return NextResponse.json({ webhook: result.payload })
}

export async function POST(req) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const url = webhookUrlFromRequest(req, body.url)
  const secret = getWebhookSecret()

  if (!secret) {
    return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET is not configured.' }, { status: 500 })
  }

  const result = await telegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['callback_query', 'message'],
    drop_pending_updates: false,
  })
  if (!result.ok) return NextResponse.json(result.payload, { status: result.status })

  return NextResponse.json({ ok: true, webhook_url: url })
}

export async function DELETE() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await telegram('deleteWebhook', { drop_pending_updates: false })
  if (!result.ok) return NextResponse.json(result.payload, { status: result.status })
  return NextResponse.json({ ok: true })
}
