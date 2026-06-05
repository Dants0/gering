/**
 * Gering — composição de chamadas a APIs externas (fan-out, cache, fallback).
 * Agnóstico a transporte: qualquer coisa que retorna uma Promise vira um Task.
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

// --- core: context (cancelamento) ---
export { wait, linkSignal } from './core/context.js'

// --- combinadores ---
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
