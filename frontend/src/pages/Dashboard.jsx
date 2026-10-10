import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Area, AreaChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertOctagon, BadgeCheck, CheckCircle2, FilePlus2, Layers, Map as MapIcon, Activity } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync, useDocumentTitle } from '../hooks/useAsync'
import { useSource } from '../context'
import { HAZARD_TYPES, SEVERITIES, severityMeta, statusMeta, typeLabel } from '../lib/constants'
import { fmtDate, timeAgo } from '../lib/format'
import { Card, EmptyState, ErrorState, PageHeader, SeverityBadge, Spinner, StatTile, Button } from '../components/ui'
import HazardMap, { MapLegend } from '../components/HazardMap'
import { useHealth } from '../components/Layout'

const AXIS = { fill: '#9db0cc', fontSize: 12 }
const TOOLTIP = { contentStyle: { background: '#101e34', border: '1px solid #223756', borderRadius: 10, color: '#e8eef7', fontSize: 12 }, cursor: { fill: 'rgba(52,211,192,0.07)' }, labelStyle: { color: '#9db0cc' } }

function describeEvent(e) {
  const t = typeLabel(e.hazard_type).toLowerCase()
  switch (e.kind) {
    case 'created':
      return `New ${t} reported`
    case 'confirmed':
      return `A ${t} report was confirmed`
    case 'flagged':
      return `A ${t} report was flagged as incorrect`
    case 'status_changed':
      return `${typeLabel(e.hazard_type)} marked ${statusMeta(e.to_status).label.toLowerCase()}`
    default:
      return `${typeLabel(e.hazard_type)} updated`
  }
}

export default function Dashboard() {
  useDocumentTitle('Dashboard')
  const { source } = useSource()
  const { health } = useHealth()
  const { data, error, loading, reload } = useAsync(
    async (signal) => {
      const [stats, hazards] = await Promise.all([
        api.stats({ source }, signal),
        api.listHazards({ source, active_only: true, page_size: 500 }, signal),
      ])
      return { stats, hazards }
    },
    [source],
  )

  const stats = data?.stats
  const typeData = stats ? HAZARD_TYPES.map((t) => ({ name: t.label, count: stats.by_type[t.value] ?? 0 })).filter((d) => d.count > 0).sort((a, b) => b.count - a.count) : []
  const sevData = stats ? SEVERITIES.map((s) => ({ name: s.label, key: s.value, value: stats.by_severity[s.value] ?? 0, color: s.color })) : []
  const perDay = stats ? stats.reports_per_day.map((d) => ({ ...d, label: fmtDate(d.date) })) : []

  return (
    <>
      <PageHeader
        title="Road hazard overview"
        description="Hazards reported by people on the road, checked by the community and tracked until they are fixed. Scores and counts reflect reported data only."
        actions={
          <Link to="/report">
            <Button variant="primary" icon={FilePlus2}>Report a hazard</Button>
          </Link>
        }
      />

      {error && !data ? (
        <div className="panel"><ErrorState error={error} onRetry={reload} /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile label="Active reports" value={stats?.active} loading={loading && !stats} icon={Layers} hint="Reported, verified or being repaired" />
            <StatTile label="High severity" value={stats?.high_severity_active} loading={loading && !stats} icon={AlertOctagon} accent="#ff6b5e" hint="Active reports marked high" />
            <StatTile label="Verified hazards" value={stats?.verified} loading={loading && !stats} icon={BadgeCheck} accent="#6ee7d6" hint="Confirmed by community or authority" />
            <StatTile label="Resolved" value={stats?.resolved} loading={loading && !stats} icon={CheckCircle2} accent="#7fd99a" hint="Repaired or removed" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Active hazards"
              description={data ? `${data.hazards.total} on the map` : undefined}
              actions={
                <Link to="/map">
                  <Button size="sm" icon={MapIcon}>Open live map</Button>
                </Link>
              }
              padded={false}
            >
              <div className="p-3">
                {loading && !data ? (
                  <Spinner label="Loading map" />
                ) : data.hazards.items.length === 0 ? (
                  <EmptyState icon={MapIcon} title="No active hazards yet" action={<Link to="/report"><Button variant="primary" size="sm">Report the first hazard</Button></Link>}>
                    Reports appear here as soon as they are submitted. Demo data may be hidden in the sidebar.
                  </EmptyState>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-[1fr_13rem]">
                    <HazardMap hazards={data.hazards.items} className="h-[360px]" scrollWheelZoom={false} label="Preview map of active hazards" />
                    <div className="hidden xl:block"><MapLegend compact /></div>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Recent activity" description="Latest reports, votes and status changes" padded={false}>
              {loading && !stats ? (
                <Spinner />
              ) : stats.recent_activity.length === 0 ? (
                <EmptyState icon={Activity} title="Nothing yet">Activity shows up here after the first report.</EmptyState>
              ) : (
                <ul className="max-h-[408px] divide-y divide-ink-600/50 overflow-y-auto">
                  {stats.recent_activity.map((e) => (
                    <li key={e.event_id}>
                      <Link to={`/reports/${e.hazard_id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ink-700/40">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: severityMeta(e.severity).color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-mist-100">{describeEvent(e)}</span>
                          <span className="block text-xs text-mist-400">{timeAgo(e.created_at)} · {severityMeta(e.severity).label} severity</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Hazard types" description="Active reports by type">
              {loading && !stats ? <Spinner /> : typeData.length === 0 ? (
                <EmptyState title="No active reports to chart" />
              ) : (
                <div className="h-64" role="img" aria-label={`Active reports by type: ${typeData.map((d) => `${d.name} ${d.count}`).join(', ')}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeData} layout="vertical" margin={{ left: 4, right: 16 }}>
                      <CartesianGrid horizontal={false} stroke="#223756" strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={118} tick={AXIS} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP} />
                      <Bar dataKey="count" name="Reports" fill="#34d3c0" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Severity" description="Active reports by severity">
              {loading && !stats ? <Spinner /> : sevData.every((d) => d.value === 0) ? (
                <EmptyState title="No active reports to chart" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-52 w-52 shrink-0" role="img" aria-label={`Active reports by severity: ${sevData.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sevData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={2} stroke="#101e34" strokeWidth={2}>
                          {sevData.map((d) => <Cell key={d.key} fill={d.color} />)}
                        </Pie>
                        <Tooltip {...TOOLTIP} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 space-y-3 text-sm">
                    {sevData.map((d) => (
                      <li key={d.key} className="flex items-center justify-between gap-2">
                        <SeverityBadge severity={d.key} />
                        <span className="font-semibold tabular-nums text-white">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card title="Reports per day" description="New reports in the last 14 days">
              {loading && !stats ? <Spinner /> : (
                <div className="h-64" role="img" aria-label="Reports submitted per day over the last 14 days">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={perDay} margin={{ left: -18, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="perDay" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d3c0" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#34d3c0" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#223756" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={2} />
                      <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP} />
                      <Area type="monotone" dataKey="count" name="Reports" stroke="#34d3c0" strokeWidth={2} fill="url(#perDay)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <p className="text-xs leading-relaxed text-mist-400">
            Counts come from reports submitted to this application{health?.ai?.available ? '' : ' without AI image analysis (no detection model is installed on this server)'}. They are not official road-condition or accident statistics.
          </p>
        </div>
      )}
    </>
  )
}
