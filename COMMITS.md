# Commit Convention — Gering

We follow [Conventional Commits](https://www.conventionalcommits.org/). Each commit has a structured header, an optional body, and an optional footer.

## Format

```
<type>(<scope>): <imperative description, lowercase, no trailing period>

[optional body: the why of the change, not the what]

[optional footer: BREAKING CHANGE, refs]
```

Header rules:
- **Imperative**: "add", not "added"/"adding".
- **≤ 72 characters**, no trailing period.
- Scope is optional, but recommended when the change is localized.

## Types

| Type | When to use |
| --- | --- |
| `feat` | New public functionality (new combinator, middleware, method). |
| `fix` | Bug fix. |
| `refactor` | Internal change without altering observable behavior. |
| `perf` | Performance improvement. |
| `docs` | README, JSDoc, examples, this file. |
| `test` | Adds/adjusts tests. |
| `build` | tsconfig, build scripts, packaging, `package.json`. |
| `chore` | Auxiliary tasks (deps, configs) that don't fit any of the above. |

## Scopes

Scopes mirror the `src/` structure:

- **core**: `result`, `task`, `context`
- **combinators**: `parallel`, `pipe`, `fallback`, `race`
- **middleware**: `retry`, `timeout`, `cache`, `circuit-breaker`
- **others**: `index` (public surface), `examples`, `deps`

Use the most specific scope that describes the change (e.g., `fix(retry)` instead of `fix(middleware)`).

## Examples

```
feat(parallel): add concurrency option to cap fan-out
feat(middleware): add withCircuitBreaker with half-open
fix(retry): convert abort during the wait into Err instead of throwing
refactor(core): extract AbortError and safeRun into context.ts
test(circuit-breaker): cover the half-open → closed transition
docs(readme): add Weather Dashboard end-to-end example
build: package as ESM with exports and .d.ts
```

### Breaking change

Mark it with `!` after the scope **and** a `BREAKING CHANGE:` footer:

```
feat(task)!: make run() require an explicit AbortSignal

BREAKING CHANGE: TaskBuilder.run() can no longer be called without a signal.
```

## Wire up the template (optional)

There's a ready-made template at `.gitmessage`. To have git pre-fill the message:

```bash
git config commit.template .gitmessage
```

Then `git commit` (without `-m`) opens the editor already with the guide.
