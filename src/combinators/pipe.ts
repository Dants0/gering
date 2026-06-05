/**
 * pipe — composição sequencial com passagem de valor.
 *
 * O primeiro elemento é um Task (sem entrada). Cada passo seguinte é uma
 * FUNÇÃO que recebe o valor do passo anterior e devolve o próximo Task —
 * encadeando os tipos: V0 → V1 → V2 → ...
 *
 *   const nome = await pipe(
 *     task(() => api.getUserId()),        // Task<string>
 *     (id) => task(() => api.getUser(id)),// (string) => Task<User>
 *     (user) => task(() => api.getName(user.id)), // (User) => Task<string>
 *   ).unwrap()
 *
 * Short-circuit no primeiro `Err`: se um passo falha, os seguintes não rodam
 * e o pipe devolve esse `Err`. Todos os passos compartilham o tipo de erro `E`.
 */

import { type Result, err } from '../core/result.js'
import { type TaskLike, TaskBuilder, AbortError, asTask, safeRun } from '../core/task.js'

/** Um passo: transforma o valor anterior no próximo Task. */
type Step<I, O, E> = (input: I) => TaskLike<O, E>

// Overloads tipados: a cadeia V0 → V1 → ... → Vn é verificada passo a passo.
export function pipe<V0, E>(head: TaskLike<V0, E>): TaskBuilder<V0, E>
export function pipe<V0, V1, E>(head: TaskLike<V0, E>, s1: Step<V0, V1, E>): TaskBuilder<V1, E>
export function pipe<V0, V1, V2, E>(
  head: TaskLike<V0, E>,
  s1: Step<V0, V1, E>,
  s2: Step<V1, V2, E>,
): TaskBuilder<V2, E>
export function pipe<V0, V1, V2, V3, E>(
  head: TaskLike<V0, E>,
  s1: Step<V0, V1, E>,
  s2: Step<V1, V2, E>,
  s3: Step<V2, V3, E>,
): TaskBuilder<V3, E>
export function pipe<V0, V1, V2, V3, V4, E>(
  head: TaskLike<V0, E>,
  s1: Step<V0, V1, E>,
  s2: Step<V1, V2, E>,
  s3: Step<V2, V3, E>,
  s4: Step<V3, V4, E>,
): TaskBuilder<V4, E>
export function pipe<V0, V1, V2, V3, V4, V5, E>(
  head: TaskLike<V0, E>,
  s1: Step<V0, V1, E>,
  s2: Step<V1, V2, E>,
  s3: Step<V2, V3, E>,
  s4: Step<V3, V4, E>,
  s5: Step<V4, V5, E>,
): TaskBuilder<V5, E>

export function pipe(
  head: TaskLike<unknown, unknown>,
  ...steps: Step<unknown, unknown, unknown>[]
): TaskBuilder<unknown, unknown> {
  return new TaskBuilder<unknown, unknown>(async (signal) => {
    let current: Result<unknown, unknown> = await safeRun(asTask(head), signal)
    for (const step of steps) {
      if (current.isErr()) return current // short-circuit: propaga o Err
      if (signal?.aborted) return err(new AbortError())
      const next = step(current.value) // current é Ok aqui
      current = await safeRun(asTask(next), signal)
    }
    return current
  })
}
