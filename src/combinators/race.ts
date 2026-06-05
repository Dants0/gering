/**
 * race — o primeiro task a resolver vence (seja `Ok` ou `Err`).
 *
 * Diferente de `fallback` (que tenta em ordem e só avança em falha), `race`
 * dispara todos ao mesmo tempo e devolve o PRIMEIRO a terminar — vencedor por
 * velocidade, não por sucesso. Os perdedores são cancelados via `AbortSignal`.
 *
 *   const cotacao = await race([
 *     task((s) => fetch(provedorA, { signal: s }).then((r) => r.json())),
 *     task((s) => fetch(provedorB, { signal: s }).then((r) => r.json())),
 *   ]).unwrap()
 *
 * Útil quando você tem fontes redundantes e quer a resposta mais rápida.
 */

import { err } from '../core/result.js'
import { type TaskLike, TaskBuilder, AbortError, asTask, safeRun } from '../core/task.js'

export function race<T, E = Error>(tasks: readonly TaskLike<T, E>[]): TaskBuilder<T, E> {
  if (tasks.length === 0) {
    throw new TypeError('race() requer ao menos um task')
  }
  const fns = tasks.map((t) => asTask(t))

  return new TaskBuilder<T, E>(async (signal) => {
    if (signal?.aborted) return err<E, T>(new AbortError() as E)

    // Signal interno: abortar cancela os perdedores quando o vencedor resolve.
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      return await Promise.race(fns.map((fn) => safeRun(fn, controller.signal)))
    } finally {
      controller.abort()
      signal?.removeEventListener('abort', onAbort)
    }
  })
}
