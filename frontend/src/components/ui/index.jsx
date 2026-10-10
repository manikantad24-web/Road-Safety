import { forwardRef } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { severityMeta, statusMeta, typeLabel } from '../../lib/constants'

/* ----------------------------------------------------------------- buttons */
const BTN = {
  primary: 'bg-teal-400 text-ink-950 hover:bg-teal-300 disabled:hover:bg-teal-400 font-semibold',
  secondary: 'bg-ink-700 text-mist-100 hover:bg-ink-600 border border-ink-500',
  ghost: 'text-mist-200 hover:bg-ink-700/70 hover:text-white',
  danger: 'bg-sev-high/15 text-sev-high border border-sev-high/40 hover:bg-sev-high/25',
}
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon: Icon, children, className = '', disabled, type = 'button', ...rest },
  ref,
) {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-xs gap-1.5' : 'px-4 py-2 text-sm gap-2'
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${BTN[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------ badges */
export function SeverityBadge({ severity }) {
  const m = severityMeta(severity)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ color: m.color, borderColor: `${m.color}66`, background: `${m.color}1f` }}>
      <SeverityGlyph severity={severity} size={10} />
      {m.label}
    </span>
  )
}

/** Shape encodes severity so it never relies on colour alone: circle < diamond < triangle. */
export function SeverityGlyph({ severity, size = 12 }) {
  const c = severityMeta(severity).color
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      {severity === 'high' ? <path d="M6 1 11.2 10.5H.8z" fill={c} /> : severity === 'medium' ? <path d="M6 .8 11.2 6 6 11.2.8 6z" fill={c} /> : <circle cx="6" cy="6" r="4.6" fill={c} />}
    </svg>
  )
}

export function StatusBadge({ status }) {
  const m = statusMeta(status)
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${m.tone}`}>{m.label}</span>
}

export const DemoBadge = () => (
  <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-xs font-medium text-violet-300" title="Fictional demonstration data">
    Fictional demo
  </span>
)

export const TypeName = ({ type }) => <span>{typeLabel(type)}</span>

/* ------------------------------------------------------------------ layout */
export function PageHeader({ title, description, actions }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-mist-300">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Card({ title, description, actions, children, className = '', padded = true }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-ink-600/60 px-5 py-4">
          <div>
            {title && <h2 className="text-[0.95rem] font-semibold text-white">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-mist-400">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function StatTile({ label, value, hint, accent, icon: Icon, loading }) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent || '#34d3c0' }} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-mist-300">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-mist-400" aria-hidden />}
      </div>
      <p className="mt-2 text-[2rem] font-semibold leading-none tracking-tight text-white">
        {loading ? <span className="inline-block h-8 w-14 animate-pulse rounded bg-ink-600" aria-label="Loading" /> : value}
      </p>
      {hint && <p className="mt-2 text-xs text-mist-400">{hint}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------- states */
export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-mist-300" role="status">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
    {label}
  </div>
)

export function EmptyState({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-ink-700 text-mist-300">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-white">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-mist-300">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Could not load data' }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center" role="alert">
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-sev-high/15 text-sev-high">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 max-w-md text-sm text-mist-300">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <Button className="mt-4" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

const NOTICE = {
  info: { tone: 'border-sky-700/50 bg-sky-900/20 text-sky-100', icon: Info, ic: 'text-sky-300' },
  warn: { tone: 'border-sev-medium/40 bg-sev-medium/10 text-amber-100', icon: AlertTriangle, ic: 'text-sev-medium' },
  error: { tone: 'border-sev-high/40 bg-sev-high/10 text-red-100', icon: AlertTriangle, ic: 'text-sev-high' },
  success: { tone: 'border-teal-600/50 bg-teal-700/20 text-teal-50', icon: CheckCircle2, ic: 'text-teal-300' },
}
export function Notice({ kind = 'info', title, children, className = '' }) {
  const n = NOTICE[kind]
  const Icon = n.icon
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${n.tone} ${className}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${n.ic}`} aria-hidden />
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- forms */
export function Field({ label, htmlFor, error, hint, children, required }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && <span className="ml-0.5 text-sev-high" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="hint" id={`${htmlFor}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${htmlFor}-error`} role="alert">{error}</p>}
    </div>
  )
}

export const Select = forwardRef(function Select({ options, placeholder, className = '', ...rest }, ref) {
  return (
    <select ref={ref} className={`input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239db0cc%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8 ${className}`} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
})

export function Pagination({ page, pages, total, pageSize, onPage }) {
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-ink-600/60 px-5 py-3 text-sm text-mist-300" aria-label="Pagination">
      <span>
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span className="px-2 tabular-nums">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="ghost" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </nav>
  )
}

export function ProgressBar({ value, max, label }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
      <div className="h-full rounded-full bg-teal-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
