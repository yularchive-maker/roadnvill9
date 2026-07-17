export const VENDOR_COLOR_PALETTE = [
  '#4ECDC4',
  '#FFB020',
  '#7C8CFF',
  '#FF6B8A',
  '#8BD35F',
  '#B47CFF',
  '#3FA7F5',
  '#F47C48',
  '#2DD4BF',
  '#F2D64B',
  '#A3E635',
  '#FB7185',
]

function normalizeColor(color) {
  const text = String(color || '').trim()
  if (!text) return ''
  return text.startsWith('#') ? text.toUpperCase() : `#${text}`.toUpperCase()
}

export function pickAutoVendorColor(vendors = [], excludeKey = '') {
  const used = new Map()
  for (const vendor of vendors || []) {
    if (excludeKey && vendor?.key === excludeKey) continue
    const color = normalizeColor(vendor?.color)
    if (!color) continue
    used.set(color, (used.get(color) || 0) + 1)
  }

  const unused = VENDOR_COLOR_PALETTE.find(color => !used.has(normalizeColor(color)))
  if (unused) return unused

  return VENDOR_COLOR_PALETTE.reduce((best, color) => {
    const bestCount = used.get(normalizeColor(best)) || 0
    const colorCount = used.get(normalizeColor(color)) || 0
    return colorCount < bestCount ? color : best
  }, VENDOR_COLOR_PALETTE[0])
}

export function resolveVendorColor(inputColor, vendors = [], excludeKey = '') {
  const color = normalizeColor(inputColor)
  return color || pickAutoVendorColor(vendors, excludeKey)
}
