import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parallel } from '../../src/combinators/parallel.js'
import { task } from '../../src/core/task.js'

describe('parallel', () => {
  it('preserva ordem e tipos da tupla', async () => {
    const [a, b, c] = await parallel([
      task(async () => 1),
      task(async () => 'dois'),
      task(async () => true),
    ]).unwrap()
    assert.equal(a.unwrap(), 1)
    assert.equal(b.unwrap(), 'dois')
    assert.equal(c.unwrap(), true)
  })

  it('não faz short-circuit: falha isolada não derruba vizinhas', async () => {
    const [a, b, c] = await parallel([
      task(async () => 1),
      task(async () => {
        throw new Error('meio falhou')
      }),
      task(async () => 3),
    ]).unwrap()
    assert.equal(a.unwrap(), 1)
    assert.equal(b.isErr(), true)
    assert.equal(c.unwrap(), 3)
  })

  it('roda tudo de uma vez por padrão', async () => {
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

  it('concurrency limita execução simultânea preservando ordem', async () => {
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
    assert.ok(peak <= 2, `peak ${peak} deveria ser <= 2`)
    assert.deepEqual(
      results.map((r) => r.unwrap()),
      [0, 1, 2, 3, 4],
    )
  })

  it('array vazio resolve para tupla vazia', async () => {
    const r = await parallel([]).unwrap()
    assert.deepEqual(r, [])
  })
})
