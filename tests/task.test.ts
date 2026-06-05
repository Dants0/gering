import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { task, fromTask, asTask, TaskBuilder, AbortError } from '../src/core/task.js'
import { ok, err } from '../src/core/result.js'

describe('task() / TaskBuilder', () => {
  it('adapts a function and captures the value as Ok', async () => {
    const r = await task(async () => 10).run()
    assert.equal(r.unwrap(), 10)
  })

  it('captures exceptions as Err', async () => {
    const r = await task(async () => {
      throw new Error('failed')
    }).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'failed')
  })

  it('an already-aborted signal becomes AbortError without calling fn', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    let called = false
    const r = await task(async () => {
      called = true
      return 1
    }).run(ctrl.signal)
    assert.equal(called, false)
    assert.ok(r.unwrapErr() instanceof AbortError)
  })

  it('map / mapErr transform the result', async () => {
    assert.equal(await task(async () => 2).map((n) => n * 5).unwrap(), 10)
    const e = await task<number>(async () => {
      throw new Error('x')
    })
      .mapErr((err) => err.message.toUpperCase())
      .run()
    assert.equal(e.unwrapErr(), 'X')
  })

  it('andThen chains another Task and short-circuits on Err', async () => {
    const okChain = await task(async () => 3)
      .andThen((n) => async () => ok<number>(n + 1))
      .unwrap()
    assert.equal(okChain, 4)

    let secondRan = false
    const r = await task<number>(async () => {
      throw new Error('first')
    })
      .andThen((n) => async () => {
        secondRan = true
        return ok<number>(n)
      })
      .run()
    assert.equal(secondRan, false)
    assert.equal(r.isErr(), true)
  })

  it('recover chains recovery only on Err', async () => {
    const r = await task<number>(async () => {
      throw new Error('failure')
    })
      .recover(() => async () => ok<number>(42))
      .unwrap()
    assert.equal(r, 42)

    const withoutRecover = await task(async () => 1)
      .recover(() => async () => ok<number>(99))
      .unwrap()
    assert.equal(withoutRecover, 1)
  })

  it('unwrap throws when the pipeline is Err', async () => {
    await assert.rejects(
      task(async () => {
        throw new Error('boom')
      }).unwrap(),
      /boom/,
    )
  })

  it('each method returns a new builder (immutable)', () => {
    const base = task(async () => 1)
    const derived = base.map((n) => n)
    assert.notEqual(base, derived)
    assert.ok(derived instanceof TaskBuilder)
  })
})

describe('asTask / fromTask', () => {
  it('asTask normalizes a builder into a Task', async () => {
    const t = asTask(task(async () => 7))
    const r = await t()
    assert.equal(r.unwrap(), 7)
  })

  it('asTask lets a raw Task pass through', async () => {
    const raw = async () => ok<number>(8)
    assert.equal(asTask(raw), raw)
  })

  it('fromTask wraps a canonical Task', async () => {
    const r = await fromTask(async () => err<string, number>('e')).run()
    assert.equal(r.unwrapErr(), 'e')
  })
})
