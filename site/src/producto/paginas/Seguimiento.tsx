import { Link } from 'react-router-dom'
import { llano, fuenteDeCliente, prosaDeCliente } from '../../lib/lenguaje'
import { Cabecera, Exportar } from '../Shell'
import { Cargando, Puerta, EstadoTesisBadge, TierBadge, Dato, Adv, Avanzado } from '../piezas'
import { useBenchmark, useGemas, useSeguimiento } from '../../lib/datos'
import { useRol, puede } from '../../lib/acceso'
import { dias, fecha, fechaHora, frases, pct, precio, conUnidad, CAMPO_LABEL, DIRECCION_LABEL, DIRECCION_SIGNO, MOTIVO_BENCHMARK_LABEL } from '../../lib/formato'
import type { BenchmarkDef, BenchmarkDetalle, EvaluacionInvalidacion, Informe, SeguimientoDiario } from '../../lib/contrato'
import { EmptyState } from '../../ui/EmptyState'
import { MarcadorAgregado, MarcadorPersonal } from '../marcador'

/* ============================================================================
   Seguimiento de gemas — el estado de cada tesis publicada, día a día.

   Lo que se muestra sale del registro de seguimiento_diario del motor. Desde
   el Sprint 6 la condición de invalidación llega como campos
   (`evaluacion_invalidacion`: valor, umbral, dirección, unidad, cumple) y los
   benchmarks con su detalle (`medible`, `motivo_codigo`). La web formatea el
   número con la unidad del contrato; no compara ni calcula: `cumple` lo dice
   el motor, y `null` significa "no se pudo medir", que no es un "no". Los
   registros anteriores a 5.1 caen al texto de la nota.
   ========================================================================== */

/** El campo del motor por su nombre llano dentro de una frase. */
const llanoCampo = (t: string, campo: string) => llano((t || '').split(campo).join(CAMPO_LABEL[campo] ?? campo))

function Benchmark({ k, nombre, valor, detalle, motivo }: { k: string; nombre: string; valor: number | null; detalle?: BenchmarkDetalle; motivo?: string }) {
  const medible = detalle ? detalle.medible : valor !== null
  // Lo que no se pudo medir no se enseña: una casilla vacía no informa, resta.
  if (!medible) return null
  const why = detalle ? (MOTIVO_BENCHMARK_LABEL[detalle.motivo_codigo] ?? detalle.motivo_codigo) : undefined
  return (
    <div className="p-bench__b">
      <span className="mono">{k} · {nombre}</span>
      {!medible ? (
        <>
          <span className="p-bench__v is-nomedible">No medible</span>
          {why && <p className="p-bench__why"><span className="mono p-bench__codigo">{why}</span>{detalle?.motivo_texto && detalle.motivo_texto !== why ? ` · ${detalle.motivo_texto}` : ''}</p>}
          {!detalle && motivo && <p className="p-bench__why">{motivo}</p>}
        </>
      ) : (
        <>
          <span className="p-bench__v num">{pct(detalle ? detalle.valor : valor, 1, true)}</span>
          {/* La cadena con la que el motor pide el dato no es una explicación.
              Se cuenta en palabras; la original queda en avanzado, para auditar. */}
          {detalle?.fuente && <p className="p-bench__why">{fuenteDeCliente(detalle.fuente) || null}</p>}
          {detalle?.fuente && <Avanzado><p className="p-nota mono p-bench__crudo">{detalle.fuente}</p></Avanzado>}
        </>
      )}
    </div>
  )
}

