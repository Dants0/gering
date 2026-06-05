/**
 * pipe — sequential composition with value passing.
 *
 * The first element is a Task (no input). Each following step is a FUNCTION
 * that receives the previous step's value and returns the next Task — chaining
 * the types: V0 → V1 → V2 → ...
 *
 *   const name = await pipe(
 *     task(() => api.getUserId()),        // Task<string>
 *     (id) => task(() => api.getUser(id)),// (string) => Task<User>
 *     (user) => task(() => api.getName(user.id)), // (User) => Task<string>
 *   ).unwrap()
 *
 * Short-circuits on the first `Err`: if a step fails, the following ones don't
 * run and the pipe returns that `Err`. All steps share the error type `E`.
 */

import { type Result, err } from '../core/result.js'
import { type TaskLike, TaskBuilder, AbortError, asTask, safeRun } from '../core/task.js'

/** A step: transforms the previous value into the next Task. */
type Step<I, O, E> = (input: I) => TaskLike<O, E>

// Typed overloads: the chain V0 → V1 → ... → Vn is checked step by step.
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
      if (current.isErr()) return current // short-circuit: propagate the Err
      if (signal?.aborted) return err(new AbortError())
      const next = step(current.value) // current is Ok here
      current = await safeRun(asTask(next), signal)
    }
    return current
  })
}
