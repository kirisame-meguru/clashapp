import { mainWindow } from '..'
import { safeSend } from './safeSend'

/**
 * Emit a granular progress step for a user-initiated action (connect, disconnect,
 * refresh/add subscription). The renderer collects these into the home-screen
 * status log only while an action is in flight (see status-log-store), so emitting
 * here unconditionally is safe — background work that re-uses these same functions
 * is simply ignored by the renderer.
 *
 * `key` is an i18n key under `pages.statusLog`; it is resolved on the renderer side
 * so language switches stay live.
 */
export function emitProgress(key: string, params?: Record<string, unknown>): void {
  safeSend(mainWindow, 'actionProgress', { key, params })
}
