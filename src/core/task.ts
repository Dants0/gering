/**
 * Task<T, E> — a abstração central do Gering.
 *
 * Tudo é uma função que recebe um AbortSignal opcional e devolve um Result.
 * Agnóstico a transporte: qualquer coisa que produz uma Promise vira um Task.
 *
 *   type Task<T, E> = (signal?: AbortSignal) => Promise<Result<T, E>>
 *
 * `task(fn)` adapta uma função que pode lançar para um TaskBuilder fluente,
 * capturando exceções como Err e propagando cancelamento via AbortSignal.
 */

import { type Result, err, fromPromise } from './result.js'
import { AbortError, safeRun } from './context.js'
import { withTimeout } from '../middleware/timeout.js'
import { withRetry, type RetryPolicy } from '../middleware/retry.js'
import { withCache, type CacheOptions } from '../middleware/cache.js'
import { withCircuitBreaker, type CircuitBreakerOptions } from '../middleware/circuit-breaker.js'

export type Task<T, E = Error> = (signal?: AbortSignal) => Promise<Result<T, E>>

// Re-exports para a superfície pública e para os combinadores.
export { AbortError, safeRun } from './context.js'
export type { RetryPolicy } from '../middleware/retry.js'

/**
 * Wrapper fluente sobre um Task. Cada método devolve um novo builder
 * (imutável), então o estado de cada pipeline é isolado e testável.
 *
 *   task(fn).timeout(2000).retry({ attempts: 3, backoff: 'exponential' }).run()
 */
export class TaskBuilder<T, E = Error> {
  constructor(private readonly task: Task<T, E>) {}

  /** Ponto de extensão genérico — todos os middlewares se plugam por aqui. */
  use<U = T, F = E>(wrap: (task: Task<T, E>) => Task<U, F>): TaskBuilder<U, F> {
    return new TaskBuilder(wrap(this.task))
  }

  /** Transforma o valor de sucesso. */
  map<U>(fn: (value: T) => U): TaskBuilder<U, E> {
    return new TaskBuilder<U, E>(async (signal) => (await this.task(signal)).map(fn))
  }

  /** Transforma o erro. */
  mapErr<F>(fn: (error: E) => F): TaskBuilder<T, F> {
    return new TaskBuilder<T, F>(async (signal) => (await this.task(signal)).mapErr(fn))
  }

  /** Encadeia outro Task a partir do valor de sucesso. */
  andThen<U>(fn: (value: T) => Task<U, E>): TaskBuilder<U, E> {
    return new TaskBuilder<U, E>(async (signal) => {
      const res = await this.task(signal)
      return res.isOk() ? fn(res.value)(signal) : err<E, U>(res.error)
    })
  }

  /** Recupera de um erro encadeando outro Task. */
  recover(fn: (error: E) => Task<T, E>): TaskBuilder<T, E> {
    return new TaskBuilder<T, E>(async (signal) => {
      const res = await this.task(signal)
      return res.isErr() ? fn(res.error)(signal) : res
    })
  }

  /** Cancela o Task se ele não resolver dentro de `ms`. */
  timeout(ms: number): TaskBuilder<T, E> {
    return this.use(withTimeout<T, E>(ms))
  }

  /** Repete o Task enquanto retornar Err, segundo a política. */
  retry(policy: RetryPolicy | number): TaskBuilder<T, E> {
    return this.use(withRetry<T, E>(policy))
  }

  /** Memoiza o resultado de sucesso por uma janela de TTL. */
  cache(options: CacheOptions): TaskBuilder<T, E> {
    return this.use(withCache<T, E>(options))
  }

  /** Protege um serviço instável com circuit breaker (fail-fast). */
  circuitBreaker(options?: CircuitBreakerOptions): TaskBuilder<T, E> {
    return this.use(withCircuitBreaker<T, E>(options))
  }

  /** Executa o pipeline, devolvendo o Result. */
  run(signal?: AbortSignal): Promise<Result<T, E>> {
    return this.task(signal)
  }

  /** Executa e extrai o valor; lança em caso de Err. */
  async unwrap(signal?: AbortSignal): Promise<T> {
    return (await this.task(signal)).unwrap()
  }
}

/**
 * Adapta uma função que pode lançar (qualquer `() => Promise<T>`) em um
 * TaskBuilder. Exceções viram Err; cancelamento prévio do signal vira AbortError.
 */
export function task<T>(fn: (signal?: AbortSignal) => Promise<T>): TaskBuilder<T, Error> {
  return new TaskBuilder<T, Error>(async (signal) => {
    if (signal?.aborted) return err(new AbortError())
    return fromPromise(fn(signal))
  })
}

/** Envolve um Task já no formato canônico (Result) em um builder. */
export function fromTask<T, E = Error>(t: Task<T, E>): TaskBuilder<T, E> {
  return new TaskBuilder<T, E>(t)
}

/**
 * Aceito pelos combinadores: tanto o Task cru quanto o builder fluente.
 * Assim o usuário passa o resultado de `task(fn)...` direto, sem `.toTask()`.
 */
export type TaskLike<T, E = Error> = Task<T, E> | TaskBuilder<T, E>

/** Normaliza um TaskLike para a forma canônica Task. */
export function asTask<T, E>(t: TaskLike<T, E>): Task<T, E> {
  return t instanceof TaskBuilder ? (signal) => t.run(signal) : t
}
