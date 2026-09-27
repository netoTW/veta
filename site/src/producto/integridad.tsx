import type { ReactNode } from 'react'
import type { Informe } from '../lib/contrato'
import { CAMPO_LABEL } from '../lib/formato'
import { MARCA_ND, TEXTO_ND, limpiarProsa, llano, numerosDeProsa, prosaDeCliente } from '../lib/lenguaje'

/* ============================================================================
   Datos incompletos, dichos al cliente (ESPECIFICACION-LANZAMIENTO.md §6,
   contrato §20.2, excepción de CLAUDE.md).

   - Lo que se obtuvo de una fuente y no se pudo verificar: una línea por dato,
     y en la prosa la cifra lleva su nota.
   - Lo que no hay: UNA línea discreta al final. Nunca una caja vacía.
   - Lo que el control de calidad corrigió o quitó (`retiradas`): no se menciona.
     Ni siquiera llega: el servidor lo quita de la respuesta a quien no es admin.
   ========================================================================== */

/** §20.2 (sin `version`) o §20.3 (`version: 2`, con `cifra_id`). Las dos conviven: los registros
    viejos no se reescriben. */
export interface Integridad {
  version?: number
  no_disponibles?: { que: string; motivo_cliente?: string; cifra_id?: string }[]
  sin_verificar?: { que: string; fuente: string; seccion?: string; cifra?: string }[]
}

const frase = (t: string) => { const x = prosaDeCliente(t).trim(); return x ? x.charAt(0).toUpperCase() + x.slice(1) : '' }
/** «obtenido de docs.x.io, sin verificar» ya viene dicho por el motor; si sólo trae la fuente, se completa. */
const deFuente = (f: string) => { const x = prosaDeCliente(f).trim(); return /sin verificar/i.test(x) ? frase(x) : `Obtenido de ${x}, sin verificar` }

/** Un nombre de dato del motor, dicho en llano: sin identificadores con guiones («ethena-usde»)
    y con «Δ30d» como «variación a 30 días». El contrato pide que ya llegue así (§20.2). */
const enLlano = (x: string) => x
  .replace(/Δ\s?(\d+)\s?d\b/g, 'variación a $1 días')
  .replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g, '')
  .replace(/\s+(y|,)\s+(y|,)\s+/g, ' $1 ').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim()

/** Tras dos puntos va minúscula, salvo una sigla («TVL», «USDe»). */
const trasDosPuntos = (x: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x)

/** Los cifra_id que ya se dicen en la prosa con ⟦nd⟧: ésos no se repiten en la línea final. */
export function marcadasEnProsa(r: unknown): Set<string> {
  return new Set([...JSON.stringify(r ?? {}).matchAll(MARCA_ND)].map((m) => m[1]))
}

export function lineasDeIntegridad(inf: Pick<Informe, 'fuentes'> & { integridad?: Integridad | null }): { sinVerificar: string[]; noDisponibles: string[] } {
  const ig = inf.integridad
  const sinVerificar = (ig?.sin_verificar ?? [])
    .map((d) => { const que = trasDosPuntos(prosaDeCliente(d.que).trim()); return que ? `${deFuente(d.fuente)}: ${que}${d.cifra ? ` (${numerosDeProsa(d.cifra.trim())})` : ''}.` : '' })
    .filter(Boolean)
  let noDisponibles: string[]
  if (ig) {
    // v2: lo que ya dice «dato no disponible» dentro de su frase no se nombra otra vez al final.
    const enProsa = ig.version === 2 ? marcadasEnProsa(inf) : new Set<string>()
    noDisponibles = (ig.no_disponibles ?? []).filter((d) => !d.cifra_id || !enProsa.has(d.cifra_id))
      .map((d) => trasDosPuntos(enLlano(prosaDeCliente(d.que)))).filter(Boolean)
  }
  else {
    // Registros de antes de §20: lo ausente sale de las fuentes, sólo si hay cómo decirlo en llano.
    noDisponibles = (inf.fuentes ?? []).filter((f) => f.calidad === 'ausente').map((f) => CAMPO_LABEL[f.campo]).filter((x): x is string => !!x)
  }
  return { sinVerificar, noDisponibles: [...new Set(noDisponibles)] }
}

export function SobreLosDatos({ inf }: { inf: Informe }) {
  const { sinVerificar, noDisponibles } = lineasDeIntegridad(inf as Informe & { integridad?: Integridad | null })
  if (!sinVerificar.length && !noDisponibles.length) return null
  return (
    <div className="p-sobredatos" aria-label="Sobre los datos de este informe">
      <span className="mono p-sobredatos__k">Sobre los datos de este informe</span>
      {sinVerificar.map((l, i) => <p key={i} className="p-sobredatos__l">{l}</p>)}
      {noDisponibles.length > 0 && <p className="p-sobredatos__l p-sobredatos__l--fuera">No entra en este informe: {noDisponibles.join(', ')}.</p>}
    </div>
  )
}

/* ---------- las marcas en la prosa: ⟦sv:i⟧ (§20.2) y ⟦nd:<cifra_id>⟧ (§20.3) ---------- */
const MARCA = /⟦(sv|nd):([^⟧]+)⟧/g
type Trozo = { texto: string } | { nota: number } | { nd: string }

/** Parte un texto en trozos, notas de «sin verificar» y huecos de cifra retirada. */
export function partirSinVerificar(t: string): Trozo[] {
  const out: Trozo[] = []
  let desde = 0
  for (const m of t.matchAll(MARCA)) {
    if (m.index! > desde) out.push({ texto: t.slice(desde, m.index) })
    out.push(m[1] === 'sv' ? { nota: Number(m[2]) } : { nd: m[2] })
    desde = m.index! + m[0].length
  }
  if (desde < t.length) out.push({ texto: t.slice(desde) })
  return out
}

/** Prosa del informe con sus marcas: la nota «obtenido de …, sin verificar» sobre la cifra marcada
    y «dato no disponible» donde el verificador retiró una cifra (con el motivo al pasar el ratón).
    Las marcas se protegen con un símbolo neutro, el texto se limpia ENTERO (los filtros van por
    frases) y después se parte: así ni se pierde el hueco ni se salta un filtro. */
export function ProsaConNotas({ t, integridad }: { t: string; integridad?: Integridad | null }): ReactNode {
  const marcas: Trozo[] = []
  const protegido = (t ?? '').replace(MARCA, (_m, tipo: string, id: string) => {
    marcas.push(tipo === 'sv' ? { nota: Number(id) } : { nd: id })
    return `\uE000${marcas.length - 1}\uE001`
  })
  if (!marcas.length) return prosaDeCliente(t)
  const limpio = numerosDeProsa(limpiarProsa(llano(protegido)))
  return limpio.split(/\uE000(\d+)\uE001/).map((trozo, i) => {
    if (i % 2 === 0) return trozo ? <span key={i}>{trozo}</span> : null
    const p = marcas[Number(trozo)]
    if (!p || 'texto' in p) return null
    if ('nd' in p) {
      const motivo = prosaDeCliente(integridad?.no_disponibles?.find((d) => d.cifra_id === p.nd)?.motivo_cliente ?? '')
      return <span key={i} className="p-nd" title={motivo || undefined} tabIndex={motivo ? 0 : undefined}>{TEXTO_ND}</span>
    }
    const d = integridad?.sin_verificar?.[p.nota]
    const nota = d ? deFuente(d.fuente) : 'Sin verificar'
    return <abbr key={i} className="p-sv" title={nota} tabIndex={0} aria-label={nota}>*</abbr>
  })
}
