/**
 * Result<T, E> — Gering's explicit, type-safe error model.
 *
 * No external dependency. Discrimination is done via the `ok` field, and
 * manipulation happens through methods on the object itself (`.map`, `.unwrap`...).
 */

export type Result<T, E = Error> = Ok<T, E> | Err<T, E>

export class Ok<T, E = Error> {
  readonly ok = true as const
  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true
  }
  isErr(): this is Err<T, E> {
    return false
  }

  /** Transforms the success value. No-op on Err. */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok<U, E>(fn(this.value))
  }

  /** Transforms the error. No-op on Ok. */
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value)
  }

  /** Chains another Result from the value (flatMap). */
  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value)
  }

  /** Recovers from an error by producing another Result. No-op on Ok. */
  orElse<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
    return new Ok<T, F>(this.value)
  }

  /** Extracts the value; throws if it is Err. */
  unwrap(): T {
    return this.value
  }

  /** Extracts the value or returns the fallback. */
  unwrapOr(_fallback: T): T {
    return this.value
  }

  /** Extracts the error; throws if it is Ok. */
  unwrapErr(): never {
    throw new TypeError(`unwrapErr() called on an Ok: ${String(this.value)}`)
  }

  /** Exhaustive pattern matching over both sides. */
  match<R>(arms: { ok: (value: T) => R; err: (error: E) => R }): R {
    return arms.ok(this.value)
  }
}

export class Err<T, E = Error> {
  readonly ok = false as const
  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false
  }
  isErr(): this is Err<T, E> {
    return true
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error)
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error))
  }

  andThen<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return new Err<U, E>(this.error)
  }

  orElse<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
    return fn(this.error)
  }

  unwrap(): never {
    if (this.error instanceof Error) throw this.error
    throw new Error(`unwrap() called on an Err: ${String(this.error)}`)
  }

  unwrapOr(fallback: T): T {
    return fallback
  }

  unwrapErr(): E {
    return this.error
  }

  match<R>(arms: { ok: (value: T) => R; err: (error: E) => R }): R {
    return arms.err(this.error)
  }
}

/** Builds an Ok. */
export const ok = <T, E = Error>(value: T): Result<T, E> => new Ok<T, E>(value)

/** Builds an Err. */
export const err = <E, T = never>(error: E): Result<T, E> => new Err<T, E>(error)

/**
 * Converts a Promise that may throw into a Result.
 * `onError` maps the unknown cause into the domain's error type.
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  onError: (cause: unknown) => E = (cause) => cause as E,
): Promise<Result<T, E>> {
  try {
    return new Ok<T, E>(await promise)
  } catch (cause) {
    return new Err<T, E>(onError(cause))
  }
}
