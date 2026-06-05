/**
 * withRetry — retries the Task while it returns `Err`.
 *
 * `attempts` includes the first try. Between attempts it waits `delay` ms
 * ('fixed' backoff) or `delay * factor^n` ('exponential'). Aborts immediately if
 * the signal is canceled.
 */

import { type Result, err } from '../core/result.js'
import type { Task } from '../core/task.js'
import { AbortError, wait } from '../core/context.js'

export interface RetryPolicy {
  /** Total number of attempts (includes the first). */
  attempts: number
  /** Wait strategy between attempts. Default: 'fixed'. */
  backoff?: 'fixed' | 'exponential'
  /** Base delay in ms. Default: 100. */
  delay?: number
  /** Multiplicative factor for exponential backoff. Default: 2. */
  factor?: number
}

export function withRetry<T, E>(policy: RetryPolicy | number): (task: Task<T, E>) => Task<T, E> {
  const p: RetryPolicy = typeof policy === 'number' ? { attempts: policy } : policy
  const base = p.delay ?? 100
  const factor = p.factor ?? 2

  return (task) => async (signal) => {
    let last: Result<T, E> = err<E, T>(new AbortError() as E)
    for (let attempt = 0; attempt < p.attempts; attempt++) {
      if (signal?.aborted) return err<E, T>(new AbortError() as E)
      last = await task(signal)
      if (last.isOk()) return last
      if (attempt < p.attempts - 1) {
        const ms = p.backoff === 'exponential' ? base * factor ** attempt : base
        try {
          await wait(ms, signal)
        } catch {
          // signal aborted during the wait: finish as Err without throwing.
          return err<E, T>(new AbortError() as E)
        }
      }
    }
    return last
  }
}
