import { NextResponse } from 'next/server'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/

export function badRequestResponse(message = 'Invalid request') {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function readJsonObject(req) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'JSON object body is required.' }
    }
    return { body }
  } catch {
    return { error: 'Invalid JSON body.' }
  }
}

export function isSafeId(value) {
  return SAFE_ID_RE.test(String(value || ''))
}

export function validateRequiredSafeId(value, label = 'id') {
  if (!isSafeId(value)) return `${label} is invalid.`
  return null
}

export function validateOptionalMonth(value, label = 'month') {
  if (!value) return null
  if (!MONTH_RE.test(String(value))) return `${label} must be YYYY-MM.`
  return null
}

export function validateOptionalDate(value, label = 'date') {
  if (!value) return null
  if (!DATE_RE.test(String(value))) return `${label} must be YYYY-MM-DD.`
  return null
}

export function validateEnum(value, allowed, label) {
  if (!value) return null
  if (!allowed.includes(value)) return `${label} is invalid.`
  return null
}

function validateField(value, rule, field) {
  if (value === undefined) return null
  if (value === null) return rule.nullable ? null : `${field} cannot be null.`

  if (rule.type === 'string') {
    if (typeof value !== 'string' && typeof value !== 'number') return `${field} must be a string.`
    const text = String(value)
    if (rule.max && text.length > rule.max) return `${field} is too long.`
    if (rule.pattern === 'date' && !DATE_RE.test(text)) return `${field} must be YYYY-MM-DD.`
    if (rule.pattern === 'month' && !MONTH_RE.test(text)) return `${field} must be YYYY-MM.`
    if (rule.pattern === 'time' && text && !TIME_RE.test(text)) return `${field} must be HH:MM.`
    if (rule.pattern === 'safeId' && !SAFE_ID_RE.test(text)) return `${field} is invalid.`
    if (rule.enum && !rule.enum.includes(text)) return `${field} is invalid.`
    return null
  }

  if (rule.type === 'number') {
    const num = Number(value)
    if (!Number.isFinite(num)) return `${field} must be a number.`
    if (rule.min !== undefined && num < rule.min) return `${field} is too small.`
    if (rule.max !== undefined && num > rule.max) return `${field} is too large.`
    return null
  }

  if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') return `${field} must be a boolean.`
    return null
  }

  if (rule.type === 'array') {
    if (!Array.isArray(value)) return `${field} must be an array.`
    if (rule.max && value.length > rule.max) return `${field} has too many items.`
    return null
  }

  if (rule.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return `${field} must be an object.`
    return null
  }

  return null
}

function coerceField(value, rule) {
  if (value === null) return null
  if (rule.type === 'string') return String(value).trim()
  if (rule.type === 'number') return Number(value)
  return value
}

export function validatePayload(body, schema) {
  const out = {}
  for (const [field, rule] of Object.entries(schema)) {
    const error = validateField(body[field], rule, field)
    if (error) return { error }
    if (body[field] !== undefined) out[field] = coerceField(body[field], rule)
  }
  return { data: out }
}

export function stringRule(max = 255, extra = {}) {
  return { type: 'string', max, nullable: true, ...extra }
}

export function numberRule(extra = {}) {
  return { type: 'number', nullable: true, ...extra }
}

export function booleanRule(extra = {}) {
  return { type: 'boolean', nullable: true, ...extra }
}

export function arrayRule(max = 100, extra = {}) {
  return { type: 'array', max, nullable: true, ...extra }
}

export function objectRule(extra = {}) {
  return { type: 'object', nullable: true, ...extra }
}
