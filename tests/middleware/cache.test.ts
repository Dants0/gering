import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task } from '../../src/core/task.js'

describe('withCache (.cache)', () => {
  it('memoiza o Ok dentro do TTL', async () => {
    let calls = 0
    const cached = task(async () => {
      calls++
      return calls
    }).cache({ ttl: 1000, key: 'x' })

    assert.equal(await cached.unwrap(), 1)
    assert.equal(await cached.unwrap(), 1)
    assert.equal(calls, 1)
  })

  it('não cacheia Err — sempre reexecuta', async () => {
    let calls = 0
    const cached = task<number>(async () => {
      calls++
      throw new Error('falha')
    }).cache({ ttl: 1000, key: 'y' })

    await cached.run()
    await cached.run()
    assert.equal(calls, 2)
  })

  it('reexecuta após o TTL expirar', async () => {
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

  it('instâncias de .cache() diferentes têm stores isolados', async () => {
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
