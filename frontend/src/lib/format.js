const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return rtf.format(Math.round(diff / (86400 * 30)), 'month')
}

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`)

export function fmtDuration(s) {
  const mins = Math.round(s / 60)
  if (mins < 60) return `${Math.max(mins, 1)} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} min`
}

export const fmtCoord = (n) => Number(n).toFixed(5)
export const pct = (x) => `${Math.round(x * 100)}%`

export function boundsOf(points) {
  if (!points.length) return null
  const lats = points.map((p) => p[0])
  const lngs = points.map((p) => p[1])
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ]
}
