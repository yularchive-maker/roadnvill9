import { NextResponse } from 'next/server'
import { forbiddenResponse, requireApiAdmin } from '@/lib/api-auth'
import { telegramWebhookSettingsSchema } from '@/lib/api-schemas'
import { badRequestResponse, readJsonObject, validatePayload } from '@/lib/api-validate'

const TELEGRAM_API = 'https://api.telegram.org/bot'

export const dynamic = 'force-dynamic'

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN
}

function getWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET
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
      payload: { error: `Telegram ${method} failed.` },
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
  if (!await requireApiAdmin()) return forbiddenResponse()

  const result = await telegram('getWebhookInfo')
  if (!result.ok) return NextResponse.json(result.payload, { status: result.status })
  return NextResponse.json({ webhook: result.payload })
}

export async function POST(req) {
  if (!await requireApiAdmin()) return forbiddenResponse()

  const parsed = await readJsonObject(req)
  if (parsed.error) return badRequestResponse(parsed.error)
  const validated = validatePayload(parsed.body, telegramWebhookSettingsSchema)
  if (validated.error) return badRequestResponse(validated.error)
  const url = webhookUrlFromRequest(req, validated.data.url)
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
  if (!await requireApiAdmin()) return forbiddenResponse()

  const result = await telegram('deleteWebhook', { drop_pending_updates: false })
  if (!result.ok) return NextResponse.json(result.payload, { status: result.status })
  return NextResponse.json({ ok: true })
}
