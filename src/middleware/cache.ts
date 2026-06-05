/**
 * withCache — memoiza o resultado de sucesso do Task por uma janela de TTL.
 *
 * Só `Ok` é cacheado; `Err` sempre repassa para uma nova execução (não faz
 * sentido fixar uma falha transitória). O store vive no escopo do middleware,
 * então cada `.cache()` é um cache isolado e independente — sem estado global.
 */

import { type Result, ok } from '../core/result.js'
import type { Task } from '../core/task.js'

export interface CacheOptions {
  /** Tempo de vida da entrada, em ms. */
  ttl: number
  /** Chave lógica do recurso. Padrão: 'default'. */
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
