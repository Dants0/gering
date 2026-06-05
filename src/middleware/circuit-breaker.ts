/**
 * withCircuitBreaker — protege um serviço instável falhando rápido.
 *
 * Máquina de estados (estado isolado por instância, no closure):
 *   closed    → operação normal. Conta falhas consecutivas.
 *   open      → `threshold` falhas atingido: rejeita na hora (CircuitOpenError),
 *               sem chamar o serviço, por `halfOpenAfter` ms.
 *   half-open → passado o cooldown, deixa UMA tentativa passar. Se ok → closed;
 *               se falha → open de novo.
 */

import { type Result, err } from '../core/result.js'
import type { Task } from '../core/task.js'

export interface CircuitBreakerOptions {
  /** Falhas consecutivas para abrir o circuito. Padrão: 5. */
  threshold?: number
  /** Tempo aberto antes de tentar half-open, em ms. Padrão: 10000. */
  halfOpenAfter?: number
  /** Callback disparado quando o circuito abre (observabilidade). */
  onOpen?: () => void
}

/** Erro retornado quando o circuito está aberto (fail-fast). */
export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError'
  constructor(message = 'Circuito aberto') {
    super(message)
  }
}

type State = 'closed' | 'open' | 'half-open'

export function withCircuitBreaker<T, E>(
  options: CircuitBreakerOptions = {},
): (task: Task<T, E>) => Task<T, E> {
  const threshold = options.threshold ?? 5
  const cooldown = options.halfOpenAfter ?? 10_000

  let state: State = 'closed'
  let failures = 0
  let openedAt = 0

  return (task) => async (signal) => {
    if (state === 'open') {
      if (Date.now() - openedAt >= cooldown) {
        state = 'half-open'
      } else {
        return err<E, T>(new CircuitOpenError() as E)
      }
    }

    const res: Result<T, E> = await task(signal)

    if (res.isOk()) {
      failures = 0
      state = 'closed'
      return res
    }

    failures++
    if (state === 'half-open' || failures >= threshold) {
      state = 'open'
      openedAt = Date.now()
      failures = 0
      options.onOpen?.()
    }
    return res
  }
}
