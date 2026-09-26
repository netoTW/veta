import { fechaHora } from '../../lib/formato'
import { LECTURA_LABEL, prosaDeCliente } from '../../lib/lenguaje'
import { Cifra } from '../Cifra'
import type { ContextoCifra } from '../../lib/formato'

/* ============================================================================
   La ficha gratis (ESPECIFICACION-LANZAMIENTO.md §4, contrato §21).

   La foto de la moneda en cinco bloques. Cada dato dice si se midió o se
   estimó, y de dónde sale. Lo que no hay no ocupa una fila: se nombra una vez,
   en una línea discreta al final (excepción de CLAUDE.md). Un bloque sin nada
   que mostrar desaparece y su nombre va a esa línea.
   ========================================================================== */
export interface DatoFicha {
  clave: string; etiqueta: string; valor: number | null; unidad: string | null; estado: 'medido' | 'estimado' | 'no_disponible'
  fuente: string | null; medido_en: string | null; nota_estimado: string | null; motivo_cliente: string | null
}
export interface BloqueFicha { titulo: string; lectura: string | null; datos: DatoFicha[] }
export interface Ficha {
  simbolo: string; nombre: string; cadena: string; contrato: string; fecha_datos: string | null
  precio_usd: DatoFicha; var_24h: DatoFicha; var_7d: DatoFicha; mcap_usd: DatoFicha
  bloques: Record<string, BloqueFicha>; analizable: boolean | null; motivo_no_analizable: string | null
}
const ORDEN = ['demanda', 'riesgo_cola', 'concentracion', 'tokenomics', 'liquidez']
const CADENA: Record<string, string> = { ethereum: 'Ethereum', solana: 'Solana', base: 'Base', 'binance-smart-chain': 'BNB Chain', 'arbitrum-one': 'Arbitrum', avalanche: 'Avalanche', 'polygon-pos': 'Polygon' }

/** El contexto de §23 de cada dato: el precio lleva decimales según magnitud; las variaciones, signo. */
const contexto = (d: DatoFicha): ContextoCifra => (d.clave === 'precio_usd' ? 'precio' : /var_|cambio/.test(d.clave) ? 'variacion' : d.unidad === 'USD' ? 'cantidad' : 'normal')
const hay = (d?: DatoFicha | null) => !!d && d.estado !== 'no_disponible' && d.valor !== null

function Fila({ d, bloque }: { d: DatoFicha; bloque: string }) {
  const estimado = d.estado === 'estimado'
  const nota = estimado ? prosaDeCliente(d.nota_estimado) : ''
  return (
    <div className={`an-ficha__fila ${estimado ? 'is-estimado' : ''}`}>
      <span className="an-ficha__et">{prosaDeCliente(d.etiqueta)}</span>
      <Cifra className="an-ficha__v num" campo={`bloques.${bloque}.datos.${d.clave}.valor`} v={d.valor} u={d.unidad} c={contexto(d)} />
      <span className="an-ficha__fuente mono" title={nota || undefined} tabIndex={nota ? 0 : undefined}>
        {estimado ? <>estimado{nota ? ` · ${nota}` : ''}</> : <>medido · {prosaDeCliente(d.fuente)}</>}
      </span>
    </div>
  )
}

export function FichaCliente({ f }: { f: Ficha }) {
  const fuera: string[] = []
  const bloques = ORDEN.map((k) => [k, f.bloques[k]] as const).filter(([, b]) => !!b)
  const visibles = bloques.filter(([k, b]) => {
    const conValor = b.datos.filter(hay)
    if (!conValor.length) { fuera.push(prosaDeCliente(b.titulo).toLowerCase()); return false }
    for (const d of b.datos) if (!hay(d)) fuera.push(prosaDeCliente(d.etiqueta).replace(/^./, (x) => x.toLowerCase()))
    void k
    return true
  })
  const cadena = CADENA[f.cadena] ?? (f.cadena ? f.cadena.charAt(0).toUpperCase() + f.cadena.slice(1) : '')
  return (
    <article className="an-ficha" aria-label={`Ficha de ${f.simbolo}`}>
      <header className="an-ficha__cab">
        <div>
          <h2 className="display an-ficha__sym">{f.simbolo}<small>{f.nombre}{cadena ? ` · ${cadena}` : ''}</small></h2>
          {hay(f.precio_usd) && (
            <p className="an-ficha__precio">
              <Cifra className="num" campo="precio_usd.valor" v={f.precio_usd.valor} u="USD" c="precio" />
              {hay(f.var_24h) && <span className="an-ficha__var mono"><Cifra campo="var_24h.valor" v={f.var_24h.valor} u="%" c="variacion" /> en 24 h</span>}
              {hay(f.var_7d) && <span className="an-ficha__var mono"><Cifra campo="var_7d.valor" v={f.var_7d.valor} u="%" c="variacion" /> en 7 días</span>}
            </p>
          )}
        </div>
        {f.fecha_datos && <span className="an-ficha__fecha mono">datos de {fechaHora(f.fecha_datos)}</span>}
      </header>
      {visibles.map(([k, b]) => {
        const lec = b.lectura ? LECTURA_LABEL[b.lectura] : null
        return (
          <section key={k} className="an-ficha__bloque" aria-label={b.titulo}>
            <div className="an-ficha__bcab">
              <span className="mono an-ficha__bt">{prosaDeCliente(b.titulo)}</span>
              {lec && <span className={`an-ficha__lectura is-${lec.tono}`}>{lec.t}</span>}
            </div>
            {b.datos.filter(hay).map((d) => <Fila key={d.clave} d={d} bloque={k} />)}
          </section>
        )
      })}
      {fuera.length > 0 && <p className="an-ficha__fuera">No entra en esta ficha: {[...new Set(fuera)].join(', ')}.</p>}
      <p className="an-ficha__pitch">
        {f.analizable === false
          ? <>Para esta moneda te damos la foto; el análisis completo necesita {prosaDeCliente(f.motivo_no_analizable).replace(/^./, (x) => x.toLowerCase()).replace(/\.$/, '')}.</>
          : <>Esto es la foto. El análisis completo te dice qué hacer con ella: la tesis, los escenarios y el número exacto que la invalida.</>}
      </p>
    </article>
  )
}
