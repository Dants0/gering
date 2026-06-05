import assert from 'node:assert/strict'
import { ok, err, fromPromise } from '../src/core/result.js'
import { task } from '../src/core/task.js'
import { parallel } from '../src/combinators/parallel.js'
import { fallback } from '../src/combinators/fallback.js'
import { pipe } from '../src/combinators/pipe.js'
import { race } from '../src/combinators/race.js'
import { CircuitOpenError } from '../src/middleware/circuit-breaker.js'

async function main() {
// --- Result: map / unwrap / match ---
{
  const r = ok<number>(2).map((n) => n + 1)
  assert.equal(r.unwrap(), 3)

  const e = err<string, number>('boom').map((n) => n + 1)
  assert.equal(e.isErr(), true)
  assert.equal(e.unwrapOr(99), 99)

  const label = e.match({ ok: () => 'ok', err: (m) => `err:${m}` })
  assert.equal(label, 'err:boom')
}

// --- fromPromise captura throw ---
{
  const r = await fromPromise(Promise.reject(new Error('x')))
  assert.equal(r.isErr(), true)
}

// --- TaskBuilder fluente: map + run ---
{
  const r = await task(async () => 10)
    .map((n) => n * 2)
    .run()
  assert.equal(r.unwrap(), 20)
}

// --- task captura exceção como Err ---
{
  const r = await task(async () => {
    throw new Error('falhou')
  }).run()
  assert.equal(r.isErr(), true)
}

// --- retry: tenta de novo até dar Ok ---
{
  let calls = 0
  const value = await task(async () => {
    calls++
    if (calls < 3) throw new Error('ainda nao')
    return 'pronto'
  })
    .retry({ attempts: 5, delay: 1 })
    .unwrap()
  assert.equal(value, 'pronto')
  assert.equal(calls, 3)
}

// --- timeout: cancela via signal ---
{
  const r = await task(
    (signal) =>
      new Promise<string>((resolve, reject) => {
        const id = setTimeout(() => resolve('tarde demais'), 1000)
        signal?.addEventListener('abort', () => {
          clearTimeout(id)
          reject(new Error('abortado'))
        })
      }),
  )
    .timeout(20)
    .run()
  assert.equal(r.isErr(), true)
}

// --- parallel: tupla tipada, sem short-circuit ---
{
  const [a, b, c] = await parallel([
    task(async () => 1),
    task(async () => 'dois'),
    task(async () => {
      throw new Error('falha do terceiro')
    }),
  ]).unwrap()

  // tipos: a => Result<number,_>, b => Result<string,_>, c => Result<never,_>
  assert.equal(a.unwrap(), 1)
  assert.equal(b.unwrap(), 'dois')
  assert.equal(c.isErr(), true) // falha isolada não derruba os vizinhos
}

// --- parallel: concurrency limita execução simultânea ---
{
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

  await parallel([make(), make(), make(), make(), make()], { concurrency: 2 }).unwrap()
  assert.ok(peak <= 2, `peak de concorrência foi ${peak}, esperado <= 2`)
}

// --- fallback: primeiro Ok vence, resto nem roda ---
{
  let secondaryRan = false
  const value = await fallback([
    task(async () => {
      throw new Error('primario fora do ar')
    }),
    task(async () => 'do secundario'),
    task(async () => {
      secondaryRan = true // não deve rodar — short-circuit antes
      return 'do cache'
    }),
  ]).unwrap()

  assert.equal(value, 'do secundario')
  assert.equal(secondaryRan, false, 'fallback deve parar no primeiro Ok')
}

// --- fallback: todos falham => último Err ---
{
  const r = await fallback([
    task(async () => {
      throw new Error('falha 1')
    }),
    task<string>(async () => {
      throw new Error('falha 2 (ultima)')
    }),
  ]).run()

  assert.equal(r.isErr(), true)
  assert.equal(r.unwrapErr().message, 'falha 2 (ultima)')
}

// --- pipe: passagem de valor encadeada, tipos casam passo a passo ---
{
  const out = await pipe(
    task(async () => 2),
    (n) => task(async () => n * 10), // n: number -> 20
    (n) => task(async () => `valor=${n}`), // n: number -> string
  ).unwrap()

  assert.equal(out, 'valor=20')
}

// --- pipe: short-circuit no primeiro Err (passos seguintes não rodam) ---
{
  let thirdRan = false
  const r = await pipe(
    task(async () => 1),
    (_n) =>
      task<number>(async () => {
        throw new Error('passo 2 falhou')
      }),
    (n) =>
      task(async () => {
        thirdRan = true
        return n + 1
      }),
  ).run()

  assert.equal(r.isErr(), true)
  assert.equal(r.unwrapErr().message, 'passo 2 falhou')
  assert.equal(thirdRan, false, 'pipe deve parar no primeiro Err')
}

// --- race: o mais rápido vence ---
{
  const value = await race([
    task(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return 'lento'
    }),
    task(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return 'rapido'
    }),
  ]).unwrap()

  assert.equal(value, 'rapido')
}

// --- cache: segunda chamada não reexecuta dentro do TTL ---
{
  let calls = 0
  const cached = task(async () => {
    calls++
    return calls
  }).cache({ ttl: 1000, key: 'x' })

  const a = await cached.unwrap()
  const b = await cached.unwrap()
  assert.equal(a, 1)
  assert.equal(b, 1, 'segunda chamada deve vir do cache')
  assert.equal(calls, 1)
}

// --- circuit breaker: abre após threshold e falha rápido ---
{
  let calls = 0
  const flaky = task<string>(async () => {
    calls++
    throw new Error('serviço fora')
  }).circuitBreaker({ threshold: 2, halfOpenAfter: 10_000 })

  await flaky.run() // falha 1
  await flaky.run() // falha 2 -> abre
  const r = await flaky.run() // circuito aberto: fail-fast, não chama o serviço

  assert.equal(calls, 2, 'circuito aberto não deve chamar o serviço')
  assert.equal(r.isErr(), true)
  assert.ok(r.unwrapErr() instanceof CircuitOpenError)
}

// --- timeout/retry continuam funcionando após extração para middleware ---
{
  let attempts = 0
  const value = await task(async () => {
    attempts++
    if (attempts < 2) throw new Error('retry me')
    return 'ok'
  })
    .retry({ attempts: 3, delay: 1 })
    .timeout(1000)
    .unwrap()
  assert.equal(value, 'ok')
  assert.equal(attempts, 2)
}

console.log('OK — todos os smoke tests passaram')
}

main()
