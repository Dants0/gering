/**
 * withCircuitBreaker — protects an unstable service by failing fast.
 *
 * State machine (state isolated per instance, in the closure):
 *   closed    → normal operation. Counts consecutive failures.
 *   open      → `threshold` failures reached: rejects immediately
 *               (CircuitOpenError), without calling the service, for
 *               `halfOpenAfter` ms.
 *   half-open → after the cooldown, lets ONE attempt through. If ok → closed;
 *               if it fails → open again.
 */

import { type Result, err } from '../core/result.js'
import type { Task } from '../core/task.js'

export interface CircuitBreakerOptions {
  /** Consecutive failures to open the circuit. Default: 5. */
  threshold?: number
  /** Time open before trying half-open, in ms. Default: 10000. */
  halfOpenAfter?: number
  /** Callback fired when the circuit opens (observability). */
  onOpen?: () => void
}

/** Error returned when the circuit is open (fail-fast). */
export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError'
  constructor(message = 'Circuit open') {
    super(message)
  }
}

type State = 'closed' | 'open' | 'half-open'

export function withCircuitBreaker<T, E>(
  options: CircuitBreakerOptions = {},
): (task: Task<T, E>) => Task<T, E> {
  const threshold = options.threshold ?? 5
  const cooldown = options.halfOpenAfter ?? 10_000

  let state: State = 'closed'
  let failures = 0
  let openedAt = 0

  return (task) => async (signal) => {
    if (state === 'open') {
      if (Date.now() - openedAt >= cooldown) {
        state = 'half-open'
      } else {
        return err<E, T>(new CircuitOpenError() as E)
      }
    }

    const res: Result<T, E> = await task(signal)

    if (res.isOk()) {
      failures = 0
      state = 'closed'
      return res
    }

    failures++
    if (state === 'half-open' || failures >= threshold) {
      state = 'open'
      openedAt = Date.now()
      failures = 0
      options.onOpen?.()
    }
    return res
  }
}
