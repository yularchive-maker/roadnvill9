// 하드코딩 계정 (HTML v8 동일)
export const ACCOUNTS = {
  'admin@experience.com': { password: 'Admin1234!', name: '관리자', role: '운영팀장', avatar: '관' },
  'staff@experience.com': { password: 'Staff5678@', name: '직원',   role: '운영팀원', avatar: '직' },
}

const SESSION_KEY = '_sess'
const SESSION_MS  = 8 * 60 * 60 * 1000  // 8시간

export function login(email, password) {
  const acc = ACCOUNTS[email.trim().toLowerCase()]
  if (!acc || acc.password !== password) return null
  const session = { email, name: acc.name, role: acc.role, avatar: acc.avatar, loginAt: Date.now() }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (Date.now() - s.loginAt >= SESSION_MS) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch { return null }
}
