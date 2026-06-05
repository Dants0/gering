import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task } from '../../src/core/task.js'

/** Task que respeita o signal: rejeita ao ser abortado. */
const slow = (ms: number) =>
  task(
    (signal) =>
      new Promise<string>((resolve, reject) => {
        const id = setTimeout(() => resolve('terminou'), ms)
        signal?.addEventListener('abort', () => {
          clearTimeout(id)
          reject(new Error('abortado'))
        })
      }),
  )

describe('withTimeout (.timeout)', () => {
  it('aborta a task que estoura o tempo', async () => {
    const r = await slow(1000).timeout(20).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'abortado')
  })

  it('deixa passar a task que termina a tempo', async () => {
    const r = await slow(5).timeout(1000).run()
    assert.equal(r.unwrap(), 'terminou')
  })

  it('o signal externo também aborta (encadeado)', async () => {
    const ctrl = new AbortController()
    const p = slow(1000).timeout(5000).run(ctrl.signal)
    ctrl.abort()
    const r = await p
    assert.equal(r.unwrapErr().message, 'abortado')
  })

  it('não vaza: sucesso limpa o timer', async () => {
    // se o timer não fosse limpo, um abort tardio quebraria; aqui só garantimos
    // que múltiplas execuções rápidas sob timeout resolvem normalmente
    const results = await Promise.all([
      slow(2).timeout(1000).unwrap(),
      slow(2).timeout(1000).unwrap(),
      slow(2).timeout(1000).unwrap(),
    ])
    assert.deepEqual(results, ['terminou', 'terminou', 'terminou'])
  })
})
