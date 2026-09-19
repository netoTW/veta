import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cabecera } from '../Shell'
import { Cargando, PlanBadge } from '../piezas'
import { api, useDatos, ErrorApi, invalidarDatos } from '../../lib/datos'
import { useRol } from '../../lib/acceso'
import { useSesion } from '../../lib/sesion'
import { fecha, fechaHora, num } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import {
  Piedra, Mecha, EmbudoStrip, MetricasCandidata, EstadoGanadora, firmaDe, firmaVelada, senalLlana, materialDe, useAhora,
  type Candidata, type RespuestaVotacion, type Votacion as V,
} from '../votacion/piezasVoto'

/* ============================================================================
   Votación semanal — exclusiva del plan Pro.

   Quien es Pro ve la lista corta que quedó después de revisar mil monedas
   y vota una vez. Quien no, ve que la lista existe, cuántos votaron y cuándo
   cierra: las piedras están ahí, veladas, sin nombre. La ganadora se analiza
   y el análisis se publica para todos.
   ========================================================================== */

const useVotacion = () => useDatos<RespuestaVotacion>('/api/votacion')

export function Votacion() {
  const st = useVotacion()
  return (
    <>
      <Cabecera
        eyebrow="Votación semanal · Pro"
        titulo={<>Tú eliges qué <em>analizamos</em> esta semana</>}
        lead="Cada semana revisamos mil monedas y nos quedamos con las pocas que dieron una señal real. De ésas, cuatro o cinco entran a votación. La más votada se analiza a fondo y el análisis se publica para todos."
      />
      <Cargando st={st}>{(d) => <Cuerpo d={d} />}</Cargando>
    </>
  )
}

function Cuerpo({ d }: { d: RespuestaVotacion }) {
  const { rol } = useRol()
  const [ultimaCerrada, ...anteriores] = d.historico
  return (
    <div className="shell vt">
      {d.activa ? (
        d.puede_votar ? <Activa v={d.activa} embudo={d.embudo} /> : <ActivaVelada v={d.activa} embudo={d.embudo} ultima={ultimaCerrada} />
      ) : (
        <section className="vt-sin">
          <EmptyState kind="vacio" title="No hay votación abierta" detail={rol === 'pro' || rol === 'admin' ? 'La próxima abre cuando termine la revisión semanal de monedas. Te avisamos.' : 'Cuando abra la próxima, los socios Pro eligen qué se analiza. La ganadora se publica para todos.'} />
        </section>
      )}
      {ultimaCerrada && <Cierre v={ultimaCerrada} conLista={d.puede_votar} />}
      {anteriores.length > 0 && <Historico votaciones={anteriores} conLista={d.puede_votar} />}
      {!d.activa && !ultimaCerrada && d.embudo.bajadas && <EmbudoStrip e={d.embudo} n={0} />}
    </div>
  )
}

