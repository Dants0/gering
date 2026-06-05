/**
 * race — the first task to settle wins (whether `Ok` or `Err`).
 *
 * Unlike `fallback` (which tries in order and only advances on failure), `race`
 * fires all at once and returns the FIRST to finish — winner by speed, not by
 * success. The losers are canceled via `AbortSignal`.
 *
 *   const quote = await race([
 *     task((s) => fetch(providerA, { signal: s }).then((r) => r.json())),
 *     task((s) => fetch(providerB, { signal: s }).then((r) => r.json())),
 *   ]).unwrap()
 *
 * Useful when you have redundant sources and want the fastest response.
 */

import { err } from '../core/result.js'
import { type TaskLike, TaskBuilder, AbortError, asTask, safeRun } from '../core/task.js'

export function race<T, E = Error>(tasks: readonly TaskLike<T, E>[]): TaskBuilder<T, E> {
  if (tasks.length === 0) {
    throw new TypeError('race() requires at least one task')
  }
  const fns = tasks.map((t) => asTask(t))

  return new TaskBuilder<T, E>(async (signal) => {
    if (signal?.aborted) return err<E, T>(new AbortError() as E)

    // Internal signal: aborting cancels the losers once the winner settles.
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      return await Promise.race(fns.map((fn) => safeRun(fn, controller.signal)))
    } finally {
      controller.abort()
      signal?.removeEventListener('abort', onAbort)
    }
  })
}
