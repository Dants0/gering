import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task, fromTask, asTask, TaskBuilder, AbortError } from '../src/core/task.js'
import { ok, err } from '../src/core/result.js'

describe('task() / TaskBuilder', () => {
  it('adapta uma função e captura o valor como Ok', async () => {
    const r = await task(async () => 10).run()
    assert.equal(r.unwrap(), 10)
  })

  it('captura exceções como Err', async () => {
    const r = await task(async () => {
      throw new Error('falhou')
    }).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'falhou')
  })

  it('signal já abortado vira AbortError sem chamar fn', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    let chamou = false
    const r = await task(async () => {
      chamou = true
      return 1
    }).run(ctrl.signal)
    assert.equal(chamou, false)
    assert.ok(r.unwrapErr() instanceof AbortError)
  })

  it('map / mapErr transformam o resultado', async () => {
    assert.equal(await task(async () => 2).map((n) => n * 5).unwrap(), 10)
    const e = await task<number>(async () => {
      throw new Error('x')
    })
      .mapErr((err) => err.message.toUpperCase())
      .run()
    assert.equal(e.unwrapErr(), 'X')
  })

  it('andThen encadeia outro Task e faz short-circuit em Err', async () => {
    const okChain = await task(async () => 3)
      .andThen((n) => async () => ok<number>(n + 1))
      .unwrap()
    assert.equal(okChain, 4)

    let segundoRodou = false
    const r = await task<number>(async () => {
      throw new Error('primeiro')
    })
      .andThen((n) => async () => {
        segundoRodou = true
        return ok<number>(n)
      })
      .run()
    assert.equal(segundoRodou, false)
    assert.equal(r.isErr(), true)
  })

  it('recover encadeia recuperação só em Err', async () => {
    const r = await task<number>(async () => {
      throw new Error('falha')
    })
      .recover(() => async () => ok<number>(42))
      .unwrap()
    assert.equal(r, 42)

    const semRecover = await task(async () => 1)
      .recover(() => async () => ok<number>(99))
      .unwrap()
    assert.equal(semRecover, 1)
  })

  it('unwrap lança quando o pipeline é Err', async () => {
    await assert.rejects(
      task(async () => {
        throw new Error('boom')
      }).unwrap(),
      /boom/,
    )
  })

  it('cada método devolve um novo builder (imutável)', () => {
    const base = task(async () => 1)
    const derivado = base.map((n) => n)
    assert.notEqual(base, derivado)
    assert.ok(derivado instanceof TaskBuilder)
  })
})

describe('asTask / fromTask', () => {
  it('asTask normaliza um builder para Task', async () => {
    const t = asTask(task(async () => 7))
    const r = await t()
    assert.equal(r.unwrap(), 7)
  })

  it('asTask deixa um Task cru passar', async () => {
    const raw = async () => ok<number>(8)
    assert.equal(asTask(raw), raw)
  })

  it('fromTask embrulha um Task canônico', async () => {
    const r = await fromTask(async () => err<string, number>('e')).run()
    assert.equal(r.unwrapErr(), 'e')
  })
})
