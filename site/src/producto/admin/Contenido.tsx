import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/datos'
import { AdminCab } from './piezasAdmin'
import { Loader } from '../../ui/Loader'
import { EmptyState } from '../../ui/EmptyState'
import { fecha, num, precio } from '../../lib/formato'
import { limpiarProsa, llano, sinIdentificadores, revisarParaPublicar, type Reparo } from '../../lib/lenguaje'
import { tesisCompuesta } from '../cifras'
import type { Informe } from '../../lib/contrato'
import type { InformeCliente } from '../paginas/InformeDetalle'
import type { FilaBandeja } from './Bandeja'

/* ============================================================================
   Contenido: piezas listas para publicar fuera, armadas desde informes que ya
   aprobaste.

   No llama a ningún modelo: todo sale de campos que ya pasaron la comprobación
   de cifras. Lo que no puede garantizar es el lenguaje, porque el texto viene
   del sistema de análisis. Por eso cada pieza se revisa y, si algo se cuela, se
   señala en vez de copiarlo a ciegas.
   ========================================================================== */

interface Pieza { clave: string; titulo: string; para: string; texto: string; reparos: Reparo[] }

const sano = (t?: string | null) => sinIdentificadores(limpiarProsa(llano(t ?? '')))

/** Una frase suelta del informe, ya limpia, o cadena vacía si no quedó nada. */
const bloque = (inf: Informe, k: string) => sano((inf.niveles as unknown as Record<string, { esencial?: { texto?: string } }> | undefined)?.[k]?.esencial?.texto)

/* El motor ya escribe el texto de cliente (contrato §11). Cuando viene, manda él:
   no hay que filtrar nada porque no trae vocabulario de taller. El camino de abajo
   queda para los informes viejos, que todavía no lo traen. */
function desdeInformeCliente(inf: Informe, ic: InformeCliente): Pieza[] | null {
  if (!ic?.lectura?.veredicto) return null
  const linea = `${inf.simbolo} · ${inf.nombre}${inf.cadena ? ` · ${inf.cadena}` : ''}`
  const dir = ic.lectura.direccion ? `${ic.lectura.direccion}${ic.lectura.horizonte_dias ? ` a ${ic.lectura.horizonte_dias} días` : ''}` : ''
  const crudas = [
    { clave: 'ficha', titulo: 'Ficha corta', para: 'Para un mensaje o un pie de imagen',
      texto: [linea, dir, '', ic.lectura.veredicto, '', (ic.lectura.parrafos ?? [])[0] ?? ''].filter(Boolean).join('\n').trim() },
    { clave: 'hallazgo', titulo: 'Lo que el resto no ve', para: 'La pieza que más se comparte',
      texto: (() => {
        const h = (ic.hallazgos?.length ? ic.hallazgos : ic.hallazgo ? [ic.hallazgo] : [])[0]
        return h?.titular ? [linea, '', h.titular, '', ...(h.parrafos ?? [])].join('\n').trim() : ''
      })() },
    { clave: 'riesgos', titulo: 'Lo que podría salir mal', para: 'Para acompañar cualquier pieza',
      texto: ic.riesgos?.length ? [linea, '', ...ic.riesgos.map((r) => `· ${r}`)].join('\n').trim() : '' },
  ]
  return crudas.filter((x) => x.texto).map((x) => ({ ...x, reparos: revisarParaPublicar(x.texto) }))
}

function componer(inf: Informe): Pieza[] {
  const ic = (inf as unknown as { informe_cliente?: InformeCliente }).informe_cliente
  if (ic) { const p = desdeInformeCliente(inf, ic); if (p?.length) return p }
  const f = (inf as unknown as { ficha_esencial?: Record<string, unknown> }).ficha_esencial ?? {}
  const ref = f.precio_y_fecha_referencia as { precio_usd?: number; fecha?: string } | undefined
  const titular = sinIdentificadores(tesisCompuesta(inf))
  const invalida = sano(f.que_la_invalidaria as string)
  const riesgo = bloque(inf, 'riesgo')
  const varas = bloque(inf, 'varas')
  const fund = bloque(inf, 'fundamentales')
  const onchain = bloque(inf, 'onchain')
  const linea = `${inf.simbolo} · ${inf.nombre}${inf.cadena ? ` · ${inf.cadena}` : ''}`
  const refe = ref?.precio_usd ? `Precio de referencia: ${precio(ref.precio_usd)} (${fecha(ref.fecha ?? '')}).` : ''

  const puntos = [fund, varas, riesgo, onchain].filter(Boolean).map((t) => `· ${t}`)
  const crudas: { clave: string; titulo: string; para: string; texto: string }[] = [
    {
      clave: 'ficha', titulo: 'Ficha corta', para: 'Para un mensaje o un pie de imagen',
      texto: [linea, '', titular, '', refe].filter((x) => x !== undefined).join('\n').trim(),
    },
    {
      clave: 'puntos', titulo: 'Los puntos del informe', para: 'Para un hilo o una publicación larga',
      texto: [linea, '', ...puntos, '', invalida ? `Lo que cambiaría la lectura: ${invalida}` : ''].filter(Boolean).join('\n').trim(),
    },
    {
      clave: 'riesgo', titulo: 'La línea de riesgo', para: 'Para acompañar cualquier pieza',
      texto: riesgo || '',
    },
  ]
  return crudas.filter((p) => p.texto).map((p) => ({ ...p, reparos: revisarParaPublicar(p.texto) }))
}

