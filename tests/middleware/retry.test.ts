import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry } from '../../src/middleware/retry.js'
import { task, AbortError } from '../../src/core/task.js'
import { ok, err } from '../../src/core/result.js'

describe('withRetry', () => {
  it('retries until it gets an Ok', async () => {
    let calls = 0
    const value = await task(async () => {
      calls++
      if (calls < 3) throw new Error('not yet')
      return 'done'
    })
      .retry({ attempts: 5, delay: 1 })
      .unwrap()
    assert.equal(value, 'done')
    assert.equal(calls, 3)
  })

  it('exhausts the attempts and returns the last Err', async () => {
    let calls = 0
    const r = await task<string>(async () => {
      calls++
      throw new Error(`failure ${calls}`)
    })
      .retry({ attempts: 3, delay: 1 })
      .run()
    assert.equal(calls, 3)
    assert.equal(r.unwrapErr().message, 'failure 3')
  })

  it('accepts a number as a shortcut for attempts', async () => {
    let calls = 0
    await task<string>(async () => {
      calls++
      throw new Error('x')
    })
      .retry(2)
      .run()
    assert.equal(calls, 2)
  })

  it('does not retry when it is Ok on the first try', async () => {
    let calls = 0
    await task(async () => {
      calls++
      return 1
    })
      .retry({ attempts: 5, delay: 1 })
      .unwrap()
    assert.equal(calls, 1)
  })

  it('exponential backoff grows between attempts', async () => {
    const start = Date.now()
    let calls = 0
    await task<string>(async () => {
      calls++
      throw new Error('x')
    })
      .retry({ attempts: 3, delay: 20, backoff: 'exponential' })
      .run()
    // waits: 20 (2^0) + 40 (2^1) = ~60ms
    const elapsed = Date.now() - start
    assert.ok(elapsed >= 55, `elapsed ${elapsed}ms should be >= 55`)
  })

  it('aborts between attempts via signal', async () => {
    const ctrl = new AbortController()
    let calls = 0
    const p = task<string>(async () => {
      calls++
      if (calls === 1) ctrl.abort()
      throw new Error('failure')
    })
      .retry({ attempts: 5, delay: 50 })
      .run(ctrl.signal)
    const r = await p
    assert.ok(r.unwrapErr() instanceof AbortError)
    assert.equal(calls, 1)
  })

  it('withRetry also works as a standalone middleware (Task -> Task)', async () => {
    let calls = 0
    // A raw Task follows the contract: returns Err, does not throw.
    const wrapped = withRetry<number, Error>(3)(async () => {
      calls++
      return calls < 2 ? err<Error, number>(new Error('x')) : ok<number>(calls)
    })
    const r = await wrapped()
    assert.equal(r.unwrap(), 2)
    assert.equal(calls, 2)
  })
})
