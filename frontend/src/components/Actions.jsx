import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, ThumbsUp, Lock, Save } from 'lucide-react'
import { api, ApiError, local } from '../lib/api'
import { STATUSES } from '../lib/constants'
import { useAdmin, useToast } from '../context'
import { Button, Field, Notice, Select } from './ui'

const votesKey = 'rg_votes'
const readVotes = () => {
  try {
    return JSON.parse(local.getItem(votesKey) || '{}')
  } catch {
    return {}
  }
}
const rememberVote = (id, vote) => local.setItem(votesKey, JSON.stringify({ ...readVotes(), [id]: vote }))
export const previousVote = (id) => readVotes()[id] || null

/** Confirm / flag a hazard. The server enforces one vote per anonymous client; this UI mirrors that. */
export function VoteActions({ hazard, onUpdated, layout = 'row' }) {
  const toast = useToast()
  const [vote, setVote] = useState(() => previousVote(hazard.id))
  const [busy, setBusy] = useState(null)
  const [flagging, setFlagging] = useState(false)
  const [note, setNote] = useState('')
  const closed = hazard.status === 'resolved' || hazard.status === 'rejected'

  async function submit(kind) {
    setBusy(kind)
    try {
      const res = await api.verify(hazard.id, kind, kind === 'flag' ? note : '')
      rememberVote(hazard.id, kind)
      setVote(kind)
      setFlagging(false)
      setNote('')
      toast.success(
        res.auto_verified ? 'Thanks. Your confirmation made this report verified.' : kind === 'confirm' ? 'Thanks. Your confirmation was recorded.' : 'Thanks. Your flag was recorded for review.',
      )
      onUpdated?.(res.hazard)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_voted') {
        const v = e.details?.vote || vote || 'confirm'
        rememberVote(hazard.id, v)
        setVote(v)
        toast.info('You have already voted on this report.')
      } else {
        toast.error(e.message)
      }
    } finally {
      setBusy(null)
    }
  }

  if (closed) return <p className="text-sm text-mist-400">This report is {hazard.status}, so it no longer accepts votes.</p>
  if (vote) {
    return (
      <p className="inline-flex items-center gap-2 rounded-lg border border-teal-600/40 bg-teal-700/15 px-3 py-2 text-sm text-teal-200">
        {vote === 'confirm' ? <ThumbsUp className="h-4 w-4" aria-hidden /> : <Flag className="h-4 w-4" aria-hidden />}
        You {vote === 'confirm' ? 'confirmed' : 'flagged'} this report from this browser.
      </p>
    )
  }
  return (
    <div className={layout === 'row' ? '' : 'space-y-3'}>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={ThumbsUp} loading={busy === 'confirm'} disabled={Boolean(busy)} onClick={() => submit('confirm')}>
          Confirm hazard is still there
        </Button>
        <Button size="sm" icon={Flag} disabled={Boolean(busy)} onClick={() => setFlagging((v) => !v)} aria-expanded={flagging}>
          Flag as incorrect
        </Button>
      </div>
      {flagging && (
        <div className="mt-3 rounded-lg border border-ink-600 bg-ink-900/60 p-3">
          <Field label="What is wrong with this report? (optional)" htmlFor={`flag-note-${hazard.id}`}>
            <input id={`flag-note-${hazard.id}`} className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: already repaired, wrong location, duplicate" />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" icon={Flag} loading={busy === 'flag'} onClick={() => submit('flag')}>
              Send flag
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFlagging(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Change a report's status. Requires the demo admin token (see the Authority dashboard). */
export function StatusControl({ hazard, onUpdated }) {
  const { token, setToken, unlocked } = useAdmin()
  const toast = useToast()
  const [status, setStatus] = useState(hazard.status)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (!unlocked) {
    return (
      <Notice kind="info" title="Admin token needed">
        Changing a status requires the local demo token. Enter it on the{' '}
        <Link to="/admin" className="font-medium text-teal-300 underline-offset-2 hover:underline">
          Authority dashboard
        </Link>
        .
      </Notice>
    )
  }

  async function save() {
    setBusy(true)
    try {
      const updated = await api.setStatus(hazard.id, status, note, token)
      toast.success(`Status changed to ${STATUSES.find((s) => s.value === updated.status).label.toLowerCase()}.`)
      setNote('')
      onUpdated?.(updated)
    } catch (e) {
      if (e.status === 401) setToken('')
      toast.error(e.status === 401 ? 'The admin token was rejected. Enter it again on the Authority dashboard.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New status" htmlFor={`status-${hazard.id}`}>
          <Select id={`status-${hazard.id}`} value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES} />
        </Field>
        <Field label="Note (optional)" htmlFor={`status-note-${hazard.id}`}>
          <input id={`status-note-${hazard.id}`} className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is the status changing?" />
        </Field>
      </div>
      <Button variant="primary" size="sm" icon={Save} loading={busy} disabled={status === hazard.status} onClick={save}>
        Save status
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-mist-400">
        <Lock className="h-3.5 w-3.5" aria-hidden /> Local demo authorisation with a shared token, not user accounts.
      </p>
    </div>
  )
}
