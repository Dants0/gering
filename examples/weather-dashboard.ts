/**
 * End-to-end example (fictional) — "Weather Dashboard".
 *
 * Shows Gering orchestrating weather providers with resilience:
 *   1. fallback + retry + timeout + cache → resilient forecast for one city
 *   2. parallel                           → several cities at once
 *   3. pipe                               → forecast → detect alert → push
 *
 * Run with:  npm run example   (or: npx tsx examples/weather-dashboard.ts)
 *
 * The "providers" below are deterministic simulations — no real network — just
 * so you can see each pattern in action. In production, swap in your fetch/SDK.
 */

import { task, parallel, fallback, pipe } from '../src/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// Simulated providers (replace with real fetch/axios/SDK calls)
// ─────────────────────────────────────────────────────────────────────────────

interface Forecast {
  city: string
  tempC: number
  source: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** OpenSky (primary): down for Tokyo/Nairobi; for Lisbon fails 2x then succeeds (retry). */
let openSkyAttempts = 0
async function openSkyGet(city: string, signal?: AbortSignal): Promise<Forecast> {
  await sleep(15)
  if (signal?.aborted) throw new Error('aborted')
  if (city === 'Tokyo' || city === 'Nairobi') throw new Error(`OpenSky: ${city} unavailable`)
  if (city === 'Lisbon' && ++openSkyAttempts < 3) throw new Error('OpenSky: transient 503')
  return { city, tempC: 18 + city.length, source: 'OpenSky' }
}

/** MeteoNow (secondary): healthy, except Nairobi (also down). */
async function meteoNowGet(city: string, signal?: AbortSignal): Promise<Forecast> {
  await sleep(20)
  if (signal?.aborted) throw new Error('aborted')
  if (city === 'Nairobi') throw new Error(`MeteoNow: ${city} unavailable`)
  return { city, tempC: 17 + city.length, source: 'MeteoNow' }
}

/** Local cache: only has Nairobi (last resort when everything is down). */
async function cacheGet(city: string): Promise<Forecast> {
  await sleep(2)
  if (city !== 'Nairobi') throw new Error(`cache: miss for ${city}`)
  return { city, tempC: 29, source: 'cache (stale)' }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Resilient forecast: primary (with retry+timeout+cache) → secondary → cache
// ─────────────────────────────────────────────────────────────────────────────

function resilientForecast(city: string) {
  return fallback<Forecast>([
    task((s) => openSkyGet(city, s))
      .retry({ attempts: 3, backoff: 'exponential', delay: 10 })
      .timeout(500)
      .cache({ ttl: 60_000, key: `weather:${city}` }),
    task((s) => meteoNowGet(city, s)).timeout(80),
    task(() => cacheGet(city)),
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pipeline: forecast → heat alert → push (short-circuits on the first error)
// ─────────────────────────────────────────────────────────────────────────────

interface HeatAlert {
  city: string
  tempC: number
}

async function detectAlert(f: Forecast): Promise<HeatAlert | null> {
  // fictional rule: above 28°C triggers a heat alert
  return f.tempC > 28 ? { city: f.city, tempC: f.tempC } : null
}

let pushFailures = 0
async function sendPush(alert: HeatAlert, signal?: AbortSignal): Promise<string> {
  await sleep(10)
  if (signal?.aborted) throw new Error('aborted')
  if (++pushFailures < 2) throw new Error('Push: unavailable (transient)')
  return `heat alert sent for ${alert.city} (${alert.tempC}°C)`
}

function alertPipeline(city: string) {
  return pipe(
    resilientForecast(city),
    (f) => task(() => detectAlert(f)),
    (alert) =>
      task<string>(async (s) => {
        if (!alert) return 'mild temperature — no alert'
        return sendPush(alert, s)
      }).retry({ attempts: 3, delay: 10 }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━ 1. Resilient forecast per city ━━━')
  for (const city of ['Lisbon', 'Tokyo', 'Nairobi']) {
    const r = await resilientForecast(city).run()
    r.match({
      ok: (f) => console.log(`  ✔ ${city}: ${f.tempC}°C via ${f.source}`),
      err: (e) => console.log(`  ✗ ${city}: failed — ${e.message}`),
    })
  }

  console.log('\n━━━ 2. Several cities in parallel ━━━')
  const cities = ['Lisbon', 'Tokyo', 'Nairobi']
  const forecasts = await parallel(cities.map((c) => resilientForecast(c))).unwrap()
  forecasts.forEach((r, i) =>
    console.log(
      r.isOk()
        ? `  ✔ ${cities[i]}: ${r.value.tempC}°C via ${r.value.source}`
        : `  ✗ ${cities[i]}: ${r.error.message}`,
    ),
  )

  console.log('\n━━━ 3. Heat-alert pipeline ━━━')
  for (const city of ['Lisbon', 'Nairobi']) {
    const r = await alertPipeline(city).run()
    console.log(r.isOk() ? `  ✔ ${city}: ${r.value}` : `  ✗ ${city}: ${r.error.message}`)
  }
}

main()
