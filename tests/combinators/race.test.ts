import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { race } from '../../src/combinators/race.js'
import { task } from '../../src/core/task.js'

describe('race', () => {
  it('o mais rápido vence', async () => {
    const value = await race([
      task(async () => {
        await new Promise((r) => setTimeout(r, 50))
        return 'lento'
      }),
      task(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'rápido'
      }),
    ]).unwrap()
    assert.equal(value, 'rápido')
  })

  it('um Err rápido vence um Ok lento (vence por velocidade, não sucesso)', async () => {
    const r = await race([
      task<string>(async () => {
        await new Promise((_r, rej) => setTimeout(() => rej(new Error('rápido-erro')), 5))
        return 'nunca'
      }),
      task(async () => {
        await new Promise((r) => setTimeout(r, 50))
        return 'lento-ok'
      }),
    ]).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'rápido-erro')
  })

  it('cancela os perdedores via signal', async () => {
    let perdedorAbortado = false
    await race([
      task(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return 'vencedor'
      }),
      task(
        (signal) =>
          new Promise<string>((resolve) => {
            const id = setTimeout(() => resolve('perdedor'), 100)
            signal?.addEventListener('abort', () => {
              clearTimeout(id)
              perdedorAbortado = true
            })
          }),
      ),
    ]).unwrap()
    // dá um tick para o abort propagar
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(perdedorAbortado, true)
  })

  it('lança em array vazio', () => {
    assert.throws(() => race([]), /ao menos um/)
  })
})