/** Valor actual contra umbral, tal como el motor los midió. `cumple` es del motor. */
function Evaluacion({ ev }: { ev: EvaluacionInvalidacion }) {
  const campo = CAMPO_LABEL[ev.campo] ?? ev.campo
  if (!ev.evaluable || ev.cumple === null) {
    return (
      <div className="p-eval p-eval--nomedible">
        <span className="p-eval__k mono">{campo} · sin evaluar</span>
        <p>{llanoCampo(ev.motivo, ev.campo) || 'no se pudo medir el observable'}</p>
        <p className="p-eval__regla mono">Un dato ausente no cuenta a favor: no es un "no se activó".</p>
      </div>
    )
  }
  return (
    <div className={`p-eval ${ev.cumple ? 'p-eval--activada' : ''}`}>
      <div className="p-eval__grid">
        <div className="p-eval__c"><span className="mono">{campo} hoy</span><span className="num p-eval__v">{conUnidad(ev.valor, ev.unidad)}</span></div>
        <span className="p-eval__op num" aria-label={DIRECCION_LABEL[ev.direccion] ?? ev.direccion}>{ev.cumple ? DIRECCION_SIGNO[ev.direccion] : DIRECCION_SIGNO[ev.direccion] === '<' ? '≥' : '≤'}</span>
        <div className="p-eval__c"><span className="mono">la invalida si queda {DIRECCION_LABEL[ev.direccion] ?? ev.direccion}</span><span className="num p-eval__v">{conUnidad(ev.umbral, ev.unidad)}</span></div>
      </div>
      <p className="p-eval__lectura">{llanoCampo(ev.motivo, ev.campo)}</p>
      <span className="p-eval__meta">{fuenteDeCliente(ev.fuente) || 'medido por nosotros'} · {fechaHora(ev.timestamp)}</span>
      <Avanzado><span className="p-eval__meta mono">{ev.fuente}</span></Avanzado>
    </div>
  )
}

function FichaSeguimiento({ g, s }: { g: Informe; s: SeguimientoDiario }) {
  const { rol } = useRol()
  const estructurado = Boolean(s.evaluacion_invalidacion)
  const lectura = estructurado ? [] : frases(s.nota)
  const b1 = lectura.find((x) => x.startsWith('B1'))
  const b2 = lectura.find((x) => x.startsWith('B2'))
  const resto = lectura.filter((x) => !x.startsWith('B1') && !x.startsWith('B2'))
  const inv = g.invalidacion
  const tono = s.retorno_desde_publicacion === null ? 'mudo' : s.retorno_desde_publicacion >= 0 ? 'pos' : 'neg'

  return (
    <article className="p-card p-seg__card">
      <div className="p-seg__col">
        <header className="p-card__head">
          <Link to={`/gemas/${g.id}`} className="p-card__sym">{g.simbolo}</Link>
          <span className="p-card__nombre">{g.nombre}</span>
          <TierBadge tier={g.tier} />
          <EstadoTesisBadge estado={s.estado_tesis} />
        </header>
        <div className="p-datos">
          <Dato k="Precio hoy" v={precio(s.precio)} sub={<>{fecha(s.fecha)} · publicada a {precio(g.ficha_esencial.precio_y_fecha_referencia.precio_usd)}</>} />
          <Dato k="Retorno desde publicación" v={pct(s.retorno_desde_publicacion, 1, true)} tono={tono} sub={<>desde {fecha(g.fecha_publicacion)}</>} />
          <Dato k="Días al cierre" v={dias(s.dias_al_cierre)} sub="el horizonte se fijó al publicar y no se mueve" />
          <Dato k="Catalizador" v={s.catalizador_estado} tono="mudo" sub={g.ficha_esencial.catalizadores.length ? `${g.ficha_esencial.catalizadores.length} identificados` : 'ninguno identificado'} />
        </div>
        <div className="p-seg__inv">
          <span className="mono" style={{ color: 'var(--rojo-luz)' }}>Condición de invalidación {s.invalidacion_activada ? '· ACTIVADA' : '· no activada'}</span>
          {inv?.evaluable
            ? <p><span className="num" style={{ color: 'var(--hueso)' }}>{CAMPO_LABEL[inv.campo] ?? inv.campo} {DIRECCION_LABEL[inv.direccion] ?? inv.direccion} {conUnidad(inv.umbral, inv.unidad)}</span>{inv.ventana_dias ? <span style={{ color: 'var(--ceniza-2)' }}> · ventana {dias(inv.ventana_dias)}</span> : null}</p>
            : <p>{g.ficha_esencial.que_la_invalidaria}</p>}
          {s.evaluacion_invalidacion && <Evaluacion ev={s.evaluacion_invalidacion} />}
          {resto.length > 0 && (
            <ul className="p-seg__lectura" aria-label="Lectura del día">
              {resto.map((x, i) => <li key={i} className={/no se pudo|SIN EVALUAR/i.test(x) ? 'is-nomedible' : ''}>{x}</li>)}
            </ul>
          )}
        </div>
      </div>
      <div className="p-seg__col">
        <span className="mono" style={{ color: 'var(--ceniza-2)' }}>Contra los benchmarks · mismo período</span>
        <div className="p-bench">
          <Benchmark k="B1" nombre="canasta del universo" valor={s.benchmark_canasta} detalle={s.benchmark_canasta_detalle} motivo={b1?.replace(/^B1 no medible:\s*/i, '')} />
          <Benchmark k="B2" nombre="regla 20/50" valor={s.benchmark_regla_simple} detalle={s.benchmark_regla_simple_detalle} motivo={b2?.replace(/^B2 no medible:\s*/i, '')} />
        </div>
        {puede(rol, 'alertas') && (
          <div className="p-alertas">
            <span className="mono">Alertas en tiempo real</span>
            {s.invalidacion_activada
              ? <>Invalidación activada el {fecha(s.invalidacion_fecha)}.</>
              : <>Sin alertas: la invalidación no se activó y no hay gatillo disparado en este registro.</>}
          </div>
        )}
      </div>
    </article>
  )
}

