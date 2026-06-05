import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task } from '../../src/core/task.js'

describe('withCache (.cache)', () => {
  it('memoizes the Ok within the TTL', async () => {
    let calls = 0
    const cached = task(async () => {
      calls++
      return calls
    }).cache({ ttl: 1000, key: 'x' })

    assert.equal(await cached.unwrap(), 1)
    assert.equal(await cached.unwrap(), 1)
    assert.equal(calls, 1)
  })

  it('does not cache Err — always re-runs', async () => {
    let calls = 0
    const cached = task<number>(async () => {
      calls++
      throw new Error('failure')
    }).cache({ ttl: 1000, key: 'y' })

    await cached.run()
    await cached.run()
    assert.equal(calls, 2)
  })

  it('re-runs after the TTL expires', async () => {
    let calls = 0
    const cached = task(async () => {
      calls++
      return calls
    }).cache({ ttl: 15, key: 'z' })

    assert.equal(await cached.unwrap(), 1)
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(await cached.unwrap(), 2)
    assert.equal(calls, 2)
  })

  it('different .cache() instances have isolated stores', async () => {
    let a = 0
    let b = 0
    const ca = task(async () => ++a).cache({ ttl: 1000 })
    const cb = task(async () => ++b).cache({ ttl: 1000 })

    await ca.unwrap()
    await ca.unwrap()
    await cb.unwrap()

    assert.equal(a, 1)
    assert.equal(b, 1)
  })
})
