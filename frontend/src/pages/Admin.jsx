import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, Flag, KeyRound, LockKeyhole, LockOpen, Search, ShieldAlert, ClipboardList, Wrench, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync, useDocumentTitle } from '../hooks/useAsync'
import { useAdmin, useSource, useToast } from '../context'
import { HAZARD_TYPES, SEVERITIES, STATUSES, statusMeta, typeLabel } from '../lib/constants'
import { fmtDate, timeAgo } from '../lib/format'
import { Button, Card, DemoBadge, EmptyState, ErrorState, Field, Notice, PageHeader, Pagination, SeverityBadge, Select, Spinner, StatTile, StatusBadge } from '../components/ui'
import { StatusControl } from '../components/Actions'

const AXIS = { fill: '#9db0cc', fontSize: 12 }
const STATUS_COLORS = { reported: '#9db0cc', verified: '#34d3c0', in_progress: '#7dd3fc', resolved: '#7fd99a', rejected: '#62758f' }
const PAGE_SIZE = 12

function TokenPanel() {
  const { token, setToken, unlocked } = useAdmin()
  const toast = useToast()
  const [value, setValue] = useState('')

  return (
    <Card
      title="Authority access"
      description="Local demo authorisation"
      actions={unlocked ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-300"><LockOpen className="h-3.5 w-3.5" aria-hidden />Token set for this tab</span> : <span className="inline-flex items-center gap-1.5 text-xs text-mist-400"><LockKeyhole className="h-3.5 w-3.5" aria-hidden />Read-only</span>}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-2 text-sm leading-relaxed text-mist-300">
          <p className="flex items-start gap-2 font-medium text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />This is a local demo, not secure production authorisation.</p>
          <p>Status changes are protected by one shared token that the server reads from the <code className="rounded bg-ink-900 px-1 text-xs text-teal-200">ADMIN_TOKEN</code> environment variable. There are no user accounts, roles or audit identities, and the token is held in this browser tab only. Anyone with the token can change any report.</p>
          <p className="text-xs text-mist-400">Viewing reports and analytics needs no token. The token is verified by the server each time you change a status.</p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim()) return
            setToken(value.trim())
            setValue('')
            toast.success('Token saved for this tab. The server checks it when you change a status.')
          }}
        >
          <Field label={unlocked ? 'Replace admin token' : 'Admin token'} htmlFor="admin-token">
            <input id="admin-token" type="password" autoComplete="off" className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value of ADMIN_TOKEN" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" icon={KeyRound} disabled={!value.trim()}>Use token</Button>
            {unlocked && <Button size="sm" variant="ghost" onClick={() => { setToken(''); toast.info('Token cleared.') }}>Clear token</Button>}
          </div>
        </form>
      </div>
      {unlocked && <span className="sr-only">{token.length} characters stored</span>}
    </Card>
  )
}

