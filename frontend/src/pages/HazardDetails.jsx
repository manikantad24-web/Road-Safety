import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Cpu, Flag, History, ImageOff, Pencil, PlusCircle, ThumbsUp } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { useAsync, useDocumentTitle } from '../hooks/useAsync'
import { statusMeta, typeLabel } from '../lib/constants'
import { fmtCoord, fmtDateTime, timeAgo } from '../lib/format'
import { Card, DemoBadge, ErrorState, Notice, PageHeader, ProgressBar, SeverityBadge, Spinner, StatusBadge } from '../components/ui'
import HazardMap from '../components/HazardMap'
import DetectionImage, { DetectionList } from '../components/DetectionImage'
import { StatusControl, VoteActions } from '../components/Actions'

const DISCLAIMER =
  'Image detection can locate visible damage patterns but cannot establish real-world severity or danger with certainty. Severity on this report was chosen by the reporter.'

const EVENT = {
  created: { icon: PlusCircle, text: () => 'Report submitted' },
  confirmed: { icon: ThumbsUp, text: () => 'Confirmed by a community member' },
  flagged: { icon: Flag, text: () => 'Flagged as incorrect by a community member' },
  status_changed: { icon: Pencil, text: (e) => `Status changed from ${statusMeta(e.from_status).label.toLowerCase()} to ${statusMeta(e.to_status).label.toLowerCase()}` },
}
const ACTOR = { reporter: 'Reporter', community: 'Community', 'admin-demo': 'Authority (demo token)', system: 'System' }

export default function HazardDetails() {
  const { id } = useParams()
  const { data: h, error, loading, reload } = useAsync((signal) => api.getHazard(id, signal), [id])
  useDocumentTitle(h ? `${typeLabel(h.hazard_type)} #${h.id}` : 'Report')

  if (loading && !h) return <Spinner label="Loading report" />
  if (error && !h)
    return (
      <div className="panel mx-auto max-w-lg">
        <ErrorState error={error} title={error.status === 404 ? 'Report not found' : 'Could not load report'} onRetry={error.status === 404 ? undefined : reload} />
        <div className="border-t border-ink-600/60 p-4 text-center"><Link to="/map" className="text-sm font-medium text-teal-300 hover:text-teal-200">Back to the map</Link></div>
      </div>
    )

  const closed = h.status === 'resolved' || h.status === 'rejected'

  return (
    <>
      <Link to="/map" className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden />Live map</Link>
      <PageHeader
        title={`${typeLabel(h.hazard_type)} #${h.id}`}
        description={h.description || 'No description was provided.'}
        actions={<div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={h.severity} /><StatusBadge status={h.status} />{h.is_demo && <DemoBadge />}</div>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Photo and AI analysis">
            {h.image_url ? (
              h.ai_status === 'analyzed' ? (
                <DetectionImage src={assetUrl(h.image_url)} alt={`Photo of the reported ${typeLabel(h.hazard_type).toLowerCase()} with detections outlined`} detections={h.detections} />
              ) : (
                <img src={assetUrl(h.image_url)} alt={`Photo of the reported ${typeLabel(h.hazard_type).toLowerCase()}`} className="max-h-[28rem] w-full rounded-lg bg-ink-900 object-contain" />
              )
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink-500 px-4 py-6 text-sm text-mist-300"><ImageOff className="h-5 w-5 shrink-0" aria-hidden />No photo was attached to this report.</div>
            )}

            <div className="mt-5 space-y-3">
              {h.ai_status === 'analyzed' && (
                <>
                  <p className="flex items-center gap-2 text-sm font-medium text-white"><Cpu className="h-4 w-4 text-teal-300" aria-hidden />Analysed by {h.ai_model}</p>
                  {h.detections.length ? <DetectionList detections={h.detections} /> : <p className="text-sm text-mist-300">The model found no road damage in this photo.</p>}
                  {h.ai_overridden && <Notice kind="info" title="Reporter changed the AI suggestion">The model's top result was {typeLabel(h.ai_suggested_type).toLowerCase()}, but the reporter selected {typeLabel(h.hazard_type).toLowerCase()}.</Notice>}
                </>
              )}
              {h.ai_status === 'unavailable' && <Notice kind="warn" title="Photo not analysed">No AI model was available when this report was submitted, so this is a manual report with an unanalysed photo.</Notice>}
              {h.ai_status === 'manual' && <p className="text-sm text-mist-300">{h.is_demo ? 'Fictional demo report: no photo and no AI analysis.' : 'Manual report: no photo, so no AI analysis was run.'}</p>}
              <p className="text-xs leading-relaxed text-mist-400">{DISCLAIMER}</p>
            </div>
          </Card>

          <Card title="History" description="Everything that has happened to this report">
            <ol className="relative space-y-5 border-l border-ink-600 pl-6">
              {h.events.map((e) => {
                const meta = EVENT[e.kind] ?? EVENT.created
                const Icon = meta.icon
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[2.15rem] grid h-6 w-6 place-items-center rounded-full border border-ink-500 bg-ink-800 text-mist-300"><Icon className="h-3 w-3" aria-hidden /></span>
                    <p className="text-sm text-white">{meta.text(e)}</p>
                    <p className="text-xs text-mist-400"><time dateTime={e.created_at} title={fmtDateTime(e.created_at)}>{timeAgo(e.created_at)}</time> · {ACTOR[e.actor] ?? e.actor}</p>
                    {e.note && <p className="mt-1 text-sm text-mist-300">"{e.note}"</p>}
                  </li>
                )
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Community verification">
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="text-mist-300">Confirmations</span>
                  <span className="font-semibold tabular-nums text-white">{h.confirm_count} <span className="font-normal text-mist-400">of {h.verify_threshold} needed</span></span>
                </div>
                <ProgressBar value={h.confirm_count} max={h.verify_threshold} label="Confirmations toward verification" />
                {h.status === 'verified' && <p className="mt-2 flex items-center gap-1.5 text-xs text-teal-300"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Verified</p>}
              </div>
              <p className="text-sm text-mist-300">{h.flag_count} {h.flag_count === 1 ? 'person has' : 'people have'} flagged this report as incorrect.</p>
              <VoteActions hazard={h} onUpdated={reload} layout="stack" />
            </div>
          </Card>

          <Card title="Details">
            <dl className="space-y-3 text-sm">
              {[
                ['Type', typeLabel(h.hazard_type)],
                ['Severity (reporter)', <SeverityBadge key="s" severity={h.severity} />],
                ['Status', <StatusBadge key="st" status={h.status} />],
                ['Coordinates', <span key="c" className="tabular-nums">{fmtCoord(h.latitude)}, {fmtCoord(h.longitude)}</span>],
                ['Reported', fmtDateTime(h.created_at)],
                ['Last updated', fmtDateTime(h.updated_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4"><dt className="text-mist-400">{k}</dt><dd className="text-right text-white">{v}</dd></div>
              ))}
            </dl>
          </Card>

          <Card padded={false} title="Location">
            <div className="p-3"><HazardMap hazards={[h]} center={[h.latitude, h.longitude]} zoom={16} className="h-56" scrollWheelZoom={false} selectedId={h.id} label="Location of this report" /></div>
          </Card>

          <Card title="Update status" description={closed ? 'This report is closed. Reopen it by choosing another status.' : 'For authorities'}>
            <StatusControl key={h.status} hazard={h} onUpdated={reload} />
          </Card>
        </div>
      </div>
    </>
  )
}
