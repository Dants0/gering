# Gering

Composição de chamadas a APIs externas para TypeScript/Node.js — **fan-out, cache, fallback, retry, timeout e circuit breaker** com uma API fluente e segura.

Gering resolve, de forma consistente, o que todo projeto reescreve do zero: orquestrar várias chamadas a serviços externos com resiliência e tipos honestos.

```ts
const [previsao, qualidadeAr] = await parallel([
  task(() => openSky.getForecast(cidade)),
  task(() => airIndex.getAQI(cidade)),
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
const previsao = await fallback([
  task(() => openSky.getForecast(cidade)),  // provider primário
  task(() => meteoNow.getForecast(cidade)), // secundário
  task(() => localCache.get(cidade)),       // último recurso
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

## Exemplo end-to-end

[`examples/weather-dashboard.ts`](examples/weather-dashboard.ts) é um exemplo rodável (cenário fictício "Weather Dashboard") que combina os padrões num fluxo de agregação de previsão do tempo:

```bash
npm run example
```

Ele demonstra três situações, cada uma com um provedor caindo de um jeito diferente:

```ts
// Previsão resiliente: primário (retry + timeout + cache) → secundário → cache local
function previsaoResiliente(cidade: string) {
  return fallback<Forecast>([
    task((s) => openSkyGet(cidade, s))
      .retry({ attempts: 3, backoff: 'exponential', delay: 10 })
      .timeout(500)
      .cache({ ttl: 60_000, key: `weather:${cidade}` }),
    task((s) => meteoNowGet(cidade, s)).timeout(80),
    task(() => cacheGet(cidade)),
  ])
}

// Várias cidades em paralelo
const previsoes = await parallel(cidades.map((c) => previsaoResiliente(c))).unwrap()

// Pipeline geocode → previsão → alerta (short-circuit no primeiro erro)
const alertado = await pipe(
  previsaoResiliente(cidade),
  (f) => task(() => detectarAlerta(f)),
  (alerta) => task((s) => enviarPush(alerta, s)).retry(3),
).run()
```

Saída esperada — cada linha mostra um padrão de resiliência salvando o dia (retry, fallback ao secundário, fallback ao cache):

```
━━━ 1. Previsão resiliente por cidade ━━━
  ✔ Lisboa:  24°C via OpenSky         (retry: OpenSky falhou 2x, acertou na 3ª)
  ✔ Tokyo:   22°C via MeteoNow        (fallback: OpenSky fora → secundário)
  ✔ Nairobi: 29°C via cache (stale)   (fallback: ambos fora → cache local)
```

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

Empacotado como **ESM** (`type: module`), zero dependências de runtime. O build (`tsc`) emite `dist/` com `.js` + `.d.ts` e source maps. Testes unitários por módulo em `tests/` (61 casos, `node:test`).

Próximos passos: publicação no npm, e o combinador `pipe` acima de 5 passos.

## Desenvolvimento

```bash
npm run typecheck   # tsc --noEmit
npm test            # suíte node:test (via tsx)
npm run build       # emite dist/ (js + d.ts)
npm run example     # roda o exemplo Weather Dashboard
```

Convenção de commits em [`COMMITS.md`](COMMITS.md) (Conventional Commits + template `.gitmessage`).

## Licença

ISC
# gering
