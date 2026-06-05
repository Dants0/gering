import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task } from '../../src/core/task.js'
import { CircuitOpenError } from '../../src/middleware/circuit-breaker.js'

describe('withCircuitBreaker (.circuitBreaker)', () => {
  it('abre após threshold falhas e passa a falhar rápido', async () => {
    let calls = 0
    const flaky = task<string>(async () => {
      calls++
      throw new Error('fora')
    }).circuitBreaker({ threshold: 2, halfOpenAfter: 10_000 })

    await flaky.run() // falha 1
    await flaky.run() // falha 2 -> abre
    const r = await flaky.run() // aberto: fail-fast

    assert.equal(calls, 2, 'aberto não deve chamar o serviço')
    assert.ok(r.unwrapErr() instanceof CircuitOpenError)
  })

  it('dispara onOpen quando abre', async () => {
    let abriu = false
    const flaky = task<string>(async () => {
      throw new Error('fora')
    }).circuitBreaker({ threshold: 1, halfOpenAfter: 10_000, onOpen: () => (abriu = true) })

    await flaky.run()
    assert.equal(abriu, true)
  })

  it('sucesso reseta o contador de falhas (não abre)', async () => {
    let calls = 0
    const svc = task<number>(async () => {
      calls++
      if (calls === 2) return 1 // sucesso no meio
      throw new Error('fora')
    }).circuitBreaker({ threshold: 2, halfOpenAfter: 10_000 })

    await svc.run() // falha (1)
    await svc.run() // sucesso -> reseta
    await svc.run() // falha (1 de novo, não abre)
    const r = await svc.run() // ainda chama (não fail-fast)
    assert.equal(calls, 4)
    assert.equal(r.unwrapErr().message, 'fora')
  })

  it('half-open após cooldown: fecha se a tentativa vingar', async () => {
    let modoFalha = true
    let calls = 0
    const svc = task<string>(async () => {
      calls++
      if (modoFalha) throw new Error('fora')
      return 'recuperado'
    }).circuitBreaker({ threshold: 1, halfOpenAfter: 20 })

    await svc.run() // falha -> abre
    const fechado = await svc.run() // aberto -> fail-fast
    assert.ok(fechado.unwrapErr() instanceof CircuitOpenError)

    await new Promise((r) => setTimeout(r, 30)) // espera cooldown
    modoFalha = false
    const r = await svc.run() // half-open -> tenta -> sucesso -> fecha
    assert.equal(r.unwrap(), 'recuperado')
  })

  it('half-open: se a tentativa falha, reabre', async () => {
    let calls = 0
    const svc = task<string>(async () => {
      calls++
      throw new Error('fora')
    }).circuitBreaker({ threshold: 1, halfOpenAfter: 20 })

    await svc.run() // falha -> abre
    await new Promise((r) => setTimeout(r, 30))
    const callsAntes = calls
    await svc.run() // half-open -> tenta (chama) -> falha -> reabre
    assert.equal(calls, callsAntes + 1)
    const r = await svc.run() // aberto de novo -> fail-fast
    assert.ok(r.unwrapErr() instanceof CircuitOpenError)
  })
})
