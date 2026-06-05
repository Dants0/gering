/**
 * fallback — cadeia de degradação.
 *
 * Tenta cada task EM ORDEM e devolve o primeiro `Ok`. Se um falha, passa para
 * o próximo (short-circuit no primeiro sucesso — os seguintes nem rodam). Se
 * todos falharem, devolve o último `Err`.
 *
 *   const previsao = await fallback([
 *     task(() => openSky.getForecast(cidade)),  // provider primário
 *     task(() => meteoNow.getForecast(cidade)), // secundário
 *     task(() => localCache.get(cidade)),       // último recurso
 *   ]).unwrap()
 *
 * Todas as alternativas compartilham o mesmo tipo de valor e de erro (são, por
 * definição, intercambiáveis). Se as fontes têm erros heterogêneos, normalize
 * antes com `.mapErr(...)` em cada uma.
 */

import { type Result, err } from '../core/result.js'
import { type TaskLike, TaskBuilder, AbortError, asTask, safeRun } from '../core/task.js'

export function fallback<T, E = Error>(tasks: readonly TaskLike<T, E>[]): TaskBuilder<T, E> {
  if (tasks.length === 0) {
    throw new TypeError('fallback() requer ao menos um task')
  }
  const fns = tasks.map((t) => asTask(t))

  return new TaskBuilder<T, E>(async (signal) => {
    // Garantido reatribuído no laço (fns tem length >= 1).
    let last: Result<T, E> = err<E, T>(new AbortError() as E)
    for (const fn of fns) {
      if (signal?.aborted) return err<E, T>(new AbortError() as E)
      last = await safeRun(fn, signal)
      if (last.isOk()) return last
    }
    return last
  })
}
