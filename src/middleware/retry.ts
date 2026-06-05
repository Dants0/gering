/**
 * withRetry — repete o Task enquanto ele retornar `Err`.
 *
 * `attempts` inclui a primeira tentativa. Entre tentativas espera `delay` ms
 * (backoff 'fixed') ou `delay * factor^n` ('exponential'). Aborta na hora se o
 * signal for cancelado.
 */

import { type Result, err } from '../core/result.js'
import type { Task } from '../core/task.js'
import { AbortError, wait } from '../core/context.js'

export interface RetryPolicy {
  /** Número total de tentativas (inclui a primeira). */
  attempts: number
  /** Estratégia de espera entre tentativas. Padrão: 'fixed'. */
  backoff?: 'fixed' | 'exponential'
  /** Atraso base em ms. Padrão: 100. */
  delay?: number
  /** Fator multiplicativo para backoff exponencial. Padrão: 2. */
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
        await wait(ms, signal)
      }
    }
    return last
  }
}
