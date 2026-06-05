/**
 * withTimeout — cancels the Task if it doesn't resolve within `ms`.
 *
 * Chains the external signal with the timeout's (either one aborts). The
 * underlying Task must respect the signal for cancellation to take effect; the
 * result becomes whatever Err the Task itself produces when aborted.
 */

import type { Task } from '../core/task.js'
import { linkSignal } from '../core/context.js'

export function withTimeout<T, E>(ms: number): (task: Task<T, E>) => Task<T, E> {
  return (task) => async (signal) => {
    const { controller, release } = linkSignal(signal)
    const timer = setTimeout(() => controller.abort(), ms)
    try {
      return await task(controller.signal)
    } finally {
      clearTimeout(timer)
      release()
    }
  }
}
