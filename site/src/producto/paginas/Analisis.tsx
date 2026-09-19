import { Link } from 'react-router-dom'
import { Cabecera } from '../Shell'
import { Cargando, TierBadge, Advertencias } from '../piezas'
import { Cifras } from '../cifras'
import { useAnalisis } from '../../lib/datos'
import { fecha } from '../../lib/formato'
import { estadoEconomicoLlano, sinReferencias, esAnalizable, limpiarProsa } from '../../lib/lenguaje'
import type { Informe } from '../../lib/contrato'
import { EmptyState } from '../../ui/EmptyState'

/* ============================================================================
   Análisis diario — una moneda por día, con su lectura.

   El enfoque es "esta moneda la analizamos y esto encontramos", no "esta no
   clasificó". El motivo por el que no es gema sigue existiendo como dato,
   a un lado, con menos peso. La vista semanal acumula los diarios.
   Gratis para todos.
   ========================================================================== */

/** La lectura del día: sólo frases del nivel esencial del contrato, en orden. */
function lecturaDe(a: Informe) {
  const n = a.niveles
  const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '')
  return [n.fundamentales?.esencial?.texto, n.varas?.esencial?.texto, n.riesgo?.esencial?.texto, n.onchain?.esencial?.texto, n.microestructura?.esencial?.texto]
    .map((t) => limpiarProsa(t)).filter(Boolean).map((t) => cap(sinReferencias(t))).map((t) => (t.endsWith('.') ? t : t + '.'))
}

/** Semana ISO (lunes) a la que pertenece una fecha. */
function lunesDe(iso: string) {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  const dia = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dia)
  return d.toISOString().slice(0, 10)
}

function PiezaDiaria({ a }: { a: Informe }) {
  const f = a.ficha_esencial
  const lectura = lecturaDe(a)
  return (
    <article className="p-card p-diario__pieza">
      <div>
        <header className="p-card__head">
          <Link to={`/analisis/${a.id}`} className="p-card__sym">{a.simbolo}</Link>
          <span className="p-card__nombre">{a.nombre} · {a.cadena}</span>
          <span className="p-card__meta mono"><span>{fecha(a.fecha_publicacion)}</span></span>
        </header>
        <div className="p-card__head" style={{ marginBottom: 0 }}>
          <TierBadge tier={a.tier} />
          <span className="mono" style={{ color: 'var(--ceniza-2)' }}>{estadoEconomicoLlano(a.estado_economico, a.captura_verificada)}</span>
        </div>
        <p className="p-diario__lectura">{lectura.slice(0, 2).join(' ')}</p>
        <ul style={{ paddingLeft: 16, margin: 0, color: 'var(--ceniza)', fontSize: '0.9rem', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lectura.slice(2).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        <div style={{ marginTop: 14 }}><Link to={`/analisis/${a.id}`} className="p-gema__ir">Abrir el análisis completo →</Link></div>
      </div>
      <aside className="p-diario__aside">
        <Cifras inf={a} card max={4} />
        <Advertencias items={f.advertencias} compacta />
      </aside>
    </article>
  )
}

export function Analisis() {
  const st = useAnalisis()
  return (
    <Cargando st={st}>
      {(rows) => {
        // Sólo lo que tiene algo que medir. Una moneda sin ingresos ni capital depositado no
        // da un análisis que valga la pena leer, y publicarla resta.
        const analizables = rows.filter(esAnalizable)
        const orden = [...analizables].sort((a, b) => String(b.fecha_publicacion).localeCompare(String(a.fecha_publicacion)))
        const ultimo = orden[0]
        const semanas = [...new Set(orden.map((a) => lunesDe(a.fecha_publicacion)))]
        return (
          <>
            <Cabecera
              eyebrow={<>Análisis diario · {orden.length} {orden.length === 1 ? 'pieza' : 'piezas'}</>}
              titulo={<>Una moneda por día, con su lectura.</>}
              lead="Cada día tomamos una moneda y la analizamos a fondo: qué es, cómo factura, qué mueve su precio y qué tendría que pasar para que cambie la historia."
            />
            <div className="shell p-diario">
              {!ultimo && <div className="p-vacio"><EmptyState kind="vacio" title="Todavía no hay análisis publicados." /></div>}
              {ultimo && (
                <section className="p-diario__dia" aria-label="Último análisis">
                  <div className="p-grupo__head">
                    <span className="mono" style={{ color: 'var(--esmeralda-luz)' }}>{ultimo.fecha_publicacion.slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'Hoy' : 'Último análisis'} · {fecha(ultimo.fecha_publicacion)}</span>
                    <span className="p-grupo__rule" aria-hidden="true" />
                  </div>
                  <PiezaDiaria a={ultimo} />
                </section>
              )}
              {semanas.map((lunes) => {
                const lista = orden.filter((a) => lunesDe(a.fecha_publicacion) === lunes)
                return (
                  <section key={lunes} className="p-diario__dia" aria-label={`Semana del ${fecha(lunes)}`}>
                    <div className="p-grupo__head">
                      <span className="mono">Semana del {fecha(lunes)} · {lista.length} {lista.length === 1 ? 'análisis' : 'análisis'}</span>
                      <span className="p-grupo__rule" aria-hidden="true" />
                    </div>
                    <div className="p-semana">
                      {lista.map((a) => (
                        <div key={a.id} className="p-semana__fila">
                          <span className="mono" style={{ color: 'var(--ceniza-2)' }}>{fecha(a.fecha_publicacion)}</span>
                          <Link to={`/analisis/${a.id}`} className="p-card__sym">{a.simbolo}</Link>
                          <span className="p-semana__lectura">{lecturaDe(a)[0]}</span>
                          <Link to={`/analisis/${a.id}`} className="p-gema__ir">Abrir →</Link>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )
      }}
    </Cargando>
  )
}
