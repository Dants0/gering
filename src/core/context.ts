/**
 * context — shared cancellation primitives.
 *
 * Lives here (and not in task.ts) so that the builder and the middlewares depend
 * on a common module, with no import cycle: task.ts → middleware → context, all
 * pointing "downward".
 */

import { type Result, err } from './result.js'
import type { Task } from './task.js' // type-only: erased at runtime, no cycle

/** Error thrown/returned when a Task is canceled via AbortSignal. */
export class AbortError extends Error {
  override readonly name = 'AbortError'
  constructor(message = 'Task canceled') {
    super(message)
  }
}

/** A wait promise cancelable by an AbortSignal. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new AbortError())
      },
      { once: true },
    )
  })
}

/**
 * Creates a child AbortController that aborts together with the parent (if any).
 * `release` removes the listener — call it in a finally to avoid leaks.
 */
export function linkSignal(parent?: AbortSignal): {
  controller: AbortController
  release: () => void
} {
  const controller = new AbortController()
  if (!parent) return { controller, release: () => {} }
  if (parent.aborted) {
    controller.abort()
    return { controller, release: () => {} }
  }
  const onAbort = () => controller.abort()
  parent.addEventListener('abort', onAbort, { once: true })
  return { controller, release: () => parent.removeEventListener('abort', onAbort) }
}

/**
 * Runs a Task with a guard: an unexpected `throw` (the contract says a Task
 * returns a Result and doesn't throw) is captured as Err instead of rejecting
 * the Promise.
 */
export async function safeRun<T, E>(t: Task<T, E>, signal?: AbortSignal): Promise<Result<T, E>> {
  try {
    return await t(signal)
  } catch (cause) {
    return err<E, T>(cause as E)
  }
}
