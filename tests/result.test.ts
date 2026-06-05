import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ok, err, fromPromise, Ok, Err } from '../src/core/result.js'

describe('Result', () => {
  it('ok cria um Ok e err cria um Err', () => {
    assert.ok(ok(1) instanceof Ok)
    assert.ok(err('x') instanceof Err)
    assert.equal(ok(1).ok, true)
    assert.equal(err('x').ok, false)
  })

  it('isOk / isErr estreitam corretamente', () => {
    const r = ok<number>(1)
    assert.equal(r.isOk(), true)
    assert.equal(r.isErr(), false)
    if (r.isOk()) assert.equal(r.value, 1) // narrowing
  })

  it('map transforma Ok e é no-op em Err', () => {
    assert.equal(ok(2).map((n) => n + 1).unwrap(), 3)
    const e = err<string, number>('boom').map((n) => n + 1)
    assert.equal(e.isErr(), true)
    assert.equal(e.unwrapErr(), 'boom')
  })

  it('mapErr transforma Err e é no-op em Ok', () => {
    assert.equal(err<string>('boom').mapErr((m) => m.length).unwrapErr(), 4)
    assert.equal(ok<number, string>(5).mapErr((m) => m.length).unwrap(), 5)
  })

  it('andThen encadeia (flatMap) e propaga Err', () => {
    assert.equal(ok(2).andThen((n) => ok(n * 10)).unwrap(), 20)
    assert.equal(
      ok<number, string>(2)
        .andThen(() => err<string, number>('fail'))
        .unwrapErr(),
      'fail',
    )
    assert.equal(
      err<string, number>('e')
        .andThen((n) => ok<number, string>(n))
        .unwrapErr(),
      'e',
    )
  })

  it('orElse recupera de Err e é no-op em Ok', () => {
    assert.equal(err<string, number>('e').orElse(() => ok<number, string>(9)).unwrap(), 9)
    assert.equal(ok<number, string>(1).orElse(() => ok<number, string>(9)).unwrap(), 1)
  })

  it('unwrap lança em Err preservando o Error original', () => {
    const original = new Error('explodiu')
    assert.throws(() => err(original).unwrap(), original)
  })

  it('unwrap embrulha erro não-Error', () => {
    assert.throws(() => err('string-erro').unwrap(), /string-erro/)
  })

  it('unwrapOr devolve fallback só em Err', () => {
    assert.equal(ok<number>(1).unwrapOr(99), 1)
    assert.equal(err<string, number>('e').unwrapOr(99), 99)
  })

  it('unwrapErr lança em Ok', () => {
    assert.throws(() => ok(1).unwrapErr(), /unwrapErr/)
  })

  it('match escolhe o braço certo', () => {
    assert.equal(ok<number>(2).match({ ok: (n) => n * 2, err: () => -1 }), 4)
    assert.equal(err<string, number>('e').match({ ok: (n) => n, err: (m) => m.length }), 1)
  })

  describe('fromPromise', () => {
    it('resolve vira Ok', async () => {
      const r = await fromPromise(Promise.resolve(42))
      assert.equal(r.unwrap(), 42)
    })

    it('reject vira Err', async () => {
      const r = await fromPromise(Promise.reject(new Error('x')))
      assert.equal(r.isErr(), true)
    })

    it('onError mapeia a causa', async () => {
      const r = await fromPromise(Promise.reject(new Error('x')), (c) => (c as Error).message)
      assert.equal(r.unwrapErr(), 'x')
    })
  })
})
