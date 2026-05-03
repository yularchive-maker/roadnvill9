export const AUTH_COOKIE = 'roadnvill_admin_session'

function hex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sessionToken(password, secret) {
  const input = `${secret || ''}:${password || ''}`
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return hex(new Uint8Array(hash))
}

export async function expectedSessionToken() {
  const password = process.env.ADMIN_PASSWORD
  const secret = process.env.AUTH_SECRET || password
  if (!password) return null
  return sessionToken(password, secret)
}
