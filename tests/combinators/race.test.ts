import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { race } from '../../src/combinators/race.js'
import { task } from '../../src/core/task.js'

describe('race', () => {
  it('the fastest one wins', async () => {
    const value = await race([
      task(async () => {
        await new Promise((r) => setTimeout(r, 50))
        return 'slow'
      }),
      task(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'fast'
      }),
    ]).unwrap()
    assert.equal(value, 'fast')
  })

  it('a fast Err beats a slow Ok (wins by speed, not success)', async () => {
    const r = await race([
      task<string>(async () => {
        await new Promise((_r, rej) => setTimeout(() => rej(new Error('fast-error')), 5))
        return 'never'
      }),
      task(async () => {
        await new Promise((r) => setTimeout(r, 50))
        return 'slow-ok'
      }),
    ]).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'fast-error')
  })

  it('cancels the losers via signal', async () => {
    let loserAborted = false
    await race([
      task(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'winner'
      }),
      task(
        (signal) =>
          new Promise<string>((resolve) => {
            const id = setTimeout(() => resolve('loser'), 100)
            signal?.addEventListener('abort', () => {
              clearTimeout(id)
              loserAborted = true
            })
          }),
      ),
    ]).unwrap()
    // give a tick for the abort to propagate
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(loserAborted, true)
  })

  it('throws on an empty array', () => {
    assert.throws(() => race([]), /at least one/)
  })
})
