/**
 * Gering — external API call composition (fan-out, cache, fallback).
 * Transport-agnostic: anything that returns a Promise becomes a Task.
 */

// --- core: Result ---
export {
  type Result,
  Ok,
  Err,
  ok,
  err,
  fromPromise,
} from './core/result.js'

// --- core: Task ---
export {
  type Task,
  type TaskLike,
  type RetryPolicy,
  TaskBuilder,
  AbortError,
  task,
  fromTask,
  asTask,
  safeRun,
} from './core/task.js'

// --- core: context (cancellation) ---
export { wait, linkSignal } from './core/context.js'

// --- combinators ---
export { parallel, type ParallelOptions } from './combinators/parallel.js'
export { fallback } from './combinators/fallback.js'
export { pipe } from './combinators/pipe.js'
export { race } from './combinators/race.js'

// --- middleware ---
export { withTimeout } from './middleware/timeout.js'
export { withRetry } from './middleware/retry.js'
export { withCache, type CacheOptions } from './middleware/cache.js'
export {
  withCircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerOptions,
} from './middleware/circuit-breaker.js'