export default function Admin() {
  useDocumentTitle('Authority dashboard')
  const { source } = useSource()
  const [f, setF] = useState({ status: '', severity: '', type: '', flagged: false, q: '', sort: 'newest' })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const [tick, setTick] = useState(0)

  const stats = useAsync((signal) => api.stats({ source }, signal), [source, tick])
  const list = useAsync((signal) => api.listHazards({ source, status: f.status, severity: f.severity, type: f.type, flagged: f.flagged, q: f.q.trim(), sort: f.sort, page, page_size: PAGE_SIZE }, signal), [source, JSON.stringify(f), page, tick])

  const s = stats.data
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1) }
  const statusData = s ? STATUSES.map((x) => ({ key: x.value, name: x.label, count: s.by_status[x.value] ?? 0 })) : []
  const refresh = () => { setTick((t) => t + 1); setOpen(null) }

  return (
    <>
      <PageHeader title="Authority dashboard" description="Review incoming reports, work through the queue and update statuses. Every change is recorded in the report's history." />

      <div className="space-y-6">
        <TokenPanel />

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatTile label="Awaiting review" value={s?.by_status.reported} loading={stats.loading && !s} icon={Inbox} hint="Reported, not yet verified" />
          <StatTile label="Flagged by community" value={s?.flagged_for_review} loading={stats.loading && !s} icon={Flag} accent="#f5b544" hint="Open reports with at least one flag" />
          <StatTile label="Repair in progress" value={s?.in_progress} loading={stats.loading && !s} icon={Wrench} accent="#7dd3fc" />
          <StatTile label="Total reports" value={s?.total} loading={stats.loading && !s} icon={ClipboardList} accent="#9db0cc" hint={s ? `${s.resolved} resolved, ${s.rejected} rejected` : undefined} />
        </div>

        {stats.error && !s ? <div className="panel"><ErrorState error={stats.error} onRetry={stats.reload} /></div> : (
          <Card title="Reports by status" description="All reports, any age">
            <div className="h-56" role="img" aria-label={`Reports by status: ${statusData.map((d) => `${d.name} ${d.count}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#223756" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#101e34', border: '1px solid #223756', borderRadius: 10, color: '#e8eef7', fontSize: 12 }} cursor={{ fill: 'rgba(52,211,192,0.07)' }} />
                  <Bar dataKey="count" name="Reports" radius={[4, 4, 0, 0]} barSize={36}>
                    {statusData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card title="Report queue" padded={false}>
          <div className="grid gap-4 border-b border-ink-600/60 p-5 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Search descriptions" htmlFor="a-q">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mist-400" aria-hidden /><input id="a-q" className="input pl-9" value={f.q} onChange={set('q')} placeholder="Search" maxLength={100} /></div>
            </Field>
            <Field label="Status" htmlFor="a-status"><Select id="a-status" value={f.status} onChange={set('status')} options={STATUSES} placeholder="All statuses" /></Field>
            <Field label="Severity" htmlFor="a-sev"><Select id="a-sev" value={f.severity} onChange={set('severity')} options={SEVERITIES} placeholder="All severities" /></Field>
            <Field label="Type" htmlFor="a-type"><Select id="a-type" value={f.type} onChange={set('type')} options={HAZARD_TYPES} placeholder="All types" /></Field>
            <Field label="Sort by" htmlFor="a-sort"><Select id="a-sort" value={f.sort} onChange={set('sort')} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'severity', label: 'Highest severity' }, { value: 'verified', label: 'Most confirmed' }]} /></Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-mist-200 sm:col-span-2 lg:col-span-5">
              <input type="checkbox" className="h-4 w-4 accent-teal-400" checked={f.flagged} onChange={(e) => { setF((x) => ({ ...x, flagged: e.target.checked })); setPage(1) }} />
              Only reports flagged by the community
            </label>
          </div>

          {list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Spinner label="Loading reports" /> : list.data.items.length === 0 ? (
            <EmptyState icon={Inbox} title="No reports match">Change or clear the filters to see more reports.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <caption className="sr-only">Hazard reports</caption>
                <thead className="text-xs text-mist-400">
                  <tr className="border-b border-ink-600/60">
                    <th scope="col" className="px-5 py-3 font-medium">Report</th>
                    <th scope="col" className="px-3 py-3 font-medium">Severity</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="px-3 py-3 font-medium">Confirmed / flagged</th>
                    <th scope="col" className="px-3 py-3 font-medium">Reported</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-600/40">
                  {list.data.items.map((h) => (
                    <Fragment key={h.id}>
                      <tr className={open === h.id ? 'bg-ink-700/30' : ''}>
                        <td className="px-5 py-3">
                          <Link to={`/reports/${h.id}`} className="font-medium text-white hover:text-teal-300">#{h.id} {typeLabel(h.hazard_type)}</Link>
                          {h.is_demo && <span className="ml-2 align-middle"><DemoBadge /></span>}
                          {h.description && <p className="mt-0.5 max-w-xs truncate text-xs text-mist-400">{h.description}</p>}
                        </td>
                        <td className="px-3 py-3"><SeverityBadge severity={h.severity} /></td>
                        <td className="px-3 py-3"><StatusBadge status={h.status} /></td>
                        <td className="px-3 py-3 tabular-nums">{h.confirm_count} / <span className={h.flag_count ? 'text-sev-medium' : ''}>{h.flag_count}</span></td>
                        <td className="px-3 py-3 text-mist-300"><time dateTime={h.created_at} title={h.created_at}>{fmtDate(h.created_at)}</time> <span className="text-xs text-mist-400">({timeAgo(h.created_at)})</span></td>
                        <td className="px-5 py-3 text-right">
                          <Button size="sm" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id} aria-controls={`review-${h.id}`}>
                            Review<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === h.id ? 'rotate-180' : ''}`} aria-hidden />
                          </Button>
                        </td>
                      </tr>
                      {open === h.id && (
                        <tr id={`review-${h.id}`} className="bg-ink-900/50">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="max-w-2xl space-y-3">
                              <p className="text-sm text-mist-300">Current status: <strong className="text-white">{statusMeta(h.status).label}</strong>. {h.flag_count > 0 ? `${h.flag_count} community flag${h.flag_count === 1 ? '' : 's'}: check the report history before deciding.` : ''}</p>
                              <StatusControl key={h.status} hazard={h} onUpdated={refresh} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.page_size} onPage={setPage} />}
        </Card>
      </div>
    </>
  )
}
