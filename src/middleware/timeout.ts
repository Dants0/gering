/**
 * withTimeout — cancela o Task se ele não resolver dentro de `ms`.
 *
 * Encadeia o signal externo com o do timeout (qualquer um aborta). O Task
 * subjacente precisa respeitar o signal para o cancelamento ser efetivo; o
 * resultado vira o Err que o próprio Task produzir ao ser abortado.
 */

import type { Task } from '../core/task.js'
import { linkSignal } from '../core/context.js'

export function withTimeout<T, E>(ms: number): (task: Task<T, E>) => Task<T, E> {
  return (task) => async (signal) => {
    const { controller, release } = linkSignal(signal)
    const timer = setTimeout(() => controller.abort(), ms)
    try {
      return await task(controller.signal)
    } finally {
      clearTimeout(timer)
      release()
    }
  }
}