export function Contenido() {
  const [filas, setFilas] = useState<FilaBandeja[] | null>(null)
  const [id, setId] = useState<string | null>(null)
  const [inf, setInf] = useState<Informe | null>(null)
  const [cargando, setCargando] = useState(false)
  const [copiada, setCopiada] = useState<string | null>(null)

  useEffect(() => {
    api<{ filas: FilaBandeja[] }>('/api/admin/bandeja')
      .then((d) => setFilas(d.filas.filter((f) => f.publicacion.estado === 'aprobado')), () => setFilas([]))
  }, [])

  useEffect(() => {
    if (!id) { setInf(null); return }
    setCargando(true)
    api<{ informe: Informe }>(`/api/admin/bandeja/${id}`)
      .then((d) => setInf(d.informe), () => setInf(null))
      .finally(() => setCargando(false))
  }, [id])

  const piezas = useMemo(() => (inf ? componer(inf) : []), [inf])
  const conReparos = piezas.filter((p) => p.reparos.length).length

  const copiar = async (p: Pieza) => {
    try { await navigator.clipboard.writeText(p.texto); setCopiada(p.clave); setTimeout(() => setCopiada(null), 2200) } catch { /* sin permiso */ }
  }
  const bajar = (p: Pieza) => {
    const b = new Blob([p.texto], { type: 'text/plain;charset=utf-8' })
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u; a.download = `${inf?.simbolo ?? 'veta'}-${p.clave}.txt`; a.click()
    URL.revokeObjectURL(u)
  }

  return (
    <>
      <AdminCab
        eyebrow="Mesa · Contenido"
        titulo={<>Piezas listas, desde lo que ya aprobaste.</>}
        lead="Se arman con el texto de cliente que ya escribe el sistema de análisis, sin llamar a ningún modelo: ninguna cifra puede salir inventada. Cada pieza se revisa igualmente antes de que la copies."
        tiles={[
          { k: 'Informes aprobados', v: filas ? num(filas.length) : '—' },
          { k: 'Piezas de este informe', v: inf ? String(piezas.length) : '—', tono: 'hueso' },
          { k: 'Con algo que revisar', v: inf ? String(conReparos) : '—', tono: conReparos ? 'rojo' : 'esm' },
        ]}
      />

      <div className="shell a-cont">
        <section className="a-cont__eleccion" aria-labelledby="a-cont-e">
          <h2 id="a-cont-e" className="mono a-sec__k">De qué informe</h2>
          {!filas ? <Loader size={48} label="Cargando" />
            : !filas.length ? <EmptyState kind="vacio" title="Todavía no hay informes aprobados." detail="Las piezas salen sólo de lo aprobado en la bandeja." />
            : (
              <ul className="a-cont__lista">
                {filas.map((f) => (
                  <li key={f.id}>
                    <button type="button" className={`a-cont__item ${id === f.id ? 'is-activo' : ''}`} onClick={() => setId(f.id)}>
                      <b className="mono">{f.simbolo}</b>
                      <span>{f.nombre}</span>
                      <i className="mono">{f.tipo === 'gema' ? 'gema' : 'análisis'}</i>
                      <span className="a-cont__fecha mono">{fecha(String(f.escrito_en))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="a-cont__piezas" aria-live="polite">
          {cargando && <Loader size={60} label="Armando" />}
          {!cargando && !inf && <p className="p-nota">Elige un informe y aquí salen sus piezas.</p>}
          {!cargando && inf && !piezas.length && (
            <EmptyState kind="sin-datos" title="Este informe no da para una pieza limpia." detail="Todo su texto quedó descartado por la revisión. No se publica nada a medias." />
          )}
          {!cargando && piezas.map((p) => (
            <article key={p.clave} className={`a-pieza ${p.reparos.length ? 'is-reparo' : ''}`}>
              <header className="a-pieza__cab">
                <div>
                  <h3 className="display">{p.titulo}</h3>
                  <span className="mono a-pieza__para">{p.para}</span>
                </div>
                <div className="a-pieza__botones">
                  <button type="button" className="btn btn--ghost" onClick={() => bajar(p)}>Descargar</button>
                  <button type="button" className="btn" onClick={() => copiar(p)}>{copiada === p.clave ? 'Copiado' : 'Copiar'}</button>
                </div>
              </header>
              <pre className="a-pieza__texto">{p.texto}</pre>
              {p.reparos.length > 0 && (
                <div className="a-pieza__reparos">
                  <span className="mono">Revisa antes de publicar</span>
                  <ul>
                    {p.reparos.map((r, i) => (
                      <li key={i}><b>{r.que}</b><code className="mono">{r.donde}</code></li>
                    ))}
                  </ul>
                  <p>Edítalo tú al pegarlo. No lo corregimos solos: un texto que se publica fuera no se toca a ciegas.</p>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </>
  )
}
