/**
 * fallback — degradation chain.
 *
 * Tries each task IN ORDER and returns the first `Ok`. If one fails, it moves to
 * the next (short-circuits on the first success — the rest don't even run). If
 * all fail, it returns the last `Err`.
 *
 *   const forecast = await fallback([
 *     task(() => openSky.getForecast(city)),  // primary provider
 *     task(() => meteoNow.getForecast(city)), // secondary
 *     task(() => localCache.get(city)),       // last resort
 *   ]).unwrap()
 *
 * All alternatives share the same value and error type (interchangeable by
 * definition). If the sources have heterogeneous errors, normalize each first
 * with `.mapErr(...)`.
 */

import { type Result, err } from '../core/result.js'
import { type TaskLike, TaskBuilder, AbortError, asTask, safeRun } from '../core/task.js'

export function fallback<T, E = Error>(tasks: readonly TaskLike<T, E>[]): TaskBuilder<T, E> {
  if (tasks.length === 0) {
    throw new TypeError('fallback() requires at least one task')
  }
  const fns = tasks.map((t) => asTask(t))

  return new TaskBuilder<T, E>(async (signal) => {
    // Guaranteed to be reassigned in the loop (fns has length >= 1).
    let last: Result<T, E> = err<E, T>(new AbortError() as E)
    for (const fn of fns) {
      if (signal?.aborted) return err<E, T>(new AbortError() as E)
      last = await safeRun(fn, signal)
      if (last.isOk()) return last
    }
    return last
  })
}
