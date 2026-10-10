import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Marker, Polyline } from 'react-leaflet'
import { ArrowLeftRight, Crosshair, Flag, Gauge, Info, Route as RouteIcon, Sparkles, Timer, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync, useDocumentTitle } from '../hooks/useAsync'
import { useSource } from '../context'
import { RISK_LEVELS, ROUTE_COLORS, typeLabel } from '../lib/constants'
import { boundsOf, fmtDistance, fmtDuration } from '../lib/format'
import { Button, Card, ErrorState, Field, Notice, PageHeader, SeverityBadge, StatusBadge } from '../components/ui'
import HazardMap, { pointIcon } from '../components/HazardMap'

const blank = { lat: '', lng: '' }
const toPoint = (p) => {
  const lat = Number(p.lat)
  const lng = Number(p.lng)
  if (p.lat === '' || p.lng === '' || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function RiskMeter({ score, level }) {
  const meta = RISK_LEVELS[level]
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-white">{score.toFixed(0)}<span className="text-sm font-normal text-mist-400"> / 100</span></span>
        <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-600" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Estimated risk index">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(score, 2)}%`, background: meta.color }} />
      </div>
    </div>
  )
}

export default function RouteSafety() {
  useDocumentTitle('Route safety')
  const { source } = useSource()
  const [origin, setOrigin] = useState(blank)
  const [dest, setDest] = useState(blank)
  const [picking, setPicking] = useState('origin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [sel, setSel] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [formError, setFormError] = useState('')
  const reqId = useRef(0)

  const { data: hazardData } = useAsync((signal) => api.listHazards({ source, active_only: true, page_size: 500 }, signal), [source])
  const allHazards = hazardData?.items ?? []

  const o = toPoint(origin)
  const d = toPoint(dest)
  const route = result?.routes[sel]

  const onMapPick = ({ lat, lng }) => {
    const p = { lat: lat.toFixed(6), lng: lng.toFixed(6) }
    if (picking === 'destination') setDest(p)
    else setOrigin(p)
    setPicking(picking === 'origin' ? 'destination' : null)
  }

  function fillDemoPoints() {
    const pts = allHazards.filter((h) => h.is_demo)
    const b = boundsOf(pts.map((h) => [h.latitude, h.longitude]))
    if (!b) return
    const [[s, w], [n, e]] = b
    setOrigin({ lat: (s + (n - s) * 0.08).toFixed(6), lng: (w + (e - w) * 0.08).toFixed(6) })
    setDest({ lat: (n - (n - s) * 0.08).toFixed(6), lng: (e - (e - w) * 0.08).toFixed(6) })
    setPicking(null)
  }

  async function compare(ev) {
    ev?.preventDefault()
    setFormError('')
    if (!o || !d) return setFormError('Set both points: click the map or enter valid coordinates.')
    const id = ++reqId.current
    setBusy(true)
    setError(null)
    try {
      const res = await api.compareRoutes(o, d)
      if (id !== reqId.current) return
      setResult(res)
      setSel(res.routes.findIndex((r) => r.is_lowest_risk) >= 0 ? res.routes.findIndex((r) => r.is_lowest_risk) : 0)
    } catch (e) {
      if (id !== reqId.current) return
      setResult(null)
      setError(e)
    } finally {
      if (id === reqId.current) setBusy(false)
    }
  }

  const swap = () => {
    setOrigin(dest)
    setDest(origin)
  }

  const onRoute = useMemo(() => {
    if (!route) return []
    const ids = new Set(route.hazards.map((h) => h.id))
    return allHazards.filter((h) => ids.has(h.id))
  }, [route, allHazards])

  const bounds = useMemo(() => {
    if (result) return boundsOf(result.routes.flatMap((r) => r.geometry))
    if (o && d) return boundsOf([[o.lat, o.lng], [d.lat, d.lng]])
    return null
  }, [result, o, d])

  const hasDemo = allHazards.some((h) => h.is_demo)

  return (
    <>
      <PageHeader title="Route safety" description="Compare alternative routes by how many reported hazards they pass and how serious, recent and well-confirmed those reports are." />

      <Notice kind="warn" title="Estimates from reported data only" className="mb-6">
        Scores use hazards reported by this app's users. They are not verified accident statistics, do not include live traffic or live road conditions, and cannot guarantee that any route is safe.
      </Notice>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <form onSubmit={compare} noValidate className="space-y-4">
          <Card title="Trip" description="Click the map to place each point, or type coordinates.">
            <div className="space-y-4">
              {[['origin', 'Origin', origin, setOrigin, 'A'], ['destination', 'Destination', dest, setDest, 'B']].map(([key, label, val, setVal, pin]) => (
                <fieldset key={key} className={`rounded-lg border p-3 ${picking === key ? 'border-teal-400/70 bg-teal-400/5' : 'border-ink-600'}`}>
                  <legend className="flex items-center gap-2 px-1 text-sm font-medium text-white">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-400 text-[11px] font-bold text-ink-950" aria-hidden>{pin}</span>{label}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Latitude" htmlFor={`${key}-lat`}><input id={`${key}-lat`} inputMode="decimal" className="input" value={val.lat} onChange={(e) => setVal({ ...val, lat: e.target.value })} aria-invalid={val.lat !== '' && !toPoint({ ...val, lng: val.lng || '0' })} /></Field>
                    <Field label="Longitude" htmlFor={`${key}-lng`}><input id={`${key}-lng`} inputMode="decimal" className="input" value={val.lng} onChange={(e) => setVal({ ...val, lng: e.target.value })} aria-invalid={val.lng !== '' && !toPoint({ ...val, lat: val.lat || '0' })} /></Field>
                  </div>
                  <Button size="sm" variant={picking === key ? 'primary' : 'secondary'} icon={Crosshair} className="mt-3" onClick={() => setPicking(picking === key ? null : key)} aria-pressed={picking === key}>
                    {picking === key ? `Click the map to set ${label.toLowerCase()}` : `Pick ${label.toLowerCase()} on map`}
                  </Button>
                </fieldset>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" icon={ArrowLeftRight} onClick={swap}>Swap points</Button>
                {hasDemo && <Button size="sm" variant="ghost" icon={Sparkles} onClick={fillDemoPoints}>Use points across the demo area</Button>}
              </div>
              {formError && <p className="field-error" role="alert">{formError}</p>}
              <Button type="submit" variant="primary" icon={RouteIcon} loading={busy} className="w-full">Compare routes</Button>
            </div>
          </Card>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-mist-200">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-teal-400" />
            Show all reported hazards on the map
          </label>
        </form>

        <div className="min-w-0 space-y-6">
          <HazardMap
            className="h-[min(60vh,560px)] min-h-[360px]"
            hazards={showAll ? allHazards : onRoute}
            bounds={bounds}
            onPick={picking ? onMapPick : undefined}
            label="Map showing candidate routes and hazards near them"
          >
            {result?.routes.map((r, i) => (
              <Polyline
                key={r.id}
                positions={r.geometry}
                pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: i === sel ? 7 : 4, opacity: i === sel ? 0.95 : 0.45, lineCap: 'round' }}
                eventHandlers={{ click: () => setSel(i) }}
              />
            ))}
            {o && <Marker position={[o.lat, o.lng]} icon={pointIcon('A')} />}
            {d && <Marker position={[d.lat, d.lng]} icon={pointIcon('B', '#f5b544')} />}
          </HazardMap>

          {busy && !result && <Card><p className="py-6 text-center text-sm text-mist-300" role="status">Asking the routing service for routes and scoring them against reported hazards...</p></Card>}

          {error && (
            <div className="panel">
              <ErrorState
                error={error}
                title={error.code === 'routing_unavailable' ? 'Routing service unavailable' : 'Could not compare routes'}
                onRetry={o && d ? compare : undefined}
              />
              {error.code === 'routing_unavailable' && (
                <p className="border-t border-ink-600/60 px-6 py-4 text-center text-xs leading-relaxed text-mist-400">
                  No route was calculated, and nothing is estimated in its place. Route comparison needs a reachable routing provider (OSRM by default, set with OSRM_BASE_URL). The rest of the app works without it.
                </p>
              )}
            </div>
          )}

          {!result && !error && !busy && (
            <Card><p className="py-4 text-center text-sm text-mist-300">Set an origin and destination, then compare routes. Up to three alternatives are requested from the routing service.</p></Card>
          )}

          {result && (
            <>
              <Notice kind={result.recommendation_mode === 'shortest_only_threshold_exceeded' ? 'warn' : 'info'} title={result.recommendation_mode === 'shortest_only_threshold_exceeded' ? 'Showing the shortest route' : 'Safe-route recommendation'} className="mb-4">
                {result.recommendation_message} The threshold is {result.distance_threshold_percent}% extra distance. Recommendations use reported hazards only and cannot guarantee road safety.
              </Notice>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {result.routes.map((r, i) => (
                  <button key={r.id} onClick={() => setSel(i)} aria-pressed={i === sel} className={`panel p-5 text-left transition-colors ${i === sel ? 'ring-2 ring-teal-400/70' : 'hover:border-ink-500'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span className="h-1.5 w-6 rounded-full" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} aria-hidden />{r.label}
                      </span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {r.is_lowest_risk && <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[11px] font-medium text-teal-300">Lowest estimated risk</span>}
                        {r.is_shortest && <span className="rounded-full bg-ink-600 px-2 py-0.5 text-[11px] text-mist-200">Shortest</span>}
                        {r.is_fastest && <span className="rounded-full bg-ink-600 px-2 py-0.5 text-[11px] text-mist-200">Fastest</span>}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="flex items-center gap-1 text-xs text-mist-400"><RouteIcon className="h-3 w-3" aria-hidden />Distance</dt><dd className="mt-0.5 font-medium text-white">{fmtDistance(r.distance_m)}</dd></div>
                      <div><dt className="flex items-center gap-1 text-xs text-mist-400"><Timer className="h-3 w-3" aria-hidden />Time</dt><dd className="mt-0.5 font-medium text-white">{fmtDuration(r.duration_s)}</dd></div>
                      <div><dt className="flex items-center gap-1 text-xs text-mist-400"><TriangleAlert className="h-3 w-3" aria-hidden />Hazards</dt><dd className="mt-0.5 font-medium text-white">{r.hazard_count}</dd></div>
                    </dl>
                    <div className="mt-4"><RiskMeter score={r.risk_score} level={r.risk_level} /></div>
                  </button>
                ))}
              </div>

              <Card title="Comparison" description={`Provider: ${result.provider}. ${result.considered_hazards} active report${result.considered_hazards === 1 ? '' : 's'} near these routes were considered.`} padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <caption className="sr-only">Comparison of candidate routes</caption>
                    <thead className="text-xs text-mist-400">
                      <tr className="border-b border-ink-600/60">
                        <th scope="col" className="px-5 py-3 font-medium">Route</th>
                        <th scope="col" className="px-3 py-3 font-medium">Distance</th>
                        <th scope="col" className="px-3 py-3 font-medium">Time</th>
                        <th scope="col" className="px-3 py-3 font-medium">Hazards</th>
                        <th scope="col" className="px-3 py-3 font-medium">Per km</th>
                        <th scope="col" className="px-5 py-3 font-medium">Estimated risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-600/40">
                      {result.routes.map((r, i) => (
                        <tr key={r.id} className={i === sel ? 'bg-teal-400/5' : ''}>
                          <th scope="row" className="px-5 py-3 font-medium text-white">{r.label}</th>
                          <td className="px-3 py-3 tabular-nums">{fmtDistance(r.distance_m)}</td>
                          <td className="px-3 py-3 tabular-nums">{fmtDuration(r.duration_s)}</td>
                          <td className="px-3 py-3 tabular-nums">{r.hazard_count}</td>
                          <td className="px-3 py-3 tabular-nums">{r.hazards_per_km}</td>
                          <td className="px-5 py-3 tabular-nums">{r.risk_score.toFixed(0)} <span className="text-xs text-mist-400">({r.risk_level})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!result.routes.some((r) => r.is_lowest_risk) && <p className="border-t border-ink-600/60 px-5 py-3 text-xs text-mist-400">These routes have the same estimated risk, so none is marked as lowest.</p>}
                <p className="border-t border-ink-600/60 px-5 py-3 text-xs leading-relaxed text-mist-400">{result.disclaimer}</p>
              </Card>

              {route && (
                <Card title={`Hazards near ${route.label}`} description="Reports within the buffer distance of this route, ordered by contribution to the score" padded={false}>
                  {route.hazards.length === 0 ? (
                    <p className="flex items-center gap-2 px-5 py-6 text-sm text-mist-300"><Flag className="h-4 w-4" aria-hidden />No reported hazards are near this route. That only means none have been reported.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[34rem] text-left text-sm">
                        <caption className="sr-only">Reported hazards near the selected route</caption>
                        <thead className="text-xs text-mist-400"><tr className="border-b border-ink-600/60"><th scope="col" className="px-5 py-3 font-medium">Hazard</th><th scope="col" className="px-3 py-3 font-medium">Severity</th><th scope="col" className="px-3 py-3 font-medium">Status</th><th scope="col" className="px-3 py-3 font-medium">From route</th><th scope="col" className="px-5 py-3 font-medium">Score added</th></tr></thead>
                        <tbody className="divide-y divide-ink-600/40">
                          {route.hazards.map((h) => (
                            <tr key={h.id}>
                              <td className="px-5 py-3"><Link to={`/reports/${h.id}`} className="font-medium text-teal-300 hover:text-teal-200">#{h.id} {typeLabel(h.hazard_type)}</Link></td>
                              <td className="px-3 py-3"><SeverityBadge severity={h.severity} /></td>
                              <td className="px-3 py-3"><StatusBadge status={h.status} /></td>
                              <td className="px-3 py-3 tabular-nums">{Math.round(h.distance_m)} m</td>
                              <td className="px-5 py-3 tabular-nums">{h.contribution.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              <details className="panel group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-white">
                  <Info className="h-4 w-4 text-teal-300" aria-hidden /> How the risk score works
                </summary>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-mist-300">
                  <p><code className="rounded bg-ink-900 px-1.5 py-0.5 text-xs text-teal-200">{result.methodology.formula}</code></p>
                  <p><code className="rounded bg-ink-900 px-1.5 py-0.5 text-xs text-teal-200">{result.methodology.aggregation}</code></p>
                  <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    <li>Buffer: {result.methodology.parameters.buffer_m} m either side of the route</li>
                    <li>Severity weights: {Object.entries(result.methodology.parameters.severity_weights).map(([k, v]) => `${k} ${v}`).join(', ')}</li>
                    <li>Recency half-life: {result.methodology.parameters.recency_half_life_days} days</li>
                    <li>Confirmations raise a report's weight, flags lower it</li>
                    <li>Counted statuses: {result.methodology.included_statuses.join(', ')}</li>
                    <li>Index saturation scale: {result.methodology.parameters.saturation_scale}</li>
                  </ul>
                  <p className="text-xs text-mist-400">{result.methodology.nature} Unreported hazards are invisible to this score, report density depends on where people report, and severity is self-reported.</p>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </>
  )
}
