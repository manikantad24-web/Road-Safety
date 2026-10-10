import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { local, session } from './lib/api'

/* ------------------------------------------------------------------ toasts */
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

const TOAST_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TOAST_TONE = { success: 'text-teal-300', error: 'text-sev-high', info: 'text-sky-300' }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (kind, message) => {
      const id = Math.random().toString(36).slice(2)
      setItems((xs) => [...xs.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500)
    },
    [dismiss],
  )
  const api = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  )
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" role="status">
        {items.map((t) => {
          const Icon = TOAST_ICON[t.kind]
          return (
            <div key={t.id} className="panel pointer-events-auto flex items-start gap-3 px-4 py-3 text-sm">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TOAST_TONE[t.kind]}`} aria-hidden />
              <p className="flex-1 text-mist-100">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-mist-400 hover:text-mist-100" aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

/* -------------------------------------------- demo-data visibility (global) */
const SourceCtx = createContext(null)
export const useSource = () => useContext(SourceCtx)

export function SourceProvider({ children }) {
  const [showDemo, setShowDemo] = useState(local.getItem('rg_show_demo') !== '0')
  const toggle = useCallback(() => {
    setShowDemo((v) => {
      local.setItem('rg_show_demo', v ? '0' : '1')
      return !v
    })
  }, [])
  // `source` is passed straight to the API: "all" includes fictional demo reports, "real" excludes them.
  const value = useMemo(() => ({ showDemo, toggle, source: showDemo ? 'all' : 'real' }), [showDemo, toggle])
  return <SourceCtx.Provider value={value}>{children}</SourceCtx.Provider>
}

/* ----------------------------------- admin token (LOCAL DEMO authorisation) */
const AdminCtx = createContext(null)
export const useAdmin = () => useContext(AdminCtx)

export function AdminProvider({ children }) {
  const [token, setTokenState] = useState(session.getItem('rg_admin_token') || '')
  const setToken = useCallback((t) => {
    if (t) session.setItem('rg_admin_token', t)
    else session.removeItem('rg_admin_token')
    setTokenState(t)
  }, [])
  const value = useMemo(() => ({ token, setToken, unlocked: Boolean(token) }), [token, setToken])
  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>
}
