/**
 * Exemplo end-to-end (fictício) — "Weather Dashboard".
 *
 * Mostra o Gering orquestrando provedores de previsão do tempo com resiliência:
 *   1. fallback + retry + timeout + cache → previsão resiliente de uma cidade
 *   2. parallel                           → várias cidades de uma vez
 *   3. pipe                               → pipeline geocode → previsão → alerta
 *
 * Rode com:  npm run example   (ou: npx tsx examples/weather-dashboard.ts)
 *
 * Os "provedores" abaixo são simulações determinísticas — sem rede de verdade —
 * só para você ver cada padrão agindo. Em produção, troque pelos seus fetch/SDK.
 */

import { task, parallel, fallback, pipe } from '../src/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// Provedores simulados (substitua por chamadas reais de fetch/axios/SDK)
// ─────────────────────────────────────────────────────────────────────────────

interface Forecast {
  cidade: string
  tempC: number
  fonte: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** OpenSky (primário): cai para Tokyo/Nairobi; em Lisboa falha 2x e acerta na 3ª. */
let openSkyTentativas = 0
async function openSkyGet(cidade: string, signal?: AbortSignal): Promise<Forecast> {
  await sleep(15)
  if (signal?.aborted) throw new Error('abortado')
  if (cidade === 'Tokyo' || cidade === 'Nairobi') throw new Error(`OpenSky: ${cidade} indisponível`)
  if (cidade === 'Lisboa' && ++openSkyTentativas < 3) throw new Error('OpenSky: 503 transitório')
  return { cidade, tempC: 18 + cidade.length, fonte: 'OpenSky' }
}

/** MeteoNow (secundário): saudável, exceto Nairobi (também fora). */
async function meteoNowGet(cidade: string, signal?: AbortSignal): Promise<Forecast> {
  await sleep(20)
  if (signal?.aborted) throw new Error('abortado')
  if (cidade === 'Nairobi') throw new Error(`MeteoNow: ${cidade} indisponível`)
  return { cidade, tempC: 17 + cidade.length, fonte: 'MeteoNow' }
}

/** Cache local: só tem Nairobi (último recurso quando tudo cai). */
async function cacheGet(cidade: string): Promise<Forecast> {
  await sleep(2)
  if (cidade !== 'Nairobi') throw new Error(`cache: miss para ${cidade}`)
  return { cidade, tempC: 29, fonte: 'cache (stale)' }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Previsão resiliente: primário (com retry+timeout+cache) → secundário → cache
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pipeline: geocode → previsão → alerta de calor (short-circuit no 1º erro)
// ─────────────────────────────────────────────────────────────────────────────

interface AlertaCalor {
  cidade: string
  tempC: number
}

async function detectarAlerta(f: Forecast): Promise<AlertaCalor | null> {
  // regra fictícia: acima de 28°C dispara alerta de calor
  return f.tempC > 28 ? { cidade: f.cidade, tempC: f.tempC } : null
}

let pushFalhas = 0
async function enviarPush(alerta: AlertaCalor, signal?: AbortSignal): Promise<string> {
  await sleep(10)
  if (signal?.aborted) throw new Error('abortado')
  if (++pushFalhas < 2) throw new Error('Push: indisponível (transitório)')
  return `alerta de calor enviado para ${alerta.cidade} (${alerta.tempC}°C)`
}

function pipelineAlerta(cidade: string) {
  return pipe(
    previsaoResiliente(cidade),
    (f) => task(() => detectarAlerta(f)),
    (alerta) =>
      task<string>(async (s) => {
        if (!alerta) return 'temperatura amena — sem alerta'
        return enviarPush(alerta, s)
      }).retry({ attempts: 3, delay: 10 }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━ 1. Previsão resiliente por cidade ━━━')
  for (const cidade of ['Lisboa', 'Tokyo', 'Nairobi']) {
    const r = await previsaoResiliente(cidade).run()
    r.match({
      ok: (f) => console.log(`  ✔ ${cidade}: ${f.tempC}°C via ${f.fonte}`),
      err: (e) => console.log(`  ✗ ${cidade}: falhou — ${e.message}`),
    })
  }

  console.log('\n━━━ 2. Várias cidades em paralelo ━━━')
  const cidades = ['Lisboa', 'Tokyo', 'Nairobi']
  const previsoes = await parallel(cidades.map((c) => previsaoResiliente(c))).unwrap()
  previsoes.forEach((r, i) =>
    console.log(
      r.isOk()
        ? `  ✔ ${cidades[i]}: ${r.value.tempC}°C via ${r.value.fonte}`
        : `  ✗ ${cidades[i]}: ${r.error.message}`,
    ),
  )

  console.log('\n━━━ 3. Pipeline de alerta de calor ━━━')
  for (const cidade of ['Lisboa', 'Nairobi']) {
    const r = await pipelineAlerta(cidade).run()
    console.log(r.isOk() ? `  ✔ ${cidade}: ${r.value}` : `  ✗ ${cidade}: ${r.error.message}`)
  }
}

main()
