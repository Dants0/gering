# Convenção de Commits — Gering

Seguimos [Conventional Commits](https://www.conventionalcommits.org/). Cada commit tem um cabeçalho estruturado, opcionalmente corpo e rodapé.

## Formato

```
<tipo>(<escopo>): <descrição no imperativo, minúscula, sem ponto final>

[corpo opcional: o porquê da mudança, não o quê]

[rodapé opcional: BREAKING CHANGE, refs]
```

Regras do cabeçalho:
- **Imperativo**: "adiciona", não "adicionado"/"adicionando".
- **≤ 72 caracteres**, sem ponto final.
- Escopo é opcional, mas recomendado quando a mudança é localizada.

## Tipos

| Tipo | Quando usar |
| --- | --- |
| `feat` | Nova funcionalidade pública (novo combinador, middleware, método). |
| `fix` | Correção de bug. |
| `refactor` | Mudança interna sem alterar comportamento observável. |
| `perf` | Melhoria de performance. |
| `docs` | README, JSDoc, exemplos, este arquivo. |
| `test` | Adiciona/ajusta testes. |
| `build` | tsconfig, scripts de build, empacotamento, `package.json`. |
| `chore` | Tarefas auxiliares (deps, configs) que não entram em nenhum acima. |

## Escopos

Os escopos espelham a estrutura do `src/`:

- **core**: `result`, `task`, `context`
- **combinators**: `parallel`, `pipe`, `fallback`, `race`
- **middleware**: `retry`, `timeout`, `cache`, `circuit-breaker`
- **outros**: `index` (superfície pública), `examples`, `deps`

Use o escopo mais específico que descreve a mudança (ex.: `fix(retry)` em vez de `fix(middleware)`).

## Exemplos

```
feat(parallel): adiciona opção concurrency para limitar fan-out
feat(middleware): adiciona withCircuitBreaker com half-open
fix(retry): converte abort durante a espera em Err em vez de lançar
refactor(core): extrai AbortError e safeRun para context.ts
test(circuit-breaker): cobre transição half-open → closed
docs(readme): adiciona exemplo end-to-end Weather Dashboard
build: empacota como ESM com exports e .d.ts
```

### Breaking change

Marque com `!` após o escopo **e** um rodapé `BREAKING CHANGE:`:

```
feat(task)!: torna run() exigir AbortSignal explícito

BREAKING CHANGE: TaskBuilder.run() não aceita mais ser chamado sem signal.
```

## Plugar o template (opcional)

Há um template pronto em `.gitmessage`. Para o git pré-preencher a mensagem:

```bash
git config commit.template .gitmessage
```

Daí `git commit` (sem `-m`) abre o editor já com o guia.
