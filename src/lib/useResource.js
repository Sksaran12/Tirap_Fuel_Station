import { useCallback, useEffect, useRef, useState } from 'react'

export function useResource(loader, deps = []) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const data = await loaderRef.current()
      setState({ data, loading: false, error: '' })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }))
    }
  }, [])

  useEffect(() => {
    let active = true
    // Clear the previous payload so a date/month change can never show stale
    // figures under a new heading while the request is in flight.
    setState({ data: null, loading: true, error: '' })
    loaderRef
      .current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: '' })
      })
      .catch((error) => {
        if (active) setState({ data: null, loading: false, error: error.message })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const setData = useCallback((next) => {
    setState((current) => ({ ...current, data: typeof next === 'function' ? next(current.data) : next }))
  }, [])

  return { ...state, reload: load, refresh: () => setTick((value) => value + 1), setData }
}
