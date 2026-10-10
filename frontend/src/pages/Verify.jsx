import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, ExternalLink, Flag, Users } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { useAsync, useDocumentTitle } from '../hooks/useAsync'
import { useSource } from '../context'
import { HAZARD_TYPES, SEVERITIES, typeLabel } from '../lib/constants'
import { timeAgo } from '../lib/format'
import { Card, DemoBadge, EmptyState, ErrorState, Field, Notice, PageHeader, Pagination, ProgressBar, SeverityBadge, Select, Spinner } from '../components/ui'
import { VoteActions } from '../components/Actions'
import { useHealth } from '../components/Layout'

const PAGE_SIZE = 8

export default function Verify() {
  useDocumentTitle('Community verification')
  const { source } = useSource()
  const { health } = useHealth()
  const threshold = health?.verify_threshold ?? 3
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [severity, setSeverity] = useState('')
  const [tick, setTick] = useState(0)

  const { data, error, loading, reload } = useAsync(
    (signal) => api.listHazards({ source, status: 'reported', type, severity, sort: 'oldest', page, page_size: PAGE_SIZE }, signal),
    [source, type, severity, page, tick],
  )

  return (
    <>
      <PageHeader
        title="Community verification"
        description={`Help keep the map accurate. If you have seen a hazard recently, confirm it. If a report is wrong, already fixed or a duplicate, flag it. A report becomes verified after ${threshold} confirmations.`}
      />

      <Notice kind="info" className="mb-6" title="One vote per report">
        Votes are limited to one per report from each browser. This is best-effort duplicate prevention without accounts, so it can be bypassed by a determined person. Only confirm hazards you have actually seen.
      </Notice>

      <div className="mb-5 grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="Hazard type" htmlFor="v-type"><Select id="v-type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} options={HAZARD_TYPES} placeholder="All types" /></Field>
        <Field label="Severity" htmlFor="v-sev"><Select id="v-sev" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }} options={SEVERITIES} placeholder="All severities" /></Field>
      </div>

      {error && !data ? (
        <div className="panel"><ErrorState error={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <Spinner label="Loading reports awaiting verification" />
      ) : data.items.length === 0 ? (
        <div className="panel"><EmptyState icon={BadgeCheck} title="Nothing is waiting for verification">Every report matching these filters has already been verified or closed. New reports will appear here.</EmptyState></div>
      ) : (
        <Card padded={false} title={`${data.total} report${data.total === 1 ? '' : 's'} awaiting verification`} description="Oldest first, so long-standing reports get a second look">
          <ul className="divide-y divide-ink-600/50">
            {data.items.map((h) => (
              <li key={h.id} className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="flex min-w-0 gap-4">
                  {h.image_url ? (
                    <img src={assetUrl(h.image_url)} alt="" className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block" loading="lazy" />
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{typeLabel(h.hazard_type)}</h3>
                      <SeverityBadge severity={h.severity} />
                      {h.is_demo && <DemoBadge />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-mist-300">{h.description || 'No description provided.'}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-mist-400">
                      <span>Reported {timeAgo(h.created_at)}</span>
                      {h.flag_count > 0 && <span className="inline-flex items-center gap-1 text-sev-medium"><Flag className="h-3 w-3" aria-hidden />{h.flag_count} flagged</span>}
                      <Link to={`/reports/${h.id}`} className="inline-flex items-center gap-1 font-medium text-teal-300 hover:text-teal-200">Open details<ExternalLink className="h-3 w-3" aria-hidden /></Link>
                    </p>
                    <div className="mt-3 max-w-xs">
                      <div className="mb-1 flex items-center justify-between text-xs text-mist-400"><span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />Confirmations</span><span className="tabular-nums text-mist-200">{h.confirm_count} / {threshold}</span></div>
                      <ProgressBar value={h.confirm_count} max={threshold} label={`Report ${h.id} confirmations`} />
                    </div>
                  </div>
                </div>
                <div className="md:justify-self-end"><VoteActions hazard={h} onUpdated={() => setTick((t) => t + 1)} layout="stack" /></div>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={setPage} />
        </Card>
      )}
    </>
  )
}