function ComoSeMide({ b }: { b: BenchmarkDef }) {
  return (
    <section className="p-seccion" aria-label="Cómo se mide">
      <div className="p-seccion__head">
        <h2 className="p-seccion__titulo">Cómo se mide</h2>
        <span className="mono p-seccion__calidad">definición {b.estado} · {fecha(b.congelado_en)}</span>
      </div>
      <p className="p-nota">{b.por_que}</p>
      <div className="p-varas" style={{ marginTop: 16 }}>
        <div className="p-vara">
          <div className="p-vara__h"><h3>{llano(b.b1.nombre)}</h3></div>
          <dl className="p-kv">
            <dt>universo</dt><dd>{llano(String(b.b1.universo ?? ''))}</dd>
            <dt>ponderación</dt><dd>{llano(String(b.b1.ponderacion ?? ''))}</dd>
            <dt>tope</dt><dd className="num">{b.b1.n_maximo} monedas</dd>
            <dt>si falta una</dt><dd>{String(b.b1.que_pasa_si_falta_una ?? '')}</dd>
          </dl>
          {b.b1.decidido_por_pablo && <p className="p-nota p-nota--regla">Decidido: {llano(String(b.b1.decidido_por_pablo))}</p>}
        </div>
        <div className="p-vara">
          <div className="p-vara__h"><h3>{llano(b.b2.nombre)}</h3></div>
          <dl className="p-kv">
            <dt>regla</dt><dd>{llano(String(b.b2.regla ?? ''))}</dd>
            <dt>posición</dt><dd>{llano(String(b.b2.posicion ?? ''))}</dd>
            <dt>parámetros</dt><dd className="num">{b.b2.parametros.rapida_dias} / {b.b2.parametros.lenta_dias} días</dd>
            <dt>evaluación</dt><dd>{String(b.b2.evaluacion ?? '')}</dd>
          </dl>
          {b.b2.decidido_por_pablo && <p className="p-nota p-nota--regla">Decidido: {llano(String(b.b2.decidido_por_pablo))}</p>}
        </div>
        <div className="p-varas__regla">{b.medicion?.precio ? `los tres retornos se miden sobre ${b.medicion.precio}` : 'cierre diario'}</div>
      </div>
    </section>
  )
}

const CAB_SEG = {
  titulo: <>Qué pasó con cada tesis.</>,
  lead: 'Cada gema se mide contra su propia condición de invalidación y contra dos benchmarks congelados de antemano. Cuando algo no se puede medir, se dice por qué.',
}

