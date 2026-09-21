/* ============================================================================
   Qué plan de Whop es cuál.

   Los dos enlaces de pago no dicen cuál es Base y cuál es Pro: lo dice el
   precio. Este script le pregunta a Whop por cada identificador y muestra el
   precio, para no adivinar y para dejar las variables de entorno bien puestas.

     VETA_WHOP_API_KEY=... npx tsx scripts/whop-planes.ts plan_AAA plan_BBB

   La clave se lee del entorno o del .env; no se escribe aquí ni se imprime.
   ========================================================================== */
import { ENV } from '../server/entorno.ts'

const RUTAS = (id: string) => [
  `/v5/company/plans/${id}`,
  `/v5/app/plans/${id}`,
  `/api/v2/plans/${id}`,
  `/v2/plans/${id}`,
]

type Json = Record<string, unknown>

async function pedir(ruta: string): Promise<{ status: number; cuerpo: Json | null }> {
  try {
    const r = await fetch(`https://api.whop.com${ruta}`, {
      headers: { Authorization: `Bearer ${ENV.WHOP.API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    const t = await r.text().catch(() => '')
    let cuerpo: Json | null = null
    try { cuerpo = t ? JSON.parse(t) as Json : null } catch { cuerpo = null }
    return { status: r.status, cuerpo }
  } catch (e) {
    console.log(`    ${ruta} → ${(e as Error).message}`)
    return { status: 0, cuerpo: null }
  }
}

/** El precio, mirando los nombres que usa Whop según la versión. */
function precioDe(p: Json): string {
  const n = p.renewal_price ?? p.initial_price ?? p.price ?? p.base_currency_price
  const moneda = typeof p.base_currency === 'string' ? p.base_currency.toUpperCase() : (typeof p.currency === 'string' ? p.currency.toUpperCase() : '')
  if (n === undefined || n === null) return '(sin precio en la respuesta)'
  return `${n} ${moneda}`.trim()
}

async function mirar(id: string) {
  console.log(`\n▸ ${id}`)
  for (const ruta of RUTAS(id)) {
    const { status, cuerpo } = await pedir(ruta)
    if (status !== 200 || !cuerpo) { console.log(`    ${ruta} → ${status || 'sin respuesta'}`); continue }
    const p = (cuerpo.data && typeof cuerpo.data === 'object' ? cuerpo.data : cuerpo) as Json
    console.log(`    ${ruta} → 200`)
    console.log(`    precio            : ${precioDe(p)}`)
    console.log(`    periodo           : ${p.billing_period ?? p.plan_type ?? '—'}`)
    console.log(`    producto          : ${JSON.stringify(p.product ?? p.access_pass ?? p.product_id ?? '—')}`)
    console.log(`    título            : ${p.title ?? p.name ?? p.internal_notes ?? '—'}`)
    const precio = Number(p.renewal_price ?? p.initial_price ?? p.price ?? NaN)
    if (Number.isFinite(precio)) {
      const cual = precio === ENV.PRECIO.base ? 'VETA_WHOP_PLAN_BASE' : precio === ENV.PRECIO.pro ? 'VETA_WHOP_PLAN_PRO' : null
      console.log(cual ? `    → va en ${cual}=${id}` : `    → el precio (${precio}) no coincide con Base (${ENV.PRECIO.base}) ni con Pro (${ENV.PRECIO.pro}): míralo a mano`)
    }
    return
  }
  console.log('    ninguna ruta respondió. Revisa que la clave sea de la empresa Vetalab y tenga permiso de lectura.')
}

const ids = process.argv.slice(2).filter((a) => a.startsWith('plan_'))
if (!ENV.WHOP.API_KEY) {
  console.error('Falta VETA_WHOP_API_KEY (entorno o .env).')
  process.exit(2)
}
if (!ids.length) {
  console.error('Uso: npx tsx scripts/whop-planes.ts plan_AAA plan_BBB')
  process.exit(2)
}
console.log(`Precios publicados: Base ${ENV.PRECIO.base} USD · Pro ${ENV.PRECIO.pro} USD`)
for (const id of ids) await mirar(id)
console.log()
