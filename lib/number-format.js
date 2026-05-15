export function digitsOnly(value) {
  return String(value ?? '').replace(/[^\d]/g, '')
}

export function numberInputValue(value) {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return Number(digits).toLocaleString()
}

export function numberInputChange(value) {
  const digits = digitsOnly(value)
  return digits ? Number(digits) : 0
}
