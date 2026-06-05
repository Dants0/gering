import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task } from '../../src/core/task.js'

/** Task that respects the signal: rejects when aborted. */
const slow = (ms: number) =>
  task(
    (signal) =>
      new Promise<string>((resolve, reject) => {
        const id = setTimeout(() => resolve('finished'), ms)
        signal?.addEventListener('abort', () => {
          clearTimeout(id)
          reject(new Error('aborted'))
        })
      }),
  )

describe('withTimeout (.timeout)', () => {
  it('aborts the task that runs out of time', async () => {
    const r = await slow(1000).timeout(20).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'aborted')
  })

  it('lets the task that finishes in time pass through', async () => {
    const r = await slow(5).timeout(1000).run()
    assert.equal(r.unwrap(), 'finished')
  })

  it('the external signal also aborts (chained)', async () => {
    const ctrl = new AbortController()
    const p = slow(1000).timeout(5000).run(ctrl.signal)
    ctrl.abort()
    const r = await p
    assert.equal(r.unwrapErr().message, 'aborted')
  })

  it('does not leak: success clears the timer', async () => {
    // if the timer weren't cleared, a late abort would break things; here we just
    // ensure multiple fast executions under timeout resolve normally
    const results = await Promise.all([
      slow(2).timeout(1000).unwrap(),
      slow(2).timeout(1000).unwrap(),
      slow(2).timeout(1000).unwrap(),
    ])
    assert.deepEqual(results, ['finished', 'finished', 'finished'])
  })
})
