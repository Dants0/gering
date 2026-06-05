/**
 * Result<T, E> — modelo de erro explícito e type-safe do Gering.
 *
 * Sem dependência externa. A discriminação é feita pelo campo `ok`,
 * e a manipulação acontece por métodos no próprio objeto (`.map`, `.unwrap`...).
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

  /** Transforma o valor de sucesso. No-op em Err. */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok<U, E>(fn(this.value))
  }

  /** Transforma o erro. No-op em Ok. */
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value)
  }

  /** Encadeia outro Result a partir do valor (flatMap). */
  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value)
  }

  /** Recupera de um erro produzindo outro Result. No-op em Ok. */
  orElse<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
    return new Ok<T, F>(this.value)
  }

  /** Extrai o valor; lança se for Err. */
  unwrap(): T {
    return this.value
  }

  /** Extrai o valor ou retorna o fallback. */
  unwrapOr(_fallback: T): T {
    return this.value
  }

  /** Extrai o erro; lança se for Ok. */
  unwrapErr(): never {
    throw new TypeError(`unwrapErr() chamado em um Ok: ${String(this.value)}`)
  }

  /** Pattern matching exaustivo sobre os dois lados. */
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
    throw new Error(`unwrap() chamado em um Err: ${String(this.error)}`)
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

/** Constrói um Ok. */
export const ok = <T, E = Error>(value: T): Result<T, E> => new Ok<T, E>(value)

/** Constrói um Err. */
export const err = <E, T = never>(error: E): Result<T, E> => new Err<T, E>(error)

/**
 * Converte uma Promise que pode lançar em um Result.
 * `onError` mapeia a causa desconhecida para o tipo de erro do domínio.
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
