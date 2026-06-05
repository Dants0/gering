/**
 * Task<T, E> — Gering's core abstraction.
 *
 * Everything is a function that takes an optional AbortSignal and returns a
 * Result. Transport-agnostic: anything that produces a Promise becomes a Task.
 *
 *   type Task<T, E> = (signal?: AbortSignal) => Promise<Result<T, E>>
 *
 * `task(fn)` adapts a function that may throw into a fluent TaskBuilder,
 * capturing exceptions as Err and propagating cancellation via AbortSignal.
 */

import { type Result, err, fromPromise } from './result.js'
import { AbortError, safeRun } from './context.js'
import { withTimeout } from '../middleware/timeout.js'
import { withRetry, type RetryPolicy } from '../middleware/retry.js'
import { withCache, type CacheOptions } from '../middleware/cache.js'
import { withCircuitBreaker, type CircuitBreakerOptions } from '../middleware/circuit-breaker.js'

export type Task<T, E = Error> = (signal?: AbortSignal) => Promise<Result<T, E>>

// Re-exports for the public surface and for the combinators.
export { AbortError, safeRun } from './context.js'
export type { RetryPolicy } from '../middleware/retry.js'

/**
 * Fluent wrapper over a Task. Each method returns a new builder (immutable),
 * so each pipeline's state is isolated and testable.
 *
 *   task(fn).timeout(2000).retry({ attempts: 3, backoff: 'exponential' }).run()
 */
export class TaskBuilder<T, E = Error> {
  constructor(private readonly task: Task<T, E>) {}

  /** Generic extension point — all middlewares plug in here. */
  use<U = T, F = E>(wrap: (task: Task<T, E>) => Task<U, F>): TaskBuilder<U, F> {
    return new TaskBuilder(wrap(this.task))
  }

  /** Transforms the success value. */
  map<U>(fn: (value: T) => U): TaskBuilder<U, E> {
    return new TaskBuilder<U, E>(async (signal) => (await this.task(signal)).map(fn))
  }

  /** Transforms the error. */
  mapErr<F>(fn: (error: E) => F): TaskBuilder<T, F> {
    return new TaskBuilder<T, F>(async (signal) => (await this.task(signal)).mapErr(fn))
  }

  /** Chains another Task from the success value. */
  andThen<U>(fn: (value: T) => Task<U, E>): TaskBuilder<U, E> {
    return new TaskBuilder<U, E>(async (signal) => {
      const res = await this.task(signal)
      return res.isOk() ? fn(res.value)(signal) : err<E, U>(res.error)
    })
  }

  /** Recovers from an error by chaining another Task. */
  recover(fn: (error: E) => Task<T, E>): TaskBuilder<T, E> {
    return new TaskBuilder<T, E>(async (signal) => {
      const res = await this.task(signal)
      return res.isErr() ? fn(res.error)(signal) : res
    })
  }

  /** Cancels the Task if it doesn't resolve within `ms`. */
  timeout(ms: number): TaskBuilder<T, E> {
    return this.use(withTimeout<T, E>(ms))
  }

  /** Retries the Task while it returns Err, per the policy. */
  retry(policy: RetryPolicy | number): TaskBuilder<T, E> {
    return this.use(withRetry<T, E>(policy))
  }

  /** Memoizes the success result for a TTL window. */
  cache(options: CacheOptions): TaskBuilder<T, E> {
    return this.use(withCache<T, E>(options))
  }

  /** Protects an unstable service with a circuit breaker (fail-fast). */
  circuitBreaker(options?: CircuitBreakerOptions): TaskBuilder<T, E> {
    return this.use(withCircuitBreaker<T, E>(options))
  }

  /** Runs the pipeline, returning the Result. */
  run(signal?: AbortSignal): Promise<Result<T, E>> {
    return this.task(signal)
  }

  /** Runs and extracts the value; throws on Err. */
  async unwrap(signal?: AbortSignal): Promise<T> {
    return (await this.task(signal)).unwrap()
  }
}

/**
 * Adapts a function that may throw (any `() => Promise<T>`) into a TaskBuilder.
 * Exceptions become Err; a signal already aborted becomes AbortError.
 */
export function task<T>(fn: (signal?: AbortSignal) => Promise<T>): TaskBuilder<T, Error> {
  return new TaskBuilder<T, Error>(async (signal) => {
    if (signal?.aborted) return err(new AbortError())
    return fromPromise(fn(signal))
  })
}

/** Wraps a Task already in canonical form (Result) into a builder. */
export function fromTask<T, E = Error>(t: Task<T, E>): TaskBuilder<T, E> {
  return new TaskBuilder<T, E>(t)
}

/**
 * Accepted by the combinators: both the raw Task and the fluent builder.
 * Lets the user pass the result of `task(fn)...` directly, without `.toTask()`.
 */
export type TaskLike<T, E = Error> = Task<T, E> | TaskBuilder<T, E>

/** Normalizes a TaskLike into the canonical Task form. */
export function asTask<T, E>(t: TaskLike<T, E>): Task<T, E> {
  return t instanceof TaskBuilder ? (signal) => t.run(signal) : t
}
