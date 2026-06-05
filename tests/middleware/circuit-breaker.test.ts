import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task } from '../../src/core/task.js'
import { CircuitOpenError } from '../../src/middleware/circuit-breaker.js'

describe('withCircuitBreaker (.circuitBreaker)', () => {
  it('opens after threshold failures and starts failing fast', async () => {
    let calls = 0
    const flaky = task<string>(async () => {
      calls++
      throw new Error('down')
    }).circuitBreaker({ threshold: 2, halfOpenAfter: 10_000 })

    await flaky.run() // failure 1
    await flaky.run() // failure 2 -> opens
    const r = await flaky.run() // open: fail-fast

    assert.equal(calls, 2, 'open should not call the service')
    assert.ok(r.unwrapErr() instanceof CircuitOpenError)
  })

  it('fires onOpen when it opens', async () => {
    let opened = false
    const flaky = task<string>(async () => {
      throw new Error('down')
    }).circuitBreaker({ threshold: 1, halfOpenAfter: 10_000, onOpen: () => (opened = true) })

    await flaky.run()
    assert.equal(opened, true)
  })

  it('success resets the failure counter (does not open)', async () => {
    let calls = 0
    const svc = task<number>(async () => {
      calls++
      if (calls === 2) return 1 // success in the middle
      throw new Error('down')
    }).circuitBreaker({ threshold: 2, halfOpenAfter: 10_000 })

    await svc.run() // failure (1)
    await svc.run() // success -> reset
    await svc.run() // failure (1 again, does not open)
    const r = await svc.run() // still calls (not fail-fast)
    assert.equal(calls, 4)
    assert.equal(r.unwrapErr().message, 'down')
  })

  it('half-open after cooldown: closes if the attempt succeeds', async () => {
    let failMode = true
    let calls = 0
    const svc = task<string>(async () => {
      calls++
      if (failMode) throw new Error('down')
      return 'recovered'
    }).circuitBreaker({ threshold: 1, halfOpenAfter: 20 })

    await svc.run() // failure -> opens
    const closed = await svc.run() // open -> fail-fast
    assert.ok(closed.unwrapErr() instanceof CircuitOpenError)

    await new Promise((r) => setTimeout(r, 30)) // wait for cooldown
    failMode = false
    const r = await svc.run() // half-open -> tries -> success -> closes
    assert.equal(r.unwrap(), 'recovered')
  })

  it('half-open: if the attempt fails, it reopens', async () => {
    let calls = 0
    const svc = task<string>(async () => {
      calls++
      throw new Error('down')
    }).circuitBreaker({ threshold: 1, halfOpenAfter: 20 })

    await svc.run() // failure -> opens
    await new Promise((r) => setTimeout(r, 30))
    const callsBefore = calls
    await svc.run() // half-open -> tries (calls) -> fails -> reopens
    assert.equal(calls, callsBefore + 1)
    const r = await svc.run() // open again -> fail-fast
    assert.ok(r.unwrapErr() instanceof CircuitOpenError)
  })
})
