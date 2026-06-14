import { toast } from 'sonner'

/**
 * Robustly extract a displayable message from anything thrown/rejected.
 *
 * Errors crossing the IPC bridge arrive in several shapes: plain strings,
 * Error instances, or structured `{ code, message }` objects (see the main
 * `ipcErrorWrapper`). Doing `` `${e}` `` on the latter yields "[object Object]",
 * so all error rendering should go through here.
 */
export function getErrorMessage(e: unknown): string {
  if (e == null) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    try {
      return JSON.stringify(e)
    } catch {
      return String(e)
    }
  }
  return String(e)
}

export interface NotifyErrorOptions {
  /**
   * Short label for the operation that failed, shown as the toast title with
   * the underlying cause as the description. Without it, the cause is the title.
   */
  context?: string
  /**
   * Stable id used to dedupe. Repeated failures with the same id collapse into
   * a single toast instead of stacking — useful for background polling that can
   * fail many times in a row.
   */
  id?: string
}

/** Single entry point for surfacing an error to the user as a toast. */
export function notifyError(e: unknown, options: NotifyErrorOptions = {}): void {
  const message = getErrorMessage(e)
  const { context, id } = options
  if (context) {
    toast.error(context, { description: message, id })
  } else {
    toast.error(message, { id })
  }
}
