import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fallback } from '../../src/combinators/fallback.js'
import { task } from '../../src/core/task.js'

describe('fallback', () => {
  it('returns the first Ok and stops (short-circuit)', async () => {
    let cacheRan = false
    const value = await fallback([
      task<string>(async () => {
        throw new Error('primary down')
      }),
      task(async () => 'from secondary'),
      task(async () => {
        cacheRan = true
        return 'from cache'
      }),
    ]).unwrap()
    assert.equal(value, 'from secondary')
    assert.equal(cacheRan, false)
  })

  it('the first Ok already short-circuits the rest', async () => {
    let secondRan = false
    const value = await fallback([
      task(async () => 'primary'),
      task(async () => {
        secondRan = true
        return 'secondary'
      }),
    ]).unwrap()
    assert.equal(value, 'primary')
    assert.equal(secondRan, false)
  })

  it('all fail => last Err', async () => {
    const r = await fallback([
      task<string>(async () => {
        throw new Error('failure 1')
      }),
      task<string>(async () => {
        throw new Error('failure 2 final')
      }),
    ]).run()
    assert.equal(r.unwrapErr().message, 'failure 2 final')
  })

  it('throws on an empty array', () => {
    assert.throws(() => fallback([]), /at least one/)
  })
})
