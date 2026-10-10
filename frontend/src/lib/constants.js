export const HAZARD_TYPES = [
  { value: 'pothole', label: 'Pothole' },
  { value: 'crack', label: 'Road crack' },
  { value: 'surface_damage', label: 'Surface damage' },
  { value: 'debris', label: 'Debris on road' },
  { value: 'waterlogging', label: 'Waterlogging' },
  { value: 'missing_signage', label: 'Missing or damaged signage' },
  { value: 'other', label: 'Other hazard' },
]
export const typeLabel = (v) => HAZARD_TYPES.find((t) => t.value === v)?.label ?? v

export const SEVERITIES = [
  { value: 'low', label: 'Low', color: '#8fa8c8', help: 'Minor; unlikely to affect control of a vehicle.' },
  { value: 'medium', label: 'Medium', color: '#f5b544', help: 'Noticeable; drivers and riders should slow down.' },
  { value: 'high', label: 'High', color: '#ff6b5e', help: 'Could damage a vehicle or cause loss of control.' },
]
export const severityMeta = (v) => SEVERITIES.find((s) => s.value === v) ?? SEVERITIES[0]

export const STATUSES = [
  { value: 'reported', label: 'Reported', tone: 'text-mist-200 bg-ink-600/60 border-ink-500' },
  { value: 'verified', label: 'Verified', tone: 'text-teal-300 bg-teal-700/25 border-teal-600/60' },
  { value: 'in_progress', label: 'In progress', tone: 'text-sky-300 bg-sky-900/40 border-sky-700/60' },
  { value: 'resolved', label: 'Resolved', tone: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/50' },
  { value: 'rejected', label: 'Rejected', tone: 'text-mist-400 bg-ink-800 border-ink-600 line-through decoration-mist-500/60' },
]
export const statusMeta = (v) => STATUSES.find((s) => s.value === v) ?? STATUSES[0]
export const ACTIVE_STATUSES = ['reported', 'verified', 'in_progress']

export const RISK_LEVELS = {
  low: { label: 'Low estimated risk', color: '#34d3c0' },
  moderate: { label: 'Moderate estimated risk', color: '#f5b544' },
  elevated: { label: 'Elevated estimated risk', color: '#ff9a5e' },
  high: { label: 'High estimated risk', color: '#ff6b5e' },
}

export const ROUTE_COLORS = ['#34d3c0', '#a78bfa', '#f472b6']
