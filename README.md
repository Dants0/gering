**English** · [Português](README.pt-BR.md)

# Gering

External API call composition for TypeScript/Node.js — **fan-out, cache, fallback, retry, timeout, and circuit breaker** behind a fluent, type-safe API.

Gering solves, consistently, what every project rewrites from scratch: orchestrating multiple calls to external services with resilience and honest types.

```ts
import { task, parallel } from 'gering-flow'

const [forecast, airQuality] = await parallel([
  task(() => openSky.getForecast(city)),
  task(() => airIndex.getAQI(city)),
]).unwrap()
```

## Installation

```bash
npm install gering-flow
```

Published as ESM, types included. Requires Node ≥ 20.

## Design principles

- **Transport-agnostic.** All that matters is `() => Promise<T>`. Bring whatever `fetch`/`axios`/SDK you like. **Zero dependencies.**
- **Explicit errors.** No silent `throw`: every execution returns a [`Result<T, E>`](#resultt-e) the consumer is forced to handle.
- **Cancelable by default.** `AbortSignal` is propagated through the whole pipeline from v1.
- **Isolated state.** Each `task(fn)` is an independent instance — no hidden global state, which makes everything trivial to test.
- **Fluent API.** `task(fn).timeout(2000).retry(3).run()`.

## Core concept: `Task`

The abstraction everything is built on:

```ts
type Task<T, E = Error> = (signal?: AbortSignal) => Promise<Result<T, E>>
```

A function that, given an optional `AbortSignal`, returns a `Result`. `task(fn)` adapts any function that may throw into this shape, capturing exceptions as `Err`.

## `Result<T, E>`

A type-safe error model with no external dependency. Discrimination is via the `ok` field, and manipulation is done through methods on the object itself.

```ts
type Result<T, E = Error> = Ok<T, E> | Err<T, E>
```

| Method | Description |
| --- | --- |
| `.isOk()` / `.isErr()` | Type guards that narrow to `Ok` / `Err`. |
| `.map(fn)` | Transforms the success value. No-op on `Err`. |
| `.mapErr(fn)` | Transforms the error. No-op on `Ok`. |
| `.andThen(fn)` | Chains another `Result` from the value (flatMap). |
| `.orElse(fn)` | Recovers from an error by producing another `Result`. |
| `.unwrap()` | Extracts the value; **throws** if it is `Err`. |
| `.unwrapOr(fallback)` | Extracts the value or returns the fallback. |
| `.unwrapErr()` | Extracts the error; throws if it is `Ok`. |
| `.match({ ok, err })` | Exhaustive pattern matching. |

Constructors and helpers: `ok(value)`, `err(error)`, `fromPromise(promise, onError?)`.

```ts
const r = ok(2).map((n) => n + 1)          // Ok(3)
r.match({ ok: (n) => n, err: () => -1 })   // 3

const e = err<string>('boom')
e.unwrapOr(99)                             // 99
```

## Fluent builder

`task(fn)` returns an immutable `TaskBuilder` — every method returns a new builder.

```ts
const result = await task(() => fetch(url).then((r) => r.json()))
  .timeout(2000)
  .retry({ attempts: 3, backoff: 'exponential' })
  .map((json) => json.data)
  .run() // → Promise<Result<T, E>>
```

| Method | Description |
| --- | --- |
| `.map(fn)` / `.mapErr(fn)` | Transforms the result's value / error. |
| `.andThen(fn)` | Chains another `Task` from the value. |
| `.recover(fn)` | Recovers from an error by chaining another `Task`. |
| `.timeout(ms)` | Cancels via `AbortSignal` if it doesn't resolve in time. |
| `.retry(policy)` | Retries while it returns `Err`. Accepts `number` or `RetryPolicy`. |
| `.cache(options)` | Memoizes the success result for a TTL window. |
| `.circuitBreaker(options?)` | Protects an unstable service (fail-fast). |
| `.use(wrap)` | Extension point for custom middleware. |
| `.run(signal?)` | Runs and returns the `Result`. |
| `.unwrap(signal?)` | Runs and extracts the value (throws on `Err`). |

`RetryPolicy`: `{ attempts, backoff?: 'fixed' | 'exponential', delay?, factor? }`.

## Combinators

### `parallel` — fan-out with a typed tuple

Fires N tasks at once and collects the results **in order, in a typed tuple**. Unlike `Promise.all`, it **does not short-circuit**: one failure doesn't take the others down — you inspect each `Result` individually.

```ts
const [a, b, c] = await parallel([
  task(async () => 1),        // Task<number>
  task(async () => 'two'),    // Task<string>
  task(async () => fetchX()), // Task<X>
]).unwrap()

// a: Result<number, Error>
// b: Result<string, Error>
// c: Result<X, Error>
```

Use `concurrency` to cap how many run at once (result order is preserved):

```ts
await parallel(tasks, { concurrency: 3 }).unwrap()
```

The orchestration itself never fails (`E = never`); failures live inside each `Result` of the tuple.

### `pipe` — sequence with value passing

Sequential composition where one step's `output` becomes the next step's `input`, with chained types (`V0 → V1 → V2`). The first element is a `Task`; each following step is a **function** that receives the previous value and returns the next `Task`.

```ts
const name = await pipe(
  task(() => api.getUserId()),                 // Task<string>
  (id) => task(() => api.getUser(id)),         // (string) => Task<User>
  (user) => task(() => api.getName(user.id)),  // (User) => Task<string>
).unwrap()
```

**Short-circuits on the first `Err`**: if a step fails, the following ones don't run and the pipe returns that `Err`. Types are checked step by step via overloads (up to 5 steps; beyond that, chain two `pipe`s).

### `fallback` — degradation chain

Tries each task **in order** and returns the first `Ok`. If one fails, it moves to the next (short-circuits on the first success — the rest don't even run). If all fail, it returns the **last `Err`**.

```ts
const forecast = await fallback([
  task(() => openSky.getForecast(city)),  // primary provider
  task(() => meteoNow.getForecast(city)), // secondary
  task(() => localCache.get(city)),       // last resort
]).unwrap()
```

All alternatives share the same `T` and `E` (interchangeable by definition). If the sources have heterogeneous errors, normalize each first with `.mapErr(...)`.

### `race` — first to settle wins

Fires all at once and returns the **first to finish** — winner by speed, not by success (it can be `Ok` or `Err`). The losers are canceled via `AbortSignal`.

```ts
const quote = await race([
  task((s) => fetch(providerA, { signal: s }).then((r) => r.json())),
  task((s) => fetch(providerB, { signal: s }).then((r) => r.json())),
]).unwrap()
```

Useful for redundant sources where you want the fastest response. Throws on an empty array.

## End-to-end example

[`examples/weather-dashboard.ts`](examples/weather-dashboard.ts) is a runnable example (fictional "Weather Dashboard" scenario) that combines the patterns into a weather-aggregation flow:

```bash
npm run example
```

It demonstrates three situations, each with a provider failing in a different way:

```ts
// Resilient forecast: primary (retry + timeout + cache) → secondary → local cache
function resilientForecast(city: string) {
  return fallback<Forecast>([
    task((s) => openSkyGet(city, s))
      .retry({ attempts: 3, backoff: 'exponential', delay: 10 })
      .timeout(500)
      .cache({ ttl: 60_000, key: `weather:${city}` }),
    task((s) => meteoNowGet(city, s)).timeout(80),
    task(() => cacheGet(city)),
  ])
}

// Several cities in parallel
const forecasts = await parallel(cities.map((c) => resilientForecast(c))).unwrap()

// Pipeline forecast → detect alert → push (short-circuits on the first error)
const alerted = await pipe(
  resilientForecast(city),
  (f) => task(() => detectAlert(f)),
  (alert) => task((s) => sendPush(alert, s)).retry(3),
).run()
```

Expected output — each line shows a resilience pattern saving the day (retry, fallback to secondary, fallback to cache):

```
━━━ 1. Resilient forecast per city ━━━
  ✔ Lisbon: 24°C via OpenSky          (retry: OpenSky failed 2x, succeeded on the 3rd)
  ✔ Tokyo: 22°C via MeteoNow          (fallback: OpenSky down → secondary)
  ✔ Nairobi: 29°C via cache (stale)   (fallback: both down → local cache)
```

## Middleware

Each middleware is a `(task: Task) => Task` function — composable via `.use(...)` or through the fluent shortcuts on the builder. State (cache, breaker counters) lives in the middleware's scope: **isolated per instance**, nothing global.

| Middleware | Builder shortcut | What it does |
| --- | --- | --- |
| `withTimeout(ms)` | `.timeout(ms)` | Cancels via signal if it runs out of time. |
| `withRetry(policy)` | `.retry(policy)` | Retries while it returns `Err`. |
| `withCache(opts)` | `.cache(opts)` | Memoizes the `Ok` for a TTL window (success only). |
| `withCircuitBreaker(opts)` | `.circuitBreaker(opts)` | Fail-fast after N consecutive failures. |

```ts
// Fluent shortcuts:
task(fn).timeout(2000).retry(3).cache({ ttl: 5000 }).circuitBreaker({ threshold: 5 })

// Or explicit composition via .use, equivalent:
task(fn).use(withTimeout(2000)).use(withRetry(3))
```

**Circuit breaker** — a `closed → open → half-open` state machine. Opens after `threshold` consecutive failures (default 5), failing fast with `CircuitOpenError` for `halfOpenAfter` ms (default 10s); then it lets one attempt through (half-open) and closes if it succeeds.

**Cache** — only `Ok` is cached; `Err` always passes through (it won't pin a transient failure). Keyed by `key` (default `'default'`).

## Status

> Under active development. Implemented so far:

- [x] `core/result.ts` — `Result<T, E>` with methods
- [x] `core/task.ts` — `Task`, `task()`, fluent `TaskBuilder`, `AbortError`
- [x] `combinators/parallel.ts` — fan-out with typed tuple + concurrency
- [x] `combinators/pipe.ts` — sequence with value passing
- [x] `combinators/fallback.ts` — degradation chain
- [x] `combinators/race.ts` — first to settle
- [x] `core/context.ts` — `AbortError`, `wait`, `linkSignal`, `safeRun`
- [x] `middleware/` — `withTimeout`, `withRetry`, `withCache`, `withCircuitBreaker`

Packaged as **ESM** (`type: module`), zero runtime dependencies. The build (`tsc`) emits `dist/` with `.js` + `.d.ts` and source maps. Per-module unit tests in `tests/` (61 cases, `node:test`).

Next steps: the `pipe` combinator beyond 5 steps.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # node:test suite (via tsx)
npm run build       # emits dist/ (js + d.ts)
npm run example     # runs the Weather Dashboard example
```

Commit convention in [`COMMITS.md`](COMMITS.md) (Conventional Commits + `.gitmessage` template).

## License

ISC
