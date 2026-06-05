import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pipe } from '../../src/combinators/pipe.js'
import { task } from '../../src/core/task.js'

describe('pipe', () => {
  it('passa o valor de um passo para o próximo', async () => {
    const out = await pipe(
      task(async () => 2),
      (n) => task(async () => n * 10),
      (n) => task(async () => `valor=${n}`),
    ).unwrap()
    assert.equal(out, 'valor=20')
  })

  it('um único elemento se comporta como o próprio task', async () => {
    const out = await pipe(task(async () => 'só')).unwrap()
    assert.equal(out, 'só')
  })

  it('short-circuit no primeiro Err (passos seguintes não rodam)', async () => {
    let terceiroRodou = false
    const r = await pipe(
      task(async () => 1),
      () =>
        task<number>(async () => {
          throw new Error('passo 2')
        }),
      (n) =>
        task(async () => {
          terceiroRodou = true
          return n
        }),
    ).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'passo 2')
    assert.equal(terceiroRodou, false)
  })
})
