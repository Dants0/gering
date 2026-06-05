/**
 * parallel — fan-out: dispara N tasks ao mesmo tempo e coleta os resultados.
 *
 * Diferente de `Promise.all`, NÃO faz short-circuit: cada task tem seu próprio
 * Result preservado, em ordem, numa TUPLA TIPADA. Uma falha não derruba as
 * outras — a orquestração em si nunca falha (E = never), então o que você
 * inspeciona é cada `Result` individual.
 *
 *   const [previsao, aqi] = await parallel([
 *     task(() => openSky.getForecast(cidade)), // Task<Forecast>
 *     task(() => airIndex.getAQI(cidade)),     // Task<AQI>
 *   ]).unwrap()
 *   // previsao: Result<Forecast, Error>
 *   // aqi:      Result<AQI, Error>
 *
 * `concurrency` limita quantas executam simultaneamente (preservando a ordem
 * dos resultados). Sem ele, todas saem de uma vez.
 */

import { type Result, ok } from '../core/result.js'
import { type TaskLike, TaskBuilder, asTask, safeRun } from '../core/task.js'

/** Mapeia uma tupla de TaskLike para a tupla de Results correspondente. */
type ResultsOf<TS extends readonly TaskLike<unknown, unknown>[]> = {
  [K in keyof TS]: TS[K] extends TaskLike<infer T, infer E> ? Result<T, E> : never
}

export interface ParallelOptions {
  /** Máximo de tasks executando ao mesmo tempo. Padrão: todas. */
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
