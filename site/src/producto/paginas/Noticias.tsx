import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cabecera } from '../Shell'
import { Cargando, PlanBadge } from '../piezas'
import { useDatos, api, invalidarDatos } from '../../lib/datos'
import { useRol } from '../../lib/acceso'
import { fecha, fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'

/* ============================================================================
   Noticias y agenda.

   Tres bloques, en este orden: lo que pasó hoy, lo que viene, y cómo se movió
   el mercado en la última pasada.

   El recorte lo decide el servidor: a quien no tiene plan le llegan el titular
   y la primera línea, y nada más. Aquí no se oculta con CSS lo que ya viajó:
   lo que no está en la respuesta no está en la página.
   ========================================================================== */

interface Fuente { url: string; medio: string; fecha: string; cita?: string }
interface Pieza {
  id: string; titular: string; que_paso: string
  por_que_importa?: string; conclusion?: string
  monedas?: string[]; fuentes?: Fuente[]; publicada_en: string
  despublicada?: boolean; recorte?: 'sin_plan'
}
interface Evento {
  id: string; fecha: string; tipo: string; simbolo: string | null
  que: string; hora_utc?: string; fuente_url?: string
  escenario_condicional?: { si: string; entonces: string }
  recorte?: 'sin_plan'
}
interface Movimientos {
  calculado_en: string | null
  agregado: Record<string, unknown> | null
  n: number
  monedas: { simbolo: string; nombre?: string; var_24h?: number }[]
  recorte: 'solo_pro' | null
}
interface Respuesta {
  completo: boolean
  piezas: Pieza[]
  agenda: Evento[]
  movimientos: Movimientos | null
  hay_agenda: boolean
}

/** La llamada a suscribirse. Se enseña una sola vez, no una por pieza. */
function Cerrojo({ que }: { que: string }) {
  const { rol } = useRol()
  return (
    <div className="p-puerta p-puerta--base" role="note">
      <span className="p-puerta__linea" aria-hidden="true" />
      <img className="p-puerta__piedra" src="/img/vacio/intacta-480.webp" alt="" width={52} height={52} loading="lazy" decoding="async" draggable={false} />
      <div className="p-puerta__cuerpo">
        <p className="p-puerta__que">{que}</p>
        <p className="p-puerta__plan"><PlanBadge rol="base" compacto /><span className="mono">o superior</span></p>
        <div className="p-puerta__acciones">
          {rol === 'visitante' && <Link to="/entrar?volver=%2Fnoticias" className="btn btn--ghost">Entrar</Link>}
          <Link to="/precios" className="btn">Ver los planes</Link>
        </div>
      </div>
    </div>
  )
}

function Cifra({ v }: { v?: number }) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const pct = v * 100
  return <span className={`mono ${pct >= 0 ? 'es-si' : 'es-no'}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)} %</span>
}

function PiezaCard({ p, esAdmin, onCambio }: { p: Pieza; esAdmin: boolean; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const recortada = p.recorte === 'sin_plan'
  const accion = async (a: 'despublicar' | 'republicar') => {
    setOcupado(true)
    try { await api(`/api/admin/noticias/${p.id}/${a}`, { cuerpo: {} }); invalidarDatos(); onCambio() }
    finally { setOcupado(false) }
  }
  return (
    <article className={`n-pieza ${p.despublicada ? 'n-pieza--fuera' : ''}`}>
      <header className="n-pieza__cab">
        <p className="mono n-pieza__meta">
          {fechaHora(p.publicada_en)}
          {p.monedas?.length ? <> · {p.monedas.join(' · ')}</> : null}
          {p.despublicada && <span className="n-pieza__fuera-marca"> · despublicada</span>}
        </p>
        <h2 className="display n-pieza__titular">{p.titular}</h2>
      </header>

      <p className="n-pieza__texto">{p.que_paso}</p>

      {recortada ? (
        <p className="n-pieza__corte mono">La lectura completa es del plan Base</p>
      ) : (
        <>
          {p.por_que_importa && (
            <div className="n-pieza__bloque">
              <span className="mono n-pieza__k">Por qué importa</span>
              <p className="n-pieza__texto">{p.por_que_importa}</p>
            </div>
          )}
          {p.conclusion && (
            <div className="n-pieza__bloque n-pieza__bloque--cierre">
              <span className="mono n-pieza__k">Nuestra lectura</span>
              <p className="n-pieza__texto">{p.conclusion}</p>
            </div>
          )}
          {!!p.fuentes?.length && (
            <ul className="n-fuentes">
              {p.fuentes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer nofollow">{f.medio}</a>
                  <span className="mono">{fecha(f.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {esAdmin && (
        <div className="n-pieza__admin">
          <button type="button" className="btn btn--ghost" disabled={ocupado}
            onClick={() => accion(p.despublicada ? 'republicar' : 'despublicar')}>
            {p.despublicada ? 'Volver a publicar' : 'Despublicar'}
          </button>
        </div>
      )}
    </article>
  )
}

function Agenda({ eventos, hayFichero }: { eventos: Evento[]; hayFichero: boolean }) {
  if (!hayFichero) {
    return <p className="p-nota">La agenda se publica en cuanto el rastreo la deje lista.</p>
  }
  if (!eventos.length) {
    return <p className="p-nota">No hay eventos datados por delante.</p>
  }
  return (
    <ol className="n-agenda">
      {eventos.map((e) => (
        <li key={e.id} className="n-agenda__ev">
          <div className="n-agenda__cuando">
            <b className="mono">{fecha(e.fecha)}</b>
            {e.hora_utc && <span className="mono n-agenda__hora">{e.hora_utc} UTC</span>}
          </div>
          <div className="n-agenda__que">
            <p className="n-agenda__titulo">
              {e.que}
              {e.simbolo && <span className="mono n-agenda__sym"> · {e.simbolo}</span>}
            </p>
            {e.escenario_condicional
              ? <p className="n-agenda__esc">{e.escenario_condicional.entonces}</p>
              : e.recorte === 'sin_plan'
                ? <p className="n-agenda__esc n-agenda__esc--corte mono">El escenario es del plan Base</p>
                : null}
            {e.fuente_url && <a className="mono n-agenda__fuente" href={e.fuente_url} target="_blank" rel="noopener noreferrer nofollow">fuente</a>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Movimientos({ m }: { m: Movimientos }) {
  const ag = m.agregado ?? {}
  const n = typeof ag.n_monedas === 'number' ? ag.n_monedas : m.n
  const anomalo = typeof ag.por_volumen_anomalo === 'number' ? ag.por_volumen_anomalo : null
  return (
    <div className="n-mov">
      <p className="n-mov__resumen">
        <b className="mono">{n}</b> monedas se movieron en la última pasada
        {anomalo !== null && <> · <b className="mono">{anomalo}</b> con volumen fuera de lo suyo</>}
        {typeof ag.umbral_volumen === 'string' && <span className="mono n-mov__umbral"> ({ag.umbral_volumen})</span>}
      </p>
      {m.recorte === 'solo_pro'
        ? <p className="n-mov__corte mono">La lista con nombres es del plan Pro</p>
        : (
          <ul className="n-mov__lista">
            {m.monedas.map((x) => (
              <li key={x.simbolo}><b className="mono">{x.simbolo}</b><Cifra v={x.var_24h} /></li>
            ))}
          </ul>
        )}
      {m.calculado_en && <p className="p-nota mono">Calculado {fechaHora(m.calculado_en)}</p>}
    </div>
  )
}

export function Noticias() {
  const { rol } = useRol()
  const [recarga, setRecarga] = useState(0)
  const st = useDatos<Respuesta>(`/api/contenido/noticias?r=${recarga}`)
  const esAdmin = rol === 'admin'

  return (
    <>
      <Cabecera
        eyebrow="Noticias"
        titulo={<>Lo que pasó hoy, y <em>qué significa</em>.</>}
        lead="Cada pieza se publica con sus fuentes, y sus cifras se comprueban contra nuestros propios datos antes de salir."
      />
      <Cargando st={st}>
        {(d) => (
          <>
            {!d.completo && (
              <div className="shell">
                <Cerrojo que="La lectura completa de cada noticia y los escenarios de la agenda." />
              </div>
            )}

            <section className="shell n-seccion" aria-labelledby="n-hoy">
              <h2 id="n-hoy" className="mono n-seccion__k">Hoy</h2>
              {d.piezas.length
                ? <div className="n-lista">{d.piezas.map((p) => <PiezaCard key={p.id} p={p} esAdmin={esAdmin} onCambio={() => setRecarga((x) => x + 1)} />)}</div>
                : <EmptyState kind="sin-datos" title="Hoy no hay pieza publicada." detail="El rastreo corre cada día: cuando algo pasa el control, aparece aquí." />}
            </section>

            <section className="shell n-seccion" aria-labelledby="n-agenda">
              <h2 id="n-agenda" className="mono n-seccion__k">Lo que viene</h2>
              <Agenda eventos={d.agenda} hayFichero={d.hay_agenda} />
            </section>

            {d.movimientos && (
              <section className="shell n-seccion" aria-labelledby="n-mov">
                <h2 id="n-mov" className="mono n-seccion__k">Cómo se movió el mercado</h2>
                <Movimientos m={d.movimientos} />
              </section>
            )}
          </>
        )}
      </Cargando>
    </>
  )
}
