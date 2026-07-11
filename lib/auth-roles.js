const DEFAULT_ADMIN_EMAILS = ['roadnvill@roadnvill.com']

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function adminEmailSet() {
  const configured = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
  return new Set([...DEFAULT_ADMIN_EMAILS, ...configured])
}

export function isAdminEmail(email) {
  return Boolean(normalizeEmail(email))
}

export function userDisplayProfile(user) {
  return adminEmailSet().has(normalizeEmail(user?.email))
    ? { name: '대표', role: '대표', avatar: '대', isAdmin: true }
    : { name: '관리자', role: '운영팀장', avatar: '관', isAdmin: isAdminEmail(user?.email) }
}
