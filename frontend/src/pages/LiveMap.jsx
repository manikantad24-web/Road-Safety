import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilterX, MapPinOff } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync, useDocumentTitle } from '../hooks/useAsync'
import { useSource } from '../context'
import { HAZARD_TYPES, SEVERITIES, STATUSES, typeLabel } from '../lib/constants'
import { timeAgo } from '../lib/format'
import { Button, Card, DemoBadge, ErrorState, Field, Notice, PageHeader, SeverityBadge, Select, Spinner, StatusBadge } from '../components/ui'
import HazardMap, { MapLegend } from '../components/HazardMap'

const DEFAULTS = { type: '', severity: '', status: 'active', date_from: '', date_to: '' }
const STATUS_OPTIONS = [{ value: 'active', label: 'Active (open reports)' }, { value: 'all', label: 'All statuses' }, ...STATUSES]

export default function LiveMap() {
  useDocumentTitle('Live hazard map')
  const { source } = useSource()
  const [f, setF] = useState(DEFAULTS)
  const [selected, setSelected] = useState(null)

  const params = useMemo(
    () => ({
      source,
      type: f.type,
      severity: f.severity,
      active_only: f.status === 'active',
      status: f.status !== 'active' && f.status !== 'all' ? f.status : '',
      date_from: f.date_from,
      date_to: f.date_to,
      page_size: 500,
    }),
    [f, source],
  )
  const { data, error, loading, reload } = useAsync((signal) => api.listHazards(params, signal), [JSON.stringify(params)])

  const items = data?.items ?? []
  const dateInvalid = f.date_from && f.date_to && f.date_from > f.date_to
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULTS)
  const flyTo = selected ? (() => { const h = items.find((x) => x.id === selected); return h ? [h.latitude, h.longitude] : null })() : null
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  return (
    <>
      <PageHeader title="Live hazard map" description="Every marker is a report stored in the database. Shape shows severity, outline shows status. The map shows reports, not live road conditions." />

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4 lg:order-1">
          <Card title="Filters" actions={filtered && <Button size="sm" variant="ghost" icon={FilterX} onClick={() => setF(DEFAULTS)}>Reset</Button>}>
            <div className="space-y-4">
              <Field label="Hazard type" htmlFor="f-type"><Select id="f-type" value={f.type} onChange={set('type')} options={HAZARD_TYPES} placeholder="All types" /></Field>
              <Field label="Severity" htmlFor="f-sev"><Select id="f-sev" value={f.severity} onChange={set('severity')} options={SEVERITIES} placeholder="All severities" /></Field>
              <Field label="Status" htmlFor="f-status"><Select id="f-status" value={f.status} onChange={set('status')} options={STATUS_OPTIONS} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Reported from" htmlFor="f-from"><input id="f-from" type="date" className="input" value={f.date_from} max={f.date_to || undefined} onChange={set('date_from')} /></Field>
                <Field label="Reported to" htmlFor="f-to"><input id="f-to" type="date" className="input" value={f.date_to} min={f.date_from || undefined} onChange={set('date_to')} /></Field>
              </div>
              {dateInvalid && <p className="field-error" role="alert">The start date is after the end date.</p>}
            </div>
          </Card>
          <MapLegend />
        </div>

        <div className="min-w-0 space-y-4 lg:order-2">
          {error && !data ? (
            <div className="panel"><ErrorState error={error} onRetry={reload} /></div>
          ) : (
            <>
              <div className="relative">
                <HazardMap hazards={dateInvalid ? [] : items} className="h-[min(62vh,640px)] min-h-[380px]" selectedId={selected} flyTo={flyTo} label="Map of reported road hazards" />
                {loading && <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-ink-800/95 px-3 py-1.5 text-xs text-mist-200 shadow-panel" role="status">Updating markers</div>}
                {!loading && !dateInvalid && items.length === 0 && (
                  <div className="absolute inset-x-4 top-4 z-[500]">
                    <Notice kind="info" title="No reports match these filters">{filtered ? 'Try clearing a filter.' : 'Nothing has been reported yet, or demo data is hidden.'}</Notice>
                  </div>
                )}
              </div>
              {data && data.total > items.length && <Notice kind="warn">Showing the first {items.length} of {data.total} reports. Narrow the filters to see the rest.</Notice>}

              <Card title={`${data ? data.total : '...'} report${data?.total === 1 ? '' : 's'}`} description="Select a row to centre the map on it" padded={false}>
                {loading && !data ? <Spinner /> : items.length === 0 ? (
                  <div className="flex items-center gap-3 px-5 py-6 text-sm text-mist-300"><MapPinOff className="h-4 w-4" aria-hidden />Nothing to list.</div>
                ) : (
                  <ul className="max-h-80 divide-y divide-ink-600/50 overflow-y-auto">
                    {items.map((h) => (
                      <li key={h.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 ${selected === h.id ? 'bg-teal-400/5' : ''}`}>
                        <button onClick={() => setSelected(h.id)} className="min-w-0 flex-1 text-left" aria-pressed={selected === h.id}>
                          <span className="block text-sm font-medium text-white">{typeLabel(h.hazard_type)}</span>
                          <span className="block truncate text-xs text-mist-400">{timeAgo(h.created_at)}{h.description ? ` · ${h.description}` : ''}</span>
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {h.is_demo && <DemoBadge />}
                          <SeverityBadge severity={h.severity} />
                          <StatusBadge status={h.status} />
                          <Link to={`/reports/${h.id}`} className="ml-1 text-xs font-semibold text-teal-300 hover:text-teal-200">Open</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