/** Una tesis retirada del seguimiento (contrato §17.1): no se borra. Resultado congelado el día del retiro. */
function FichaRetirada({ s }: { s: SeguimientoDiario & { retirada_en: string | null; motivo_retiro?: string } }) {
  const simbolo = String(s.gema_id).split('-')[0]
  const motivo = prosaDeCliente(s.motivo_retiro ?? '')
  return (
    <article className="p-card p-seg__card p-seg__card--retirada">
      <header className="p-card__head">
        <span className="p-card__sym">{simbolo}</span>
        <span className="mono p-seg__retirada">Retirada del seguimiento{s.retirada_en ? ` el ${fecha(s.retirada_en)}` : ''}</span>
      </header>
      <div className="p-datos">
        <Dato k="Resultado desde la publicación" v={pct(s.retorno_desde_publicacion, 1, true)} sub={<>congelado el día del retiro · {fecha(s.fecha)}</>} />
      </div>
      {motivo && <p className="body-muted" style={{ margin: '8px 0 0' }}>{motivo}</p>}
    </article>
  )
}

export function Seguimiento() {
  const { rol } = useRol()
  const abierto = puede(rol, 'seguimiento')
  const gemas = useGemas()
  const seg = useSeguimiento(abierto)
  const bench = useBenchmark(abierto)
  // Sin plan: la puerta, sin pedirle al servidor lo que va a negar.
  if (!abierto) {
    return (
      <>
        <Cabecera eyebrow="Seguimiento" titulo={CAB_SEG.titulo} lead={CAB_SEG.lead} />
        <div className="shell">
          <MarcadorAgregado visitante />
          <Puerta seccion="seguimiento" que="El seguimiento diario de cada gema, con su condición de invalidación y sus dos benchmarks, es contenido del plan Base. El marcador de arriba es gratis: es la evidencia de que se mide." />
        </div>
      </>
    )
  }
  return (
    <Cargando st={gemas}>
      {(gs) => (
        <Cargando st={seg}>
          {({ ultimo }) => (
            <>
              <Cabecera
                eyebrow={<>Seguimiento · {ultimo.length} tesis en seguimiento</>}
                titulo={<>Qué pasó con cada tesis.</>}
                lead="Cada gema se mide contra su propia condición de invalidación y contra dos benchmarks congelados de antemano. Cuando algo no se puede medir, se dice por qué."
                acciones={<Exportar que="seguimiento" />}
              />
              <div className="shell">
                <Puerta seccion="seguimiento" que="El seguimiento diario de las gemas publicadas es contenido del plan Base.">
                  <MarcadorAgregado />
                  <MarcadorPersonal />
                  <div className="p-seg">
                    {ultimo.length === 0 && <div className="p-vacio"><EmptyState kind="vacio" title="Cada gema que publiquemos entra aquí y se mide a diario hasta su cierre." detail="Acierte o no, queda en el historial." /></div>}
                    {ultimo.map((s) => {
                      // §17.1: una retirada se queda, con su resultado congelado; su informe ya no se publica.
                      if ((s as { retirada_en?: string | null }).retirada_en !== undefined) return <FichaRetirada key={s.id} s={s as SeguimientoDiario & { retirada_en: string | null; motivo_retiro?: string }} />
                      const g = gs.find((x) => x.id === s.gema_id)
                      if (!g) return <div key={s.id} className="p-vacio"><EmptyState kind="error" title={`Registro sin gema: ${s.gema_id}`} /></div>
                      return <FichaSeguimiento key={s.id} g={g} s={s} />
                    })}
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', color: 'var(--ceniza)', fontSize: '0.84rem' }}>
                    <Adv>Cada día se vuelve a medir la cifra que invalidaría la tesis, contra la fuente que el informe declara.</Adv>
                  </ul>
                  <Cargando st={bench}>{(b) => <ComoSeMide b={b} />}</Cargando>
                </Puerta>
              </div>
            </>
          )}
        </Cargando>
      )}
    </Cargando>
  )
}
