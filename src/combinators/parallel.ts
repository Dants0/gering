/**
 * parallel — fan-out: fires N tasks at once and collects the results.
 *
 * Unlike `Promise.all`, it does NOT short-circuit: each task keeps its own
 * Result, in order, in a TYPED TUPLE. One failure doesn't take the others down
 * — the orchestration itself never fails (E = never), so what you inspect is
 * each individual `Result`.
 *
 *   const [forecast, aqi] = await parallel([
 *     task(() => openSky.getForecast(city)), // Task<Forecast>
 *     task(() => airIndex.getAQI(city)),     // Task<AQI>
 *   ]).unwrap()
 *   // forecast: Result<Forecast, Error>
 *   // aqi:      Result<AQI, Error>
 *
 * `concurrency` caps how many run at the same time (preserving result order).
 * Without it, they all start at once.
 */

import { type Result, ok } from '../core/result.js'
import { type TaskLike, TaskBuilder, asTask, safeRun } from '../core/task.js'

/** Maps a tuple of TaskLike into the corresponding tuple of Results. */
type ResultsOf<TS extends readonly TaskLike<unknown, unknown>[]> = {
  [K in keyof TS]: TS[K] extends TaskLike<infer T, infer E> ? Result<T, E> : never
}

export interface ParallelOptions {
  /** Maximum number of tasks running at the same time. Default: all. */
  concurrency?: number
}

export function parallel<const TS extends readonly TaskLike<unknown, unknown>[]>(
  tasks: TS,
  options: ParallelOptions = {},
): TaskBuilder<ResultsOf<TS>, never> {
  const fns = tasks.map((t) => asTask(t as TaskLike<unknown, unknown>))
  const limit = options.concurrency ?? fns.length

  return new TaskBuilder<ResultsOf<TS>, never>(async (signal) => {
    const results = new Array<Result<unknown, unknown>>(fns.length)
    let cursor = 0

    const worker = async (): Promise<void> => {
      while (true) {
        const i = cursor++
        if (i >= fns.length) return
        results[i] = await safeRun(fns[i]!, signal)
      }
    }

    const pool = Math.max(1, Math.min(limit, fns.length))
    await Promise.all(Array.from({ length: pool }, worker))

    return ok(results as ResultsOf<TS>)
  })
}
