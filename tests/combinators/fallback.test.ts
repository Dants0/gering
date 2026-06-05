import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fallback } from '../../src/combinators/fallback.js'
import { task } from '../../src/core/task.js'

describe('fallback', () => {
  it('devolve o primeiro Ok e para (short-circuit)', async () => {
    let cacheRodou = false
    const value = await fallback([
      task<string>(async () => {
        throw new Error('primário fora')
      }),
      task(async () => 'do secundário'),
      task(async () => {
        cacheRodou = true
        return 'do cache'
      }),
    ]).unwrap()
    assert.equal(value, 'do secundário')
    assert.equal(cacheRodou, false)
  })

  it('o primeiro Ok já curto-circuita os demais', async () => {
    let segundoRodou = false
    const value = await fallback([
      task(async () => 'primário'),
      task(async () => {
        segundoRodou = true
        return 'secundário'
      }),
    ]).unwrap()
    assert.equal(value, 'primário')
    assert.equal(segundoRodou, false)
  })

  it('todos falham => último Err', async () => {
    const r = await fallback([
      task<string>(async () => {
        throw new Error('falha 1')
      }),
      task<string>(async () => {
        throw new Error('falha 2 final')
      }),
    ]).run()
    assert.equal(r.unwrapErr().message, 'falha 2 final')
  })

  it('lança em array vazio', () => {
    assert.throws(() => fallback([]), /ao menos um/)
  })
})
