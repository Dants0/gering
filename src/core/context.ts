/**
 * context — primitivos de cancelamento compartilhados.
 *
 * Mora aqui (e não em task.ts) para que o builder e os middlewares dependam de
 * um módulo comum, sem ciclo de import: task.ts → middleware → context, todos
 * apontando "para baixo".
 */

import { type Result, err } from './result.js'
import type { Task } from './task.js' // type-only: apagado em runtime, sem ciclo

/** Erro lançado/retornado quando um Task é cancelado via AbortSignal. */
export class AbortError extends Error {
  override readonly name = 'AbortError'
  constructor(message = 'Task cancelado') {
    super(message)
  }
}

/** Promessa de espera cancelável por AbortSignal. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new AbortError())
      },
      { once: true },
    )
  })
}

/**
 * Cria um AbortController filho que aborta junto com o pai (se houver).
 * `release` remove o listener — chame no finally para não vazar.
 */
export function linkSignal(parent?: AbortSignal): {
  controller: AbortController
  release: () => void
} {
  const controller = new AbortController()
  if (!parent) return { controller, release: () => {} }
  if (parent.aborted) {
    controller.abort()
    return { controller, release: () => {} }
  }
  const onAbort = () => controller.abort()
  parent.addEventListener('abort', onAbort, { once: true })
  return { controller, release: () => parent.removeEventListener('abort', onAbort) }
}

/**
 * Executa um Task com guarda: um `throw` inesperado (o contrato diz que um Task
 * devolve Result e não lança) é capturado como Err em vez de rejeitar a Promise.
 */
export async function safeRun<T, E>(t: Task<T, E>, signal?: AbortSignal): Promise<Result<T, E>> {
  try {
    return await t(signal)
  } catch (cause) {
    return err<E, T>(cause as E)
  }
}
