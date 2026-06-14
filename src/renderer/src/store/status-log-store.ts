import { create } from 'zustand'

// How long the terminal line (Connected!/Updated!/…) stays before the whole
// stack fades away together. Steps themselves never expire on their own — they
// persist until the action finishes.
const FINAL_TTL = 2600

export interface StatusEntry {
  id: number
  /** i18n key under `pages.statusLog`, resolved on render so language stays live. */
  key: string
  params?: Record<string, unknown>
  /** Final line of an action — rendered solid/emphasised. */
  terminal?: boolean
  state?: 'success' | 'error'
}

interface StatusLogStore {
  /** True only while a user-initiated action is in flight. Gates incoming steps. */
  active: boolean
  entries: StatusEntry[]
  /** Start a new action: clear any leftovers and begin collecting steps. */
  begin: () => void
  /** Append a backend step. No-op unless an action is active. */
  step: (key: string, params?: Record<string, unknown>) => void
  /** Append the terminal line and schedule the stack to fade away. */
  finish: (key: string, state?: 'success' | 'error', params?: Record<string, unknown>) => void
  /** Convenience for a failed terminal line. */
  fail: (key: string, params?: Record<string, unknown>) => void
}

let counter = 0
let clearTimer: ReturnType<typeof setTimeout> | null = null

const cancelClearTimer = (): void => {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
}

export const useStatusLogStore = create<StatusLogStore>((set) => ({
  active: false,
  entries: [],
  begin: (): void => {
    cancelClearTimer()
    set({ active: true, entries: [] })
  },
  step: (key, params): void => {
    if (!useStatusLogStore.getState().active) return
    const id = ++counter
    set((s) => ({ entries: s.entries.concat({ id, key, params }) }))
  },
  finish: (key, state = 'success', params): void => {
    cancelClearTimer()
    const id = ++counter
    set((s) => ({
      active: false,
      entries: s.entries.concat({ id, key, params, terminal: true, state })
    }))
    clearTimer = setTimeout(() => {
      clearTimer = null
      set({ entries: [] })
    }, FINAL_TTL)
  },
  fail: (key, params): void => {
    useStatusLogStore.getState().finish(key, 'error', params)
  }
}))

let attached = false
// `ipcRenderer.on` (from @electron-toolkit/preload) wraps the listener internally
// and returns an unsubscribe function — `removeListener` with our own reference
// would never match, so we must keep and call the returned disposer.
let disposeIpc: (() => void) | null = null

export const attachStatusLogStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  const off = window.electron.ipcRenderer.on(
    'actionProgress',
    (_event, payload: { key: string; params?: Record<string, unknown> }): void => {
      if (!payload?.key) return
      useStatusLogStore.getState().step(payload.key, payload.params)
    }
  )
  disposeIpc = typeof off === 'function' ? off : null

  return (): void => {
    if (!attached) return
    attached = false
    if (disposeIpc) {
      disposeIpc()
      disposeIpc = null
    } else {
      window.electron.ipcRenderer.removeAllListeners('actionProgress')
    }
    cancelClearTimer()
    useStatusLogStore.setState({ active: false, entries: [] })
  }
}
