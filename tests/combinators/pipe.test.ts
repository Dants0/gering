import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pipe } from '../../src/combinators/pipe.js'
import { task } from '../../src/core/task.js'

describe('pipe', () => {
  it('passes the value from one step to the next', async () => {
    const out = await pipe(
      task(async () => 2),
      (n) => task(async () => n * 10),
      (n) => task(async () => `value=${n}`),
    ).unwrap()
    assert.equal(out, 'value=20')
  })

  it('a single element behaves like the task itself', async () => {
    const out = await pipe(task(async () => 'only')).unwrap()
    assert.equal(out, 'only')
  })

  it('short-circuits on the first Err (following steps do not run)', async () => {
    let thirdRan = false
    const r = await pipe(
      task(async () => 1),
      () =>
        task<number>(async () => {
          throw new Error('step 2')
        }),
      (n) =>
        task(async () => {
          thirdRan = true
          return n
        }),
    ).run()
    assert.equal(r.isErr(), true)
    assert.equal(r.unwrapErr().message, 'step 2')
    assert.equal(thirdRan, false)
  })
})
