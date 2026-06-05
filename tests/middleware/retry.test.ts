import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry } from '../../src/middleware/retry.js'
import { task, AbortError } from '../../src/core/task.js'
import { ok, err } from '../../src/core/result.js'

describe('withRetry', () => {
  it('repete até obter Ok', async () => {
    let calls = 0
    const value = await task(async () => {
      calls++
      if (calls < 3) throw new Error('ainda não')
      return 'pronto'
    })
      .retry({ attempts: 5, delay: 1 })
      .unwrap()
    assert.equal(value, 'pronto')
    assert.equal(calls, 3)
  })

  it('esgota as tentativas e devolve o último Err', async () => {
    let calls = 0
    const r = await task<string>(async () => {
      calls++
      throw new Error(`falha ${calls}`)
    })
      .retry({ attempts: 3, delay: 1 })
      .run()
    assert.equal(calls, 3)
    assert.equal(r.unwrapErr().message, 'falha 3')
  })

  it('aceita número como atalho para attempts', async () => {
    let calls = 0
    await task<string>(async () => {
      calls++
      throw new Error('x')
    })
      .retry(2)
      .run()
    assert.equal(calls, 2)
  })

  it('não repete quando já é Ok de primeira', async () => {
    let calls = 0
    await task(async () => {
      calls++
      return 1
    })
      .retry({ attempts: 5, delay: 1 })
      .unwrap()
    assert.equal(calls, 1)
  })

  it('backoff exponencial cresce entre tentativas', async () => {
    const start = Date.now()
    let calls = 0
    await task<string>(async () => {
      calls++
      throw new Error('x')
    })
      .retry({ attempts: 3, delay: 20, backoff: 'exponential' })
      .run()
    // esperas: 20 (2^0) + 40 (2^1) = ~60ms
    const elapsed = Date.now() - start
    assert.ok(elapsed >= 55, `elapsed ${elapsed}ms deveria ser >= 55`)
  })

  it('aborta entre tentativas via signal', async () => {
    const ctrl = new AbortController()
    let calls = 0
    const p = task<string>(async () => {
      calls++
      if (calls === 1) ctrl.abort()
      throw new Error('falha')
    })
      .retry({ attempts: 5, delay: 50 })
      .run(ctrl.signal)
    const r = await p
    assert.ok(r.unwrapErr() instanceof AbortError)
    assert.equal(calls, 1)
  })

  it('withRetry também funciona como middleware standalone (Task -> Task)', async () => {
    let calls = 0
    // Task cru segue o contrato: devolve Err, não lança.
    const wrapped = withRetry<number, Error>(3)(async () => {
      calls++
      return calls < 2 ? err<Error, number>(new Error('x')) : ok<number>(calls)
    })
    const r = await wrapped()
    assert.equal(r.unwrap(), 2)
    assert.equal(calls, 2)
  })
})
