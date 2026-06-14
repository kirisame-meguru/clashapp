import axios from 'axios'
import { t } from './i18n'

export type ApiSubject = 'core' | 'service'

/**
 * Translate a raw axios transport failure into a human-meaningful Error.
 *
 * The default axios messages (e.g. "timeout of 15000ms exceeded") carry no
 * context about which backend failed or why, so they surface to the user as
 * mysterious toasts. This maps the common transport failures to localized,
 * actionable messages while preserving the original error `code` so the IPC
 * layer and callers can still branch on it.
 *
 * Errors that already have a response body are left for the caller to handle —
 * those are real backend responses, not transport problems.
 */
export function normalizeApiError(error: unknown, subject: ApiSubject): unknown {
  if (!axios.isAxiosError(error)) {
    return error
  }

  const code = error.code
  let key: string
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(error.message || '')) {
    key = subject === 'core' ? 'error.coreTimeout' : 'error.serviceTimeout'
  } else if (
    code === 'ENOENT' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE'
  ) {
    key = subject === 'core' ? 'error.coreUnreachable' : 'error.serviceUnreachable'
  } else {
    key = subject === 'core' ? 'error.coreRequestFailed' : 'error.serviceRequestFailed'
  }

  const friendly = new Error(t(key)) as NodeJS.ErrnoException
  if (code) friendly.code = code
  return friendly
}
