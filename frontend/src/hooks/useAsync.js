import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs `fn(signal)` on mount and whenever `deps` change. Returns { data, error, loading, reload }.
 * Aborts in-flight requests when deps change or the component unmounts.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current(ctrl.signal)
      .then((data) => !ctrl.signal.aborted && setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setState((s) => ({ data: s.data, error, loading: false }))
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = `${title} - RoadGuardian`
  }, [title])
}
