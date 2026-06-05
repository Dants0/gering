/**
 * withCache — memoizes the Task's success result for a TTL window.
 *
 * Only `Ok` is cached; `Err` always passes through to a fresh execution (it
 * makes no sense to pin a transient failure). The store lives in the
 * middleware's scope, so each `.cache()` is an isolated, independent cache —
 * no global state.
 */

import { type Result, ok } from '../core/result.js'
import type { Task } from '../core/task.js'

export interface CacheOptions {
  /** Entry's time-to-live, in ms. */
  ttl: number
  /** Logical key for the resource. Default: 'default'. */
  key?: string
}

interface Entry<T> {
  value: T
  expires: number
}

export function withCache<T, E>(options: CacheOptions): (task: Task<T, E>) => Task<T, E> {
  const { ttl, key = 'default' } = options
  const store = new Map<string, Entry<T>>()

  return (task) => async (signal) => {
    const hit = store.get(key)
    if (hit && hit.expires > Date.now()) {
      return ok<T, E>(hit.value)
    }
    const res: Result<T, E> = await task(signal)
    if (res.isOk()) {
      store.set(key, { value: res.value, expires: Date.now() + ttl })
    }
    return res
  }
}