/* ============================ PRO: la lista y el voto ============================ */
function Activa({ v: inicial, embudo }: { v: V; embudo: RespuestaVotacion['embudo'] }) {
  const { yo } = useSesion()
  const [v, setV] = useState(inicial)
  const [elegida, setElegida] = useState<string | null>(null)
  const [fase, setFase] = useState<'reposo' | 'confirmando' | 'enviando' | 'sellando'>('reposo')
  const [error, setError] = useState<string | null>(null)
  const ahora = useAhora(1000)
  const vencida = Date.parse(v.cierra) <= ahora
  const cands = v.candidatas ?? []
  const miVoto = v.mi_voto ?? null
  const max = Math.max(0, ...cands.map((c) => c.votos))
  const lideres = max > 0 ? cands.filter((c) => c.votos === max).map((c) => c.simbolo) : []
  const puedeVotar = !miVoto && !vencida && v.estado === 'abierta'

  /* recuento en vivo: cada 12 s mientras está abierta */
  const recargar = useCallback(async () => {
    try { const d = await api<RespuestaVotacion>('/api/votacion'); if (d.activa && d.activa.id === inicial.id) setV(d.activa) } catch { /* se reintenta en el próximo tic */ }
  }, [inicial.id])
  useEffect(() => { const id = setInterval(recargar, 12000); return () => clearInterval(id) }, [recargar])

  const elegir = (s: string) => { if (!puedeVotar || fase === 'enviando' || fase === 'sellando') return; setError(null); setElegida(s); setFase('confirmando') }
  const cancelar = () => { setElegida(null); setFase('reposo') }
  const confirmar = async () => {
    if (!elegida) return
    setFase('enviando')
    try {
      await api(`/api/votacion/${v.id}/voto`, { cuerpo: { simbolo: elegida } })
      setFase('sellando')
      invalidarDatos()
      await recargar()
      setTimeout(() => { setFase('reposo'); setElegida(null) }, 2600)
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : String(e)); setFase('confirmando')
      if (e instanceof ErrorApi && (e.status === 409)) recargar()
    }
  }
  const sellando = fase === 'sellando'
  const cand = elegida ? cands.find((c) => c.simbolo === elegida) : null

  return (
    <section className={`vt-activa ${sellando ? 'is-sellando' : ''} ${miVoto ? 'is-votado' : ''}`} aria-labelledby="vt-activa-t">
      <div className="vt-activa__cab">
        <div>
          <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Semana {v.semana.slice(-2)} · {cands.length} candidatas</p>
          <h2 id="vt-activa-t" className="display vt-h2">{miVoto ? <>Tu voto ya está: <b>{miVoto.simbolo}</b></> : vencida ? 'Se cerró el plazo' : 'Elige una piedra'}</h2>
          <p className="vt-lead body-muted">
            {miVoto ? `Lo marcaste el ${fechaHora(miVoto.fecha)}. Ahora se ve cómo va el recuento; la más votada brilla.`
              : vencida ? 'El recuento se hace a mano y se anuncia en esta misma página.'
              : 'Cada piedra es una moneda que nuestro rastreo marcó. Lo que asoma en la superficie es la señal que encontramos. Toca una para leerla; vota una sola vez.'}
          </p>
        </div>
        <Mecha abre={v.abre} cierra={v.cierra} estado={v.estado} />
      </div>

      <EmbudoStrip e={embudo} n={cands.length} />

      <ol className={`vt-mesa vt-mesa--${cands.length}`} aria-label="Candidatas">
        {cands.map((c, i) => {
          const lidera = lideres.includes(c.simbolo) && v.total_votos > 0
          const mia = miVoto?.simbolo === c.simbolo
          const esElegida = elegida === c.simbolo
          const apagada = (fase !== 'reposo' && !esElegida) || (miVoto && !mia && sellando)
          return (
            <li key={c.simbolo} className={`vt-cand ${lidera ? 'is-lider' : ''} ${mia ? 'is-mia' : ''} ${esElegida ? 'is-elegida' : ''} ${apagada ? 'is-apagada' : ''} ${esElegida && sellando ? 'is-sello' : ''}`} style={{ ['--i' as string]: i }}>
              {lidera && <span className="vt-cand__lidera mono">{lideres.length > 1 ? 'empate' : 'lidera'}</span>}
              <button type="button" className="vt-cand__btn" onClick={() => elegir(c.simbolo)} disabled={!puedeVotar} aria-pressed={esElegida || mia} aria-label={`${c.simbolo} · ${c.nombre}${mia ? ' · tu voto' : ''}`}>
                <span className="vt-onda" aria-hidden="true" />
                <span className="vt-onda vt-onda--2" aria-hidden="true" />
                <Piedra firma={firmaDe(c.disparadores)} size={210} lit={lidera || mia} />
              </button>
              <div className="vt-cand__id">
                <span className="vt-cand__sym display">{c.simbolo}</span>
                <span className="vt-cand__nombre">{c.nombre}</span>
              </div>
              <ul className="vt-cand__senales" aria-label="Señales encontradas">
                {c.disparadores.map((s) => <li key={s.disparador} className={`vt-senal vt-senal--${materialDe(s.disparador)}`} title={s.detalle}><span className="vt-senal__gema" aria-hidden="true" />{senalLlana(s.disparador)}</li>)}
                {c.flags_riesgo.length > 0 && <li className="vt-senal vt-senal--rojo" title={c.flags_riesgo.join(' · ')}><span className="vt-senal__gema" aria-hidden="true" />{c.flags_riesgo.length === 1 ? '1 alerta' : `${c.flags_riesgo.length} alertas`}</li>}
              </ul>
              <div className="vt-cand__votos" aria-label={`${c.votos} votos`}>
                <span className="vt-cand__barra" aria-hidden="true"><span style={{ width: `${max ? (c.votos / max) * 100 : 0}%` }} /></span>
                <span className="vt-cand__n mono"><b>{c.votos}</b> {c.votos === 1 ? 'voto' : 'votos'}</span>
              </div>
              {mia && <span className="vt-sello mono"><span className="vt-sello__gema" aria-hidden="true" />Tu voto · {fecha(miVoto!.fecha)}</span>}
            </li>
          )
        })}
      </ol>

      {/* el momento del voto: pesa, y no se vuelve atrás */}
      <div className={`vt-confirma ${fase === 'confirmando' || fase === 'enviando' ? 'is-abierta' : ''}`} aria-live="polite">
        {cand && (fase === 'confirmando' || fase === 'enviando') && (
          <>
            <div className="vt-confirma__texto">
              <span className="vt-confirma__k mono">Tu voto</span>
              <p><b className="display">{cand.simbolo}</b> <span>{cand.nombre}</span></p>
              <p className="vt-confirma__regla">Es uno solo y no se cambia. Queda con tu nombre y la fecha.</p>
              {error && <p className="vt-confirma__error">{error}</p>}
            </div>
            <div className="vt-confirma__botones">
              <button type="button" className="btn btn--ghost" onClick={cancelar} disabled={fase === 'enviando'}>Cambiar de idea</button>
              <button type="button" className="btn vt-confirma__ok" onClick={confirmar} disabled={fase === 'enviando'}>{fase === 'enviando' ? 'Marcando…' : `Votar ${cand.simbolo}`}</button>
            </div>
          </>
        )}
      </div>

      {cand && <Lectura c={cand} />}
      {!cand && miVoto && <Lectura c={cands.find((c) => c.simbolo === miVoto.simbolo)!} />}

      <p className="vt-total mono"><b>{num(v.total_votos)}</b> {v.total_votos === 1 ? 'voto' : 'votos'} hasta ahora · recuento en vivo{yo?.usuario ? '' : ''}</p>
    </section>
  )
}

