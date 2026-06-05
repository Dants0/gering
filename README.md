# Gering

Composição de chamadas a APIs externas para TypeScript/Node.js — **fan-out, cache, fallback, retry, timeout e circuit breaker** com uma API fluente e segura.

Gering resolve, de forma consistente, o que todo projeto reescreve do zero: orquestrar várias chamadas a serviços externos com resiliência e tipos honestos.

```ts
const [fii, cotacao] = await parallel([
  task(() => brapi.getFII(ticker)),
  task(() => hgBrasil.getCotacao(ticker)),
]).unwrap()
```

## Princípios de design

- **Agnóstico a transporte.** Tudo que importa é `() => Promise<T>`. Você traz o `fetch`/`axios`/SDK que quiser. **Zero dependências.**
- **Erros explícitos.** Nada de `throw` silencioso: toda execução devolve um [`Result<T, E>`](#result) que o consumidor é obrigado a tratar.
- **Cancelável por padrão.** `AbortSignal` é propagado por todo o pipeline desde o v1.
- **Estado isolado.** Cada `task(fn)` é uma instância independente — sem estado global escondido, o que torna tudo trivial de testar.
- **API fluente.** `task(fn).timeout(2000).retry(3).run()`.

## Conceito central: `Task`

A abstração que sustenta tudo:

```ts
type Task<T, E = Error> = (signal?: AbortSignal) => Promise<Result<T, E>>
```

Uma função que, dado um `AbortSignal` opcional, devolve um `Result`. `task(fn)` adapta qualquer função que pode lançar para essa forma, capturando exceções como `Err`.

## `Result<T, E>`

Modelo de erro type-safe, sem dependência externa. A discriminação é pelo campo `ok`, e a manipulação é feita por métodos no próprio objeto.

```ts
type Result<T, E = Error> = Ok<T, E> | Err<T, E>
```

| Método | Descrição |
| --- | --- |
| `.isOk()` / `.isErr()` | Type guards que estreitam para `Ok` / `Err`. |
| `.map(fn)` | Transforma o valor de sucesso. No-op em `Err`. |
| `.mapErr(fn)` | Transforma o erro. No-op em `Ok`. |
| `.andThen(fn)` | Encadeia outro `Result` a partir do valor (flatMap). |
| `.orElse(fn)` | Recupera de um erro produzindo outro `Result`. |
| `.unwrap()` | Extrai o valor; **lança** se for `Err`. |
| `.unwrapOr(fallback)` | Extrai o valor ou retorna o fallback. |
| `.unwrapErr()` | Extrai o erro; lança se for `Ok`. |
| `.match({ ok, err })` | Pattern matching exaustivo. |

Construtores e helpers: `ok(value)`, `err(error)`, `fromPromise(promise, onError?)`.

```ts
const r = ok(2).map((n) => n + 1)          // Ok(3)
r.match({ ok: (n) => n, err: () => -1 })   // 3

const e = err<string>('boom')
e.unwrapOr(99)                             // 99
```

## Builder fluente

`task(fn)` devolve um `TaskBuilder` imutável — cada método retorna um novo builder.

```ts
const result = await task(() => fetch(url).then((r) => r.json()))
  .timeout(2000)
  .retry({ attempts: 3, backoff: 'exponential' })
  .map((json) => json.data)
  .run() // → Promise<Result<T, E>>
```

| Método | Descrição |
| --- | --- |
| `.map(fn)` / `.mapErr(fn)` | Transforma valor / erro do resultado. |
| `.andThen(fn)` | Encadeia outro `Task` a partir do valor. |
| `.recover(fn)` | Recupera de um erro encadeando outro `Task`. |
| `.timeout(ms)` | Cancela via `AbortSignal` se não resolver a tempo. |
| `.retry(policy)` | Repete enquanto retornar `Err`. Aceita `number` ou `RetryPolicy`. |
| `.cache(options)` | Memoiza o resultado de sucesso por uma janela de TTL. |
| `.circuitBreaker(options?)` | Protege um serviço instável (fail-fast). |
| `.use(wrap)` | Ponto de extensão para middleware customizado. |
| `.run(signal?)` | Executa e devolve o `Result`. |
| `.unwrap(signal?)` | Executa e extrai o valor (lança em `Err`). |

`RetryPolicy`: `{ attempts, backoff?: 'fixed' | 'exponential', delay?, factor? }`.

## Combinadores

### `parallel` — fan-out com tupla tipada

Dispara N tasks ao mesmo tempo e coleta os resultados **em ordem, numa tupla tipada**. Diferente de `Promise.all`, **não faz short-circuit**: uma falha não derruba as vizinhas — você inspeciona cada `Result` individualmente.

```ts
const [a, b, c] = await parallel([
  task(async () => 1),        // Task<number>
  task(async () => 'dois'),   // Task<string>
  task(async () => fetchX()), // Task<X>
]).unwrap()

// a: Result<number, Error>
// b: Result<string, Error>
// c: Result<X, Error>
```

Use `concurrency` para limitar quantas executam ao mesmo tempo (a ordem dos resultados é preservada):

```ts
await parallel(tasks, { concurrency: 3 }).unwrap()
```

A orquestração em si nunca falha (`E = never`); as falhas vivem dentro de cada `Result` da tupla.

### `pipe` — sequência com passagem de valor

Composição sequencial onde o `output` de um passo vira o `input` do próximo, com os tipos encadeados (`V0 → V1 → V2`). O primeiro elemento é um `Task`; cada passo seguinte é uma **função** que recebe o valor anterior e devolve o próximo `Task`.

```ts
const nome = await pipe(
  task(() => api.getUserId()),                 // Task<string>
  (id) => task(() => api.getUser(id)),         // (string) => Task<User>
  (user) => task(() => api.getName(user.id)),  // (User) => Task<string>
).unwrap()
```

**Short-circuit no primeiro `Err`**: se um passo falha, os seguintes não executam e o pipe devolve esse `Err`. Os tipos são verificados passo a passo via overloads (até 5 passos; acima disso, encadeie dois `pipe`).

### `fallback` — cadeia de degradação

Tenta cada task **em ordem** e devolve o primeiro `Ok`. Se um falha, passa para o próximo (short-circuit no primeiro sucesso — os seguintes nem executam). Se todos falharem, devolve o **último `Err`**.

```ts
const fii = await fallback([
  task(() => brapi.getFII(ticker)),    // provider primário
  task(() => hgBrasil.getFII(ticker)), // secundário
  task(() => localCache.get(ticker)),  // último recurso
]).unwrap()
```

Todas as alternativas compartilham o mesmo `T` e `E` (são intercambiáveis por definição). Se as fontes têm erros heterogêneos, normalize antes com `.mapErr(...)` em cada uma.

### `race` — o primeiro a resolver vence

Dispara todos ao mesmo tempo e devolve o **primeiro a terminar** — vencedor por velocidade, não por sucesso (pode ser `Ok` ou `Err`). Os perdedores são cancelados via `AbortSignal`.

```ts
const cotacao = await race([
  task((s) => fetch(provedorA, { signal: s }).then((r) => r.json())),
  task((s) => fetch(provedorB, { signal: s }).then((r) => r.json())),
]).unwrap()
```

Útil para fontes redundantes onde você quer a resposta mais rápida. Lança em array vazio.

## Middleware

Cada middleware é uma função `(task: Task) => Task` — composável via `.use(...)` ou pelos atalhos fluentes no builder. O estado (cache, contadores do breaker) vive no escopo do middleware: **isolado por instância**, sem nada global.

| Middleware | Atalho no builder | O que faz |
| --- | --- | --- |
| `withTimeout(ms)` | `.timeout(ms)` | Cancela via signal se estourar o tempo. |
| `withRetry(policy)` | `.retry(policy)` | Repete enquanto retornar `Err`. |
| `withCache(opts)` | `.cache(opts)` | Memoiza o `Ok` por uma janela de TTL (só sucesso). |
| `withCircuitBreaker(opts)` | `.circuitBreaker(opts)` | Fail-fast após N falhas consecutivas. |

```ts
// Atalhos fluentes:
task(fn).timeout(2000).retry(3).cache({ ttl: 5000 }).circuitBreaker({ threshold: 5 })

// Ou composição explícita via .use, equivalente:
task(fn).use(withTimeout(2000)).use(withRetry(3))
```

**Circuit breaker** — máquina de estados `closed → open → half-open`. Abre após `threshold` falhas consecutivas (padrão 5), rejeitando na hora com `CircuitOpenError` por `halfOpenAfter` ms (padrão 10s); depois deixa uma tentativa passar (half-open) e fecha se ela vingar.

**Cache** — só `Ok` é cacheado; `Err` sempre repassa (não fixa falha transitória). Chaveado por `key` (padrão `'default'`).

## Status

> Em desenvolvimento ativo. Implementado até aqui:

- [x] `core/result.ts` — `Result<T, E>` com métodos
- [x] `core/task.ts` — `Task`, `task()`, `TaskBuilder` fluente, `AbortError`
- [x] `combinators/parallel.ts` — fan-out com tupla tipada + concorrência
- [x] `combinators/pipe.ts` — sequência com passagem de valor
- [x] `combinators/fallback.ts` — cadeia de degradação
- [x] `combinators/race.ts` — primeiro a resolver
- [x] `core/context.ts` — `AbortError`, `wait`, `linkSignal`, `safeRun`
- [x] `middleware/` — `withTimeout`, `withRetry`, `withCache`, `withCircuitBreaker`

Próximos passos: testes unitários por módulo (hoje há um `tests/smoke.ts` cobrindo o caminho feliz de cada peça), build/publish (ESM) e o combinador `pipe` acima de 5 passos.

## Desenvolvimento

```bash
npx tsc --noEmit      # typecheck
npx tsx tests/smoke.ts # smoke tests
```

## Licença

ISC
# gering
