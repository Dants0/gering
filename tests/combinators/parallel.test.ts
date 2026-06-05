import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parallel } from '../../src/combinators/parallel.js'
import { task } from '../../src/core/task.js'

describe('parallel', () => {
  it('preserves tuple order and types', async () => {
    const [a, b, c] = await parallel([
      task(async () => 1),
      task(async () => 'two'),
      task(async () => true),
    ]).unwrap()
    assert.equal(a.unwrap(), 1)
    assert.equal(b.unwrap(), 'two')
    assert.equal(c.unwrap(), true)
  })

  it('does not short-circuit: an isolated failure does not take neighbors down', async () => {
    const [a, b, c] = await parallel([
      task(async () => 1),
      task(async () => {
        throw new Error('middle failed')
      }),
      task(async () => 3),
    ]).unwrap()
    assert.equal(a.unwrap(), 1)
    assert.equal(b.isErr(), true)
    assert.equal(c.unwrap(), 3)
  })

  it('runs everything at once by default', async () => {
    let running = 0
    let peak = 0
    const make = () =>
      task(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 10))
        running--
        return true
      })
    await parallel([make(), make(), make(), make()]).unwrap()
    assert.equal(peak, 4)
  })

  it('concurrency caps simultaneous execution while preserving order', async () => {
    let running = 0
    let peak = 0
    const make = (n: number) =>
      task(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 10))
        running--
        return n
      })
    const results = await parallel([make(0), make(1), make(2), make(3), make(4)], {
      concurrency: 2,
    }).unwrap()
    assert.ok(peak <= 2, `peak ${peak} should be <= 2`)
    assert.deepEqual(
      results.map((r) => r.unwrap()),
      [0, 1, 2, 3, 4],
    )
  })

  it('empty array resolves to an empty tuple', async () => {
    const r = await parallel([]).unwrap()
    assert.deepEqual(r, [])
  })
})