/** Lo que dijo el scanner de la candidata, en llano. */
function Lectura({ c }: { c: Candidata }) {
  return (
    <div className="vt-lectura">
      <div className="vt-lectura__cab">
        <span className="mono vt-lectura__k">Por qué está en la lista</span>
        <span className="mono vt-lectura__carril">{c.carril === 'B' ? 'proyecto joven · ' : ''}puntaje del filtro {c.puntaje}</span>
      </div>
      <p className="vt-lectura__razon">{c.razon}</p>
      <ul className="vt-lectura__detalle">
        {c.disparadores.map((s) => <li key={s.disparador}><b className={`vt-lectura__mat is-${materialDe(s.disparador)}`}>{senalLlana(s.disparador)}</b><span>{s.detalle}</span></li>)}
        {c.flags_riesgo.map((f) => <li key={f}><b className="vt-lectura__mat is-rojo">Alerta</b><span>{f}</span></li>)}
      </ul>
      <MetricasCandidata m={c.metricas} />
    </div>
  )
}

/* ============================ BASE / GRATIS: la lista velada ============================ */
function ActivaVelada({ v, embudo, ultima }: { v: V; embudo: RespuestaVotacion['embudo']; ultima?: V }) {
  const { rol } = useRol()
  const veladas = v.veladas ?? []
  return (
    <section className="vt-activa vt-activa--velada" aria-labelledby="vt-velada-t">
      <div className="vt-activa__cab">
        <div>
          <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Semana {v.semana.slice(-2)} · votación abierta</p>
          <h2 id="vt-velada-t" className="display vt-h2">Hay {v.n_candidatas} piedras sobre la mesa</h2>
          <p className="vt-lead body-muted">Son las que quedaron después de revisar {embudo.bajadas ? num(embudo.bajadas) : 'mil'} monedas. Los socios Pro las están mirando y votando cuál se analiza. Vos vas a leer el análisis de la ganadora, como todos; lo que no ves es la lista.</p>
        </div>
        <Mecha abre={v.abre} cierra={v.cierra} estado={v.estado} />
      </div>

      <EmbudoStrip e={embudo} n={v.n_candidatas} />

      <div className="vt-velo">
        <ol className={`vt-mesa vt-mesa--${veladas.length}`} aria-hidden="true">
          {veladas.map((w, i) => (
            <li key={i} className="vt-cand is-velada" style={{ ['--i' as string]: i }}>
              <span className="vt-cand__btn"><Piedra firma={firmaVelada(w)} size={210} velada /></span>
              <div className="vt-cand__id"><span className="vt-cand__sym display vt-oculto">▮▮▮▮</span><span className="vt-cand__nombre vt-oculto">▮▮▮▮▮▮▮▮</span></div>
              <ul className="vt-cand__senales">{Array.from({ length: w.n_disparadores }).map((_, k) => <li key={k} className="vt-senal vt-senal--velada"><span className="vt-senal__gema" /><span className="vt-oculto">▮▮▮▮▮▮▮▮▮</span></li>)}</ul>
            </li>
          ))}
        </ol>
        <div className="vt-puerta" role="note">
          <span className="vt-puerta__linea" aria-hidden="true" />
          <div className="vt-puerta__cuerpo">
            <p className="vt-puerta__k mono">Ver la lista y votar es Pro</p>
            <p className="vt-puerta__que">
              <b className="mono">{num(v.total_votos)}</b> {v.total_votos === 1 ? 'socio ya votó' : 'socios ya votaron'}. La lista tiene {v.n_candidatas} nombres, cada uno con la señal que disparó y sus números.
              {ultima?.ganadora && <> La semana pasada ganó <b>{ultima.ganadora}</b>{ultima.informe ? ' y su análisis ya está publicado' : ' y ya está en análisis'}.</>}
            </p>
            <p className="vt-puerta__plan"><PlanBadge rol="pro" compacto /><span className="mono">un voto por semana, con tu nombre</span></p>
            <div className="vt-puerta__acciones">
              {rol === 'visitante' && <Link to="/entrar?volver=%2Fvotacion" className="btn btn--ghost">Entrar</Link>}
              <Link to="/cuenta#plan" className="btn">Pasar a Pro</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================ el cierre: la ganadora se revela ============================ */
function Cierre({ v, conLista }: { v: V; conLista: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const [revelado, setRevelado] = useState(false)
  useEffect(() => {
    const el = ref.current?.querySelector('.vt-cierre__ganadora'); if (!el) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setRevelado(true); io.disconnect() } }, { threshold: 0.3 })
    io.observe(el); return () => io.disconnect()
  }, [])
  const cands = v.candidatas ?? []
  const gan = cands.find((c) => c.simbolo === v.ganadora)
  const otras = cands.filter((c) => c.simbolo !== v.ganadora).sort((a, b) => b.votos - a.votos)
  const veladas = (v.veladas ?? []).slice(1)
  return (
    <section ref={ref} className={`vt-cierre ${revelado ? 'is-revelado' : ''}`} aria-labelledby="vt-cierre-t">
      <div className="vt-cierre__cab">
        <p className="eyebrow mono" data-mat="esmeralda"><span className="eyebrow__mark" aria-hidden="true" />Última votación · semana {v.semana.slice(-2)}</p>
        <h2 id="vt-cierre-t" className="display vt-h2">Ganó <b>{v.ganadora ?? '—'}</b>{v.ganadora_nombre ? <span className="vt-cierre__nombre"> · {v.ganadora_nombre}</span> : null}</h2>
      </div>
      <div className="vt-cierre__escena">
        <div className="vt-cierre__ganadora">
          <span className="vt-onda vt-onda--cierre" aria-hidden="true" />
          <Piedra firma={gan ? firmaDe(gan.disparadores) : v.veladas?.[0] ? firmaVelada(v.veladas[0]) : 'triple'} size={260} lit className="vt-cierre__piedra" />
          <p className="vt-cierre__votos mono">
            {gan ? <><b>{gan.votos}</b> de {v.total_votos} {v.total_votos === 1 ? 'voto' : 'votos'}</> : <><b>{num(v.total_votos)}</b> {v.total_votos === 1 ? 'voto' : 'votos'} en total</>}
          </p>
        </div>
        <ol className="vt-cierre__otras" aria-label="Las otras candidatas">
          {conLista ? otras.map((c, i) => (
            <li key={c.simbolo} style={{ ['--i' as string]: i }}>
              <Piedra firma={firmaDe(c.disparadores)} size={96} />
              <span className="vt-cierre__osym mono">{c.simbolo}</span>
              <span className="vt-cierre__on mono">{c.votos}</span>
            </li>
          )) : veladas.map((w, i) => (
            <li key={i} className="is-velada" style={{ ['--i' as string]: i }}>
              <Piedra firma={firmaVelada(w)} size={96} velada />
              <span className="vt-cierre__osym mono vt-oculto">▮▮▮</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="vt-cierre__pie">
        <Mecha abre={v.abre} cierra={v.cierra} estado="cerrada" cerradaEn={v.cerrada_en} compacta />
        <EstadoGanadora v={v} />
      </div>
    </section>
  )
}

/* ============================ histórico ============================ */
function Historico({ votaciones, conLista }: { votaciones: V[]; conLista: boolean }) {
  return (
    <section className="vt-hist" aria-labelledby="vt-hist-t">
      <div className="p-seccion__head"><h2 id="vt-hist-t" className="display vt-h3">Anteriores</h2><span className="mono body-muted">{votaciones.length} {votaciones.length === 1 ? 'votación' : 'votaciones'}</span></div>
      <ol className="vt-hist__lista">
        {votaciones.map((v) => {
          const gan = v.candidatas?.find((c) => c.simbolo === v.ganadora)
          return (
            <li key={v.id} className="vt-hist__fila">
              <Piedra firma={gan ? firmaDe(gan.disparadores) : v.veladas?.[0] ? firmaVelada(v.veladas[0]) : 'oro'} size={56} lit />
              <div className="vt-hist__id">
                <span className="mono vt-hist__sem">Semana {v.semana.slice(-2)} · cerró {fecha(v.cerrada_en ?? v.cierra)}</span>
                <span className="vt-hist__gan display">{v.ganadora ?? '—'}{v.ganadora_nombre ? <small> {v.ganadora_nombre}</small> : null}</span>
              </div>
              <span className="mono vt-hist__votos">{gan ? `${gan.votos} de ${v.total_votos}` : num(v.total_votos)} {v.total_votos === 1 ? 'voto' : 'votos'}{conLista && v.n_candidatas ? ` · ${v.n_candidatas} candidatas` : ''}</span>
              <EstadoGanadora v={v} />
            </li>
          )
        })}
      </ol>
    </section>
  )
}
