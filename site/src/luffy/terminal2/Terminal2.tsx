import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import '../../styles/terminal2.css'
import { Seguro } from '../Seguro'
import { luffy } from '../api'
import { luffy6b, ErrorLuffy6b } from '../api6b'
import type { Spec } from '../tipos'
import { Sincronia } from '../charts/sincronia'
import { fmt, fmtFecha, fmtHora, fmtPrecio } from '../formato'
import { EmptyState } from '../../ui/EmptyState'
import { terminal2 } from './api'
import { escucharPrecio, type Bolsa, type EstadoVivo, type Tic } from './vivo'
import { Grafico2, AlVerse } from './Grafico2'
import * as G from './graficos'
import type { Capa, Cifra, Ficha2, Fila2, Filtro2, Orden2, Punto, Rango2 } from './contrato'

/* ============================================================================
   El terminal v2 (PROMPT-TERMINAL-v2-veta.md, maqueta MAQUETA-TERMINAL-v2.dc.html):
   la estrategia de análisis de Pablo en una pantalla, de arriba abajo, con datos,
   números y pocos gráficos (cada uno responde una pregunta cruzando variables). La IA
   no interpreta: la «lectura por código» son reglas.

   Columna de monedas (filtros, orden, búsqueda) · encabezado · controles comunes
   (rango, capas, comparar) · 1 Estadísticas · 2 Movimiento actual (gráfico A, con
   los derivados en detalle) · 3 Fundamento (B) · 4 Redes (C) · 5 On-chain · 6 Oportunidad.

   Lo que no hay no se oculta: va en su lugar con el motivo (`no_disponibles`).
   Cambiar de moneda es instantáneo (lo guardado primero, lo nuevo al llegar; la
   siguiente se precarga; los gráficos de abajo cargan al acercarse). ↑ ↓ cambian
   de moneda. Una tarjeta rota no rompe la vista (Seguro).
   ========================================================================== */
const FILTROS: [Filtro2, string][] = [['mis_posiciones', 'Mis posiciones'], ['caja', 'Caja'], ['candidatas', 'Candidatas'], ['vigilancia', 'Vigilancia'], ['gatillos', 'Gatillos'], ['todo', 'Todo']]
const ORDENES: [Orden2, string][] = [['vs_btc_7d', 'Fuerza contra BTC (7 d)'], ['volumen_cambio', 'Cambio de volumen (7 d vs 30 d)'], ['oi_cambio', 'Cambio de interés abierto'], ['funding', 'Funding'], ['squeeze', 'Squeeze'], ['cap', 'Capitalización']]
const RANGOS: [Rango2, string][] = [['30d', '30 D'], ['90d', '90 D'], ['6m', '6 M'], ['1y', '1 A'], ['max', 'MÁX']]
const CAPAS: [Capa, string][] = [['posiciones', 'Posiciones'], ['gatillos', 'Gatillos'], ['catalizadores', 'Catalizadores'], ['radar', 'Radar'], ['liquidaciones', 'Liquidaciones']]
const MODO: Record<string, string> = { impulso: 'impulso', squeeze: 'squeeze', pre_catalizador: 'pre-catalizador', ingresos_vs_precio: 'ingresos vs precio', base_acumulacion: 'base de acumulación', rebote_fundamento: 'rebote por fundamento', legado: 'legado' }
const modoLlano = (m: string) => MODO[m] ?? m.replace(/_/g, ' ')
/* los escenarios de la oportunidad, con los nombres de la maqueta */
const ESCENARIO: Record<string, string> = { mediana_categoria: 'Mediana de su categoría', top3_categoria: 'Top 3 de su categoría', maximo_propio: 'Su propio máximo', minimo_90d: 'Volver al mínimo de 90 d' }
const leer = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d } catch { return d } }
const guardar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin storage */ } }
const signo = (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dec).replace('.', ',')} %`)
const tonoDe = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : v > 0 ? 'is-pos' : 'is-neg')

/** Una cifra, formateada por su unidad; si falta, su motivo en el lugar del número. */
function valorCifra(c: Cifra): string {
  if (c.texto) return c.texto
  const v = c.valor
  if (v === null) return '—'
  const s = c.signo && v > 0 ? '+' : v < 0 ? '−' : ''
  const a = Math.abs(v)
  switch (c.unidad) {
    case 'pct': return `${s}${fmt(a)} %`
    case 'pp': return `${s}${fmt(a)} pp`
    case 'usd': return `${s}${fmt(a)}`
    case 'x': return `${s}${fmt(a)}×`
    case 'precio': return fmtPrecio(v)
    default: return `${s}${fmt(a)}`
  }
}
/* Binance cobra una tasa base (0,01 % cada 8 h, proporcional al intervalo) cuando no hay presión de
   ningún lado: si casi todos los intervalos están ahí, se dice, para que la franja pareja no parezca un error. */
function notaFunding(f: Ficha2): string {
  const xs = f.movimiento.derivados?.funding ?? []
  if (xs.length < 12) return ''
  const h = xs[xs.length - 1].intervalo_h ?? 8, base = 0.01 * h / 8
  const enBase = xs.filter((x) => Math.abs(x.v - base) < 1e-7).length
  return enBase / xs.length >= 0.4 ? ` ${enBase} de ${xs.length} intervalos en la tasa base (${fmt(base)} % cada ${fmt(h)} h): sin presión de ningún lado.` : ''
}
const claseTono = (c: Cifra) => { const t = c.tono ?? (c.signo && c.valor !== null ? (c.valor > 0 ? 'pos' : c.valor < 0 ? 'neg' : null) : null); return t ? `is-${t}` : '' }

function Cifras({ items, cab = false, oscura = false, prueba }: { items: Cifra[]; cab?: boolean; oscura?: boolean; prueba?: string }) {
  if (!items.length) return null
  return (
    <div className={`t2-cifras ${cab ? 't2-cifras--cab' : ''} ${oscura ? 't2-cifras--oscura' : ''}`} data-prueba={prueba}>
      {items.map((c, i) => {
        const falta = c.valor === null && !c.texto
        // el mismo motivo que la anterior no se repite (tres cifras de DefiLlama con el mismo error)
        const igual = falta && i > 0 && items[i - 1].valor === null && !items[i - 1].texto && items[i - 1].motivo === c.motivo
        return (
          <div key={c.id} className={`t2-cifra ${falta ? 'is-falta' : ''}`} data-cifra={c.id}>
            <span className="t2-cifra__l">{c.etiqueta}</span>
            <span className={`t2-cifra__v t2m ${claseTono(c)}`}>{valorCifra(c)}</span>
            {falta && c.motivo ? <span className="t2-cifra__n is-motivo" title={c.motivo}>{igual ? 'el mismo motivo' : c.motivo}</span> : c.nota ? <span className="t2-cifra__n">{c.nota}</span> : null}
          </div>
        )
      })}
    </div>
  )
}
function Seccion({ n, nombre, pregunta, lado, children, prueba }: { n: number; nombre: string; pregunta: string; lado?: ReactNode; children: ReactNode; prueba: string }) {
  return (
    <section className="t2-sec" aria-label={`${n}. ${nombre}`} data-prueba={prueba}>
      <div className="t2-sec__cab"><span className="t2-sec__n t2m">{n} · {nombre.toUpperCase()}</span><h2>{pregunta}</h2>{lado && <span className="t2-sec__lado">{lado}</span>}</div>
      {children}
    </section>
  )
}
/** Lo que no hay, en su lugar y con el motivo. */
const Falta = ({ motivo, alto }: { motivo: string; alto?: number }) => <div className="t2-falta" style={alto ? { minHeight: alto } : undefined}><span className="t2m">SIN DATOS</span><p>{motivo}</p></div>
/** Lo de `no_disponibles` de una sección que no tiene un lugar propio en la pantalla, al pie de la sección. */
const Resto = ({ items }: { items: { campo: string; motivo: string }[] }) => items.length ? <ul className="t2-resto" data-prueba="resto">{items.map((x) => <li key={x.campo}><span className="t2m">{x.campo.replace(/_/g, ' ')}</span> {x.motivo}</li>)}</ul> : null
/** La calidad del mapa de liquidaciones, por lado y tal como llega. */
function ChipCalidad({ l }: { l: NonNullable<Ficha2['movimiento']['liquidaciones']> }) {
  const lados = (['cortos', 'largos'] as const).flatMap((k) => (l.lados[k] ? [[k, l.lados[k]!] as const] : []))
  return (
    <span className="t2-chip t2-chip--oro t2m t2-calidad" data-prueba="calidad-mapa" title={l.frase ?? undefined}>
      <span>MAPA DE LIQUIDACIONES · ESTIMADO{l.calibrado ? '' : ' · SIN CALIBRAR'}</span>
      {lados.length ? lados.map(([k, c]) => <span key={k} className={c.distingue ? 'is-mejor' : 'is-azar'} data-lado={k}>{k.toUpperCase()}{c.version ? ` ${c.version}` : ''}: <em>{c.texto}</em></span>)
        : l.frase ? <span><em>{l.frase}</em></span> : null}
    </span>
  )
}

export function Terminal2() {
  const { activo } = useParams()
  const nav = useNavigate()
  const [filtro, setFiltro] = useState<Filtro2>(() => leer('luffy.t2.filtro', 'todo'))
  const [orden, setOrden] = useState<Orden2>(() => leer('luffy.t2.orden', 'vs_btc_7d'))
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<Fila2[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [hoja, setHoja] = useState(false)
  const [rango, setRango] = useState<Rango2>(() => leer('luffy.t2.rango', '90d'))
  useEffect(() => {
    let v = true; const ctl = new AbortController(); setErrorLista(null)
    const t = setTimeout(() => terminal2.lista(filtro, orden, q, ctl.signal).then((xs) => { if (v) setFilas(xs) }, (e) => { if (v && !(e instanceof DOMException)) { setErrorLista(e instanceof ErrorLuffy6b ? e.message : String(e)); setFilas((f) => f ?? []) } }), q ? 200 : 0)
    guardar('luffy.t2.filtro', filtro); guardar('luffy.t2.orden', orden)
    return () => { v = false; clearTimeout(t); ctl.abort() }
  }, [filtro, orden, q])
  useEffect(() => { guardar('luffy.t2.rango', rango) }, [rango])
  const [ultima] = useState(() => leer<string | null>('luffy.t2.ultima', null))
  const seleccion = (activo ?? ultima ?? filas?.[0]?.simbolo ?? '').toUpperCase().replace(/-USDT$/, '')
  useEffect(() => { if (seleccion) guardar('luffy.t2.ultima', seleccion) }, [seleccion])
  const indice = filas ? filas.findIndex((f) => f.simbolo === seleccion) : -1
  const irA = useCallback((d: 1 | -1) => { if (!filas?.length) return; const i = indice < 0 ? 0 : Math.min(filas.length - 1, Math.max(0, indice + d)); nav(`/luffy/terminal/${filas[i].simbolo}`) }, [filas, indice, nav])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return; if (e.key === 'ArrowDown') { e.preventDefault(); irA(1) } else if (e.key === 'ArrowUp') { e.preventDefault(); irA(-1) } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [irA])
  // la siguiente y la anterior se precargan después, para no competir con la que se está abriendo
  useEffect(() => {
    if (!filas || indice < 0) return
    const t = setTimeout(() => { for (const f of [filas[indice + 1], filas[indice - 1]]) if (f) terminal2.precargar(f.simbolo, rango) }, 1500)
    return () => clearTimeout(t)
  }, [filas, indice, rango])
  useEffect(() => { setHoja(false) }, [activo])

  return (
    <div className="t2">
      <aside className={`t2-lista ${hoja ? 'is-open' : ''}`} aria-label="Monedas">
        <div className="t2-lista__cab t2m"><span>Monedas</span><button type="button" className="lf-lab__cerrar" onClick={() => setHoja(false)} aria-label="Cerrar">×</button></div>
        <label className="t2-campo"><span className="t2m">BUSCAR</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker o nombre" aria-label="Buscar moneda" /></label>
        <div className="t2-capsulas">{FILTROS.map(([k, l]) => <button key={k} type="button" className={`t2-cap ${filtro === k ? 'is-on' : ''}`} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l.toUpperCase()}</button>)}</div>
        <label className="t2-campo"><span className="t2m">ORDENAR POR</span><select value={orden} onChange={(e) => setOrden(e.target.value as Orden2)}>{ORDENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {errorLista && <p className="t2-error">{errorLista}</p>}
        <div className="t2-filas" role="listbox" aria-label="Monedas">
          {filas?.map((f) => (
            <Link key={f.simbolo} to={`/luffy/terminal/${f.simbolo}`} className={`t2-fila ${f.simbolo === seleccion ? 'is-activa' : ''} ${f.operable_bingx ? '' : 'no-opera'}`} role="option" aria-selected={f.simbolo === seleccion} data-prueba="moneda2" data-simbolo={f.simbolo}>
              <span className="t2-fila__a"><span><b>{f.simbolo}</b> {f.nombre && f.nombre.toUpperCase() !== f.simbolo ? <em>{f.nombre}</em> : null}</span><span className="t2m">{fmtPrecio(f.precio)}</span></span>
              <span className="t2-fila__b t2m">
                <span className="t2-fila__chips">{[...f.posiciones.map((p) => (p.origen === 'caja' ? 'CAJA' : 'POSICIÓN')), ...f.modos.map((m) => modoLlano(m).toUpperCase()), ...(f.squeeze ? [f.squeeze === 'ignicion' ? 'SQUEEZE · IGNICIÓN' : 'SQUEEZE'] : []), ...(f.gatillos ? [`${f.gatillos} GATILLO${f.gatillos > 1 ? 'S' : ''}`] : []), ...(f.operable_bingx ? [] : ['NO SE OPERA EN BINGX'])].join(' · ')}</span>
                <span className={tonoDe(f.vs_btc_7d_pct)}>vs BTC 7 d {signo(f.vs_btc_7d_pct)}</span>
              </span>
            </Link>
          ))}
          {filas && !filas.length && !errorLista && <p className="t2-nada">Nada con ese filtro.</p>}
        </div>
      </aside>
      {hoja && <button type="button" className="lf-velo" aria-label="Cerrar monedas" onClick={() => setHoja(false)} />}
      <main className="t2-main">
        {seleccion ? <Ficha key={seleccion} activo={seleccion} rango={rango} setRango={setRango} fila={filas?.find((f) => f.simbolo === seleccion) ?? null} filas={filas ?? []} abrirLista={() => setHoja(true)} />
          : filas ? <EmptyState kind={errorLista ? 'error' : 'vacio'} title={errorLista ? 'No se pudo cargar la lista.' : 'Elige una moneda.'} detail={errorLista ?? 'A la izquierda, con filtros, orden y búsqueda.'} />
          : <div className="t2-cargando"><span className="lf-gema is-latiendo" /></div>}
      </main>
    </div>
  )
}

function Ficha({ activo, rango, setRango, fila, filas, abrirLista }: { activo: string; rango: Rango2; setRango: (r: Rango2) => void; fila: Fila2 | null; filas: Fila2[]; abrirLista: () => void }) {
  const nav = useNavigate()
  const [ficha, setFicha] = useState<Ficha2 | null>(() => terminal2.guardada(activo, rango) ?? terminal2.deLaMoneda(activo))
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [capas, setCapas] = useState<Set<Capa>>(() => new Set(leer<Capa[]>('luffy.t2.capas', ['posiciones', 'gatillos', 'catalizadores', 'radar', 'liquidaciones'])))
  const [comparar, setComparar] = useState<string>(() => leer('luffy.t2.comparar', 'nada'))
  const [otra, setOtra] = useState<{ sym: string; puntos: Punto[] } | null>(null)
  const [derivados, setDerivados] = useState(false)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const sincronia = useMemo(() => new Sincronia(), [activo, rango]) // eslint-disable-line react-hooks/exhaustive-deps
  const precioVivo = useRef<G.Vivo2 | null>(null)
  useEffect(() => {
    let v = true, otraVez: ReturnType<typeof setTimeout> | null = null
    terminal2.soltar(activo)
    const traer = (fresca: boolean) => terminal2.ficha(activo, rango, { fresca }).then((f) => { if (!v) return; setFicha(f); setError(null); if (f.pendiente) otraVez = setTimeout(() => traer(true), Math.max(1, f.reintentar_en_s ?? 3) * 1000) }, (e) => { if (v && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) })
    void traer(intento > 0)
    return () => { v = false; if (otraVez) clearTimeout(otraVez) }
  }, [activo, rango, intento])
  useEffect(() => { guardar('luffy.t2.capas', [...capas]); precioVivo.current?.capas?.(capas) }, [capas])
  // el precio en vivo, del websocket público de la bolsa (no con datos de ejemplo, salvo que se pida con ?vivo=1)
  const [tic, setTic] = useState<Tic | null>(null)
  const [enVivo, setEnVivo] = useState<{ estado: EstadoVivo; bolsa: Bolsa | null }>({ estado: 'conectando', bolsa: null })
  const [latido, setLatido] = useState<'sube' | 'baja' | null>(null)
  const conVivo = !!ficha && (!ficha.simulado || new URLSearchParams(location.search).get('vivo') === '1')
  const operable = ficha?.operable_bingx ?? fila?.operable_bingx ?? true
  useEffect(() => {
    if (!conVivo) return
    setTic(null)
    let previo: number | null = null, apagar: ReturnType<typeof setTimeout> | null = null
    const fin = escucharPrecio(activo, operable ? 'bingx' : 'binance', (t) => {
      setTic(t); precioVivo.current?.alPrecio?.(t.precio)
      // un destello del color de la subida o la bajada, cuando cambia
      if (previo !== null && t.precio !== previo) { setLatido(t.precio > previo ? 'sube' : 'baja'); if (apagar) clearTimeout(apagar); apagar = setTimeout(() => setLatido(null), 700) }
      previo = t.precio
    }, (estado, bolsa) => setEnVivo({ estado, bolsa }))
    return () => { fin(); if (apagar) clearTimeout(apagar) }
  }, [activo, conVivo, operable])
  useEffect(() => { guardar('luffy.t2.comparar', comparar) }, [comparar])
  // «otra moneda»: sus cierres en el mismo rango, de su ficha (guardada o pedida)
  useEffect(() => {
    if (!comparar.startsWith('otra:')) { setOtra(null); return }
    const sym = comparar.slice(5); let v = true
    terminal2.ficha(sym, rango).then((f) => { if (v) setOtra({ sym, puntos: f.movimiento.velas.map((x) => [x.t, x.c] as Punto) }) }, () => { if (v) setOtra(null) })
    return () => { v = false }
  }, [comparar, rango])
  const cmp = useMemo(() => {
    if (!ficha) return null
    if (comparar === 'btc' && ficha.comparar.btc.length) return { puntos: ficha.comparar.btc, etiqueta: `BTC, llevado al precio de ${activo} al inicio` }
    if (comparar === 'categoria' && ficha.comparar.categoria.length) return { puntos: ficha.comparar.categoria, etiqueta: `Mediana de ${ficha.categoria ?? 'su categoría'}, llevada al precio de ${activo}` }
    if (otra && comparar === `otra:${otra.sym}`) return { puntos: otra.puntos, etiqueta: `${otra.sym}, llevada al precio de ${activo} al inicio` }
    return null
  }, [ficha, comparar, otra, activo])

  const preguntar = async () => { setAbriendo('luffy'); try { const r = await luffy6b.hiloTerminal(activo); nav(`/luffy/h/${r.hilo_id}`) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setAbriendo(null) } }
  const alLab = async (spec: Record<string, unknown> | null, titulo: string) => { if (!spec) return; setAbriendo(titulo); try { const s = await luffy.guardarSpec({ ...(spec as Spec), titulo }, titulo); nav(`/luffy/laboratorio/${s.spec_id}`) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setAbriendo(null) } }
  const BotonLab = ({ spec, titulo, id }: { spec: Record<string, unknown> | null; titulo: string; id: string }) => spec ? <button type="button" className="t2-cap t2-cap--oro" onClick={() => alLab(spec, titulo)} disabled={abriendo === titulo} data-prueba={`lab2-${id}`}>{abriendo === titulo ? 'ABRIENDO…' : 'ABRIR EN EL LABORATORIO'}</button> : null

  // cada motivo que se muestra en su lugar queda anotado; el resto de la sección va a su pie (Resto)
  const puestos = new Set<string>()
  const falta = (donde: string) => { puestos.add(donde); return ficha?.no_disponibles.find((n) => n.donde === donde)?.motivo ?? null }
  const resto = (sec: string, cifras: Cifra[][] = []) => {
    const ids = new Set(cifras.flat().map((c) => `${sec}.${c.id}`))
    return (ficha?.no_disponibles ?? []).flatMap((n) => (n.donde.startsWith(`${sec}.`) && !puestos.has(n.donde) && !ids.has(n.donde) ? [{ campo: n.donde.slice(sec.length + 1), motivo: n.motivo }] : []))
  }
  const precio = tic?.precio ?? ficha?.encabezado.precio ?? fila?.precio ?? null, cambio = tic?.cambio_pct ?? ficha?.encabezado.cambio_24h_pct ?? fila?.cambio_24h_pct ?? null
  const e = ficha?.encabezado
  const otras = filas.filter((x) => x.simbolo !== activo)
  const tel = G.esTelefono()

  return (
    <>
      <Seguro t="Encabezado">{() => (
        <section className="t2-cab" aria-label="Encabezado" data-prueba="encabezado2">
          <button type="button" className="t2-cap t2-cab__monedas" onClick={abrirLista}>MONEDAS</button>
          <div className="t2-cab__id">
            <h1>{activo}</h1>
            <span className="t2-cab__nombre">{[ficha?.nombre || fila?.nombre].filter((x) => x && x.toUpperCase() !== activo)}{ficha?.descripcion ? ` · ${ficha.descripcion}` : ''}{ficha && !ficha.operable_bingx ? <em className="t2-noopera t2m"> · NO SE OPERA EN BINGX</em> : null}</span>
            <span className={`t2-cab__precio t2m ${latido ? `is-${latido}` : ""}`}>{fmtPrecio(precio)}</span>
            <span className={`t2-cab__cambio t2m ${tonoDe(cambio)}`}>{signo(cambio)} 24 h</span>
            {conVivo && <span className={`t2-vivo t2m is-${enVivo.estado}`} data-prueba="en-vivo" title={enVivo.estado === 'vivo' ? `Precio al segundo, del websocket público de ${enVivo.bolsa === 'bingx' ? 'BingX' : 'Binance'}` : undefined}>{enVivo.estado === 'vivo' ? `EN VIVO · ${enVivo.bolsa === 'bingx' ? 'BINGX' : 'BINANCE'}` : enVivo.estado === 'conectando' ? 'CONECTANDO…' : enVivo.estado === 'pausado' ? 'EN PAUSA' : 'SIN PRECIO EN VIVO'}</span>}
          </div>
          {e && <Cifras items={e.cifras} cab prueba="cifras-cab" />}
          <div className="t2-cab__chips">
            {e?.posiciones.map((p, i) => <span key={i} className="t2-chip t2-chip--esm t2m">{p.origen === 'caja' ? 'CAJA' : 'PABLO'} · {p.estado.toUpperCase()}{p.precio_medio !== null ? ` A ${fmtPrecio(p.precio_medio)}` : ''}{p.pnl_usdt !== null ? ` · ${p.pnl_usdt >= 0 ? '+' : '−'}${fmt(Math.abs(p.pnl_usdt))} USDT` : ''}{p.simulado ? ' · SIMULADA' : ''}</span>)}
            {e && e.gatillos.length > 0 && <span className="t2-chip t2-chip--oro t2m">{e.gatillos.length} GATILLO{e.gatillos.length > 1 ? 'S' : ''}</span>}
            {e?.modos.filter((m, i, xs) => !(m.estado === 'cumple' && xs.some((o, j) => j !== i && o.modo === m.modo))).map((m) => <span key={`${m.modo}${m.version}`} className="t2-chip t2-chip--oro t2m">RADAR · {modoLlano(m.modo).toUpperCase()}{m.estado && m.estado !== 'cumple' ? ` ${m.estado.toUpperCase()}` : ''}</span>)}
            {ficha?.pendiente && <span className="t2-chip t2m">CALCULANDO LA FICHA…</span>}
            {ficha?.viejo && ficha.calculado_en && <span className="t2-chip t2m" title="El servidor la está recalculando">DATOS DE LAS {fmtHora(ficha.calculado_en)}</span>}
            <button type="button" className="t2-preguntar t2m" onClick={preguntar} disabled={abriendo === 'luffy'} data-prueba="preguntar2">{abriendo === 'luffy' ? 'ABRIENDO…' : 'PREGUNTARLE A LUFFY'}</button>
          </div>
        </section>
      )}</Seguro>

      <section className="t2-ctrl" aria-label="Controles comunes" data-prueba="controles2">
        <div className="t2-ctrl__g"><span className="t2m">RANGO</span>{RANGOS.map(([k, l]) => <button key={k} type="button" className={`t2-cap ${rango === k ? 'is-on' : ''}`} aria-pressed={rango === k} onClick={() => setRango(k)}>{l}</button>)}</div>
        <div className="t2-ctrl__g"><span className="t2m">CAPAS</span>{CAPAS.map(([k, l]) => <button key={k} type="button" className={`t2-cap ${capas.has(k) ? 'is-on' : ''}`} aria-pressed={capas.has(k)} data-capa={k} onClick={() => setCapas((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })}>{l}</button>)}</div>
        <label className="t2-ctrl__g t2-ctrl__cmp"><span className="t2m">COMPARAR CONTRA</span>
          <select value={comparar} onChange={(ev) => setComparar(ev.target.value)} data-prueba="comparar2">
            <option value="nada">Nada</option><option value="btc">BTC</option><option value="categoria">Mediana de su categoría</option>
            <optgroup label="Otra moneda">{otras.map((x) => <option key={x.simbolo} value={`otra:${x.simbolo}`}>{x.simbolo}</option>)}</optgroup>
          </select>
        </label>
        <span className="t2-ctrl__nota">Los tres gráficos comparten eje de tiempo, cruz y zoom: lo que marcas en uno se ve en los otros.</span>
      </section>

      {error && !ficha && <EmptyState kind="error" title={`No se pudo armar la ficha de ${activo}.`} detail={error} action={<button type="button" className="btn" onClick={() => { setError(null); setIntento((n) => n + 1) }} data-prueba="reintentar2">Reintentar</button>} />}
      {!ficha && !error && <div className="t2-cargando"><span className="lf-gema is-latiendo" /></div>}
      {error && ficha && <p className="t2-error">{error}</p>}

      {ficha && <>
        <Seguro t="Estadísticas">{() => (
          <Seccion n={1} nombre="Estadísticas" pregunta="Lo típico, en una mirada" prueba="sec-estadisticas">
            {falta('estadisticas') ? <Falta motivo={falta('estadisticas')!} /> : <Cifras items={ficha.estadisticas.cifras} />}
            <Resto items={resto('estadisticas', [ficha.estadisticas.cifras])} />
          </Seccion>
        )}</Seguro>

        <Seguro t="Movimiento actual">{() => (
          <Seccion n={2} nombre="Movimiento actual" pregunta="¿Quién mueve el precio y dónde está la fuerza?" prueba="sec-movimiento"
            lado={ficha.movimiento.liquidaciones ? <ChipCalidad l={ficha.movimiento.liquidaciones} /> : falta('movimiento.liquidaciones') ? <span className="t2-chip t2m" data-prueba="calidad-mapa">SIN MAPA DE LIQUIDACIONES · {falta('movimiento.liquidaciones')!.toUpperCase()}</span> : null}>
            {ficha.movimiento.velas.length ? <>
              <Grafico2 prueba="grafico-precio2" alto={tel ? 300 : 360} sincronia={sincronia} deps={[ficha, cmp]} alVivo={(v) => { precioVivo.current = v; v?.capas?.(capas); if (v && tic) v.alPrecio?.(tic.precio) }}
                construir={(el) => G.precio(el, ficha, { capas, comparar: cmp })}
                leyendaExtra={<>{capas.has('radar') && ficha.movimiento.marcas.some((x) => x.tipo === 'radar') && <span className="t2-g__s"><i className="t2-g__rombo" />Marcas del radar, al pie</span>}{ficha.movimiento.perfil.poc !== null && <span className="t2-g__s"><i className="t2-g__m" style={{ background: 'rgba(201,162,75,0.5)' }} />Mayor volumen {fmtPrecio(ficha.movimiento.perfil.poc)}</span>}</>} />
              {ficha.movimiento.liquidaciones?.frase && capas.has('liquidaciones') && <p className="t2-nota t2-nota--mapa" data-prueba="frase-mapa">Mapa de liquidaciones: {ficha.movimiento.liquidaciones.frase}</p>}
              {ficha.movimiento.delta_spot.length || ficha.movimiento.delta_futuros.length ? <AlVerse alto={150} ya><Grafico2 prueba="grafico-flujo2" alto={tel ? 130 : 150} sincronia={sincronia} deps={[ficha]} construir={(el) => G.flujo(el, ficha)}
                leyendaExtra={<>{falta('movimiento.delta_spot') && <span className="t2-g__s is-falta">sin spot: {falta('movimiento.delta_spot')}</span>}{falta('movimiento.interes_abierto') && <span className="t2-g__s is-falta">sin interés abierto: {falta('movimiento.interes_abierto')}</span>}{falta('movimiento.delta_futuros') && <span className="t2-g__s is-falta">sin futuros: {falta('movimiento.delta_futuros')}</span>}</>} /></AlVerse>
                : <Falta motivo={[falta('movimiento.delta_spot'), falta('movimiento.delta_futuros')].filter(Boolean).join(' · ') || 'sin delta del spot ni de los futuros'} alto={90} />}
            </> : <Falta motivo={falta('movimiento') ?? 'sin velas para esta moneda en el rango'} alto={300} />}
            <Cifras items={ficha.movimiento.cifras} prueba="cifras-mov" />
            <div className="t2-deriv">
              <button type="button" className="t2-cap t2-deriv__btn" aria-expanded={derivados} onClick={() => setDerivados((d) => !d)} data-prueba="ver-derivados">{derivados ? 'OCULTAR DERIVADOS EN DETALLE' : 'VER DERIVADOS EN DETALLE'}</button>
              {derivados && (ficha.movimiento.derivados ? <>
                <div className="t2-deriv__grilla" data-prueba="derivados2">
                  {([['interes', 'Dinero apalancado abierto', 'Interés abierto en USD, con su percentil de 30 días.', false], ['funding', 'Lo que pagan los apalancados', `Funding por intervalo, positivo arriba y negativo abajo.${notaFunding(ficha)}`, true], ['liquidaciones', 'Liquidaciones por lado', 'Largos y cortos liquidados por día, cada uno con su color.', false], ['largos_cortos', 'Largos contra cortos', 'Cuentas y posiciones, con la línea del 1 marcada.', false]] as [G.Derivado, string, string, boolean][]).map(([k, t, d, horas]) => (
                    <div key={k} className="t2-deriv__p"><span className="t2-deriv__t">{t}</span><span className="t2-deriv__d">{d}</span>
                      <Grafico2 prueba={`derivado-${k}`} alto={150} sincronia={sincronia} deps={[ficha]} horas={horas} construir={(el) => G.derivado(el, ficha, k)} /></div>
                  ))}
                </div>
                <span className="t2-nota">Es el panel de apalancamiento de antes, corregido: un panel por serie con su propio eje, leyendas que no tapan los datos y el valor real del funding en cada intervalo.</span>
              </> : <Falta motivo={falta('movimiento.derivados') ?? 'sin datos de derivados para esta moneda'} />)}
            </div>
            {ficha.movimiento.lectura.length > 0 && <p className="t2-lectura" data-prueba="lectura2"><b>Lectura por código:</b> {ficha.movimiento.lectura.join(' ')}</p>}
            <Resto items={resto('movimiento', [ficha.movimiento.cifras])} />
            <div className="t2-sec__pie"><BotonLab spec={ficha.movimiento.spec} titulo={`${activo}: movimiento actual`} id="movimiento" /></div>
          </Seccion>
        )}</Seguro>

        <Seguro t="Fundamento">{() => (
          <Seccion n={3} nombre="Fundamento" pregunta="¿El negocio crece más rápido que el precio, y cuánto le llega al token?" prueba="sec-fundamento">
            <div className="t2-dos">
              <div className="t2-dos__a">
                {ficha.fundamento.semanas.length ? <AlVerse alto={230}><Grafico2 prueba="grafico-fundamento2" alto={tel ? 190 : 220} sincronia={sincronia} deps={[ficha]} construir={(el) => G.fundamento(el, ficha)} /></AlVerse>
                  : <Falta motivo={falta('fundamento') ?? falta('fundamento.semanas') ?? 'DefiLlama no tiene ingresos para esta moneda'} alto={200} />}
                <Cifras items={ficha.fundamento.cifras} />
                {ficha.fundamento.captura ? <div className="t2-captura"><span className="t2m">CÓMO CAPTURA VALOR EL TOKEN</span><p>Clasificación del motor: <b>{ficha.fundamento.captura.clase.toUpperCase()}</b>.{ficha.fundamento.captura.mecanismo ? ` Mecanismo: ${ficha.fundamento.captura.mecanismo.replace(/\.\s*$/, '')}` : ''}{ficha.fundamento.captura.pct_al_token !== null ? `, con el ${fmt(ficha.fundamento.captura.pct_al_token)} % del revenue que llega al token` : ''}.{ficha.fundamento.captura.fuente ? <em className="t2m"> Fuente: {ficha.fundamento.captura.fuente}.</em> : null}</p></div>
                  : falta('fundamento.captura') ? <div className="t2-captura"><span className="t2m">CÓMO CAPTURA VALOR EL TOKEN</span><p className="is-motivo">{falta('fundamento.captura')}</p></div> : null}
              </div>
              <aside className="t2-proyecto" aria-label="Ficha del proyecto" data-prueba="proyecto2">
                <div className="t2-proyecto__cab"><span className="t2m">FICHA DEL PROYECTO</span><span className="t2m">INVESTIGADOR · SEMANAL{ficha.fundamento.proyecto?.compilado_en ? ` · ${fmtFecha(ficha.fundamento.proyecto.compilado_en)}` : ''}</span></div>
                {ficha.fundamento.proyecto?.lineas.length ? ficha.fundamento.proyecto.lineas.map((l) => <div key={l.campo} className="t2-proyecto__l"><span>{l.campo}</span><p>{l.texto}</p><em className="t2m">{[l.fuente, l.fecha ? fmtFecha(l.fecha) : null].filter(Boolean).join(' · ')}</em></div>)
                  : <p className="t2-proyecto__nada">{falta('fundamento.proyecto') ?? 'El Investigador la compila una vez por semana sólo para posiciones, caja, vigilancia y candidatas: esta moneda no está en esas listas.'}</p>}
              </aside>
            </div>
            <Resto items={resto('fundamento', [ficha.fundamento.cifras])} />
            <div className="t2-sec__pie"><BotonLab spec={ficha.fundamento.spec} titulo={`${activo}: fundamento`} id="fundamento" /></div>
          </Seccion>
        )}</Seguro>

        <Seguro t="Redes">{() => (
          <Seccion n={4} nombre="Redes, sentimiento y narrativa" pregunta="¿Entra gente real, o es ruido pagado? ¿Y cómo está el mercado?" prueba="sec-redes">
            <Cifras items={ficha.redes.mercado} oscura />
            {ficha.redes.menciones.length ? <AlVerse alto={260}>
              <Grafico2 prueba="grafico-redes2" alto={tel ? 170 : 190} sincronia={sincronia} deps={[ficha]} construir={(el) => G.redes(el, ficha)} />
              <Grafico2 prueba="grafico-tono2" alto={44} sincronia={sincronia} deps={[ficha]} construir={(el) => G.tono(el, ficha)} leyendaExtra={null} />
            </AlVerse> : <Falta motivo={falta('redes') ?? 'sin menciones registradas para esta moneda'} alto={180} />}
            <Cifras items={ficha.redes.cifras} />
            <div className="t2-bloque" data-prueba="quien-habla">
              <span className="t2-bloque__t t2m">QUIÉN HABLA DE {activo} (PERSONAS, ÚLTIMAS 24 H)</span>
              {ficha.redes.quien_habla.map((q) => <div key={q.cuenta} className="t2-voz"><b>{q.cuenta}</b><span className="t2m">{q.seguidores !== null ? `${fmt(q.seguidores)} seguidores` : ''}</span><span className={`t2m t2-tono t2-tono--${q.tono}`}>{q.tono}</span>{q.antes !== null && <span className={`t2m t2-antes ${q.antes ? 'is-antes' : ''}`}>{q.antes ? 'antes del movimiento' : 'después del movimiento'}</span>}<p>{[q.nota, q.acierto ? `Acierto histórico con nosotros: ${q.acierto}.` : null].filter(Boolean).join(' ')}</p></div>)}
              {ficha.redes.granjas.map((g) => <div key={g.nombre} className="t2-voz"><b>{g.nombre}</b><span className="t2m">granja</span><span className="t2m t2-tono t2-tono--shill">shill</span><p>{g.nota}</p></div>)}
              {!ficha.redes.quien_habla.length && !ficha.redes.granjas.length && <p className="t2-nada">{falta('redes.quien_habla') ?? 'Nadie la mencionó en las últimas 24 horas.'}</p>}
            </div>
            <Resto items={resto('redes', [ficha.redes.cifras, ficha.redes.mercado])} />
            <div className="t2-sec__pie"><BotonLab spec={ficha.redes.spec} titulo={`${activo}: redes`} id="redes" /></div>
          </Seccion>
        )}</Seguro>

        <Seguro t="On-chain">{() => (
          <Seccion n={5} nombre="On-chain y wallets" pregunta="¿Quién tiene la moneda y qué está haciendo?" prueba="sec-onchain" lado={<span className="t2-sec__nota">Entidades: diccionario propio del motor (tipos al estilo Arkham){ficha.onchain.cadena ? ` · ${ficha.onchain.cadena}` : ''}.</span>}>
            {falta('onchain') ? <Falta motivo={falta('onchain')!} /> : <>
              <Cifras items={ficha.onchain.cifras} />
              {ficha.onchain.flujo.length > 0 ? <AlVerse alto={150}><Grafico2 prueba="grafico-cadena2" alto={tel ? 110 : 130} sincronia={sincronia} deps={[ficha]} construir={(el) => G.cadena(el, ficha)} leyendaExtra={<span className="t2-g__s">mismo eje de tiempo que arriba</span>} /></AlVerse>
                : falta('onchain.flujo') ? <Falta motivo={`Flujo con exchanges: ${falta('onchain.flujo')}`} /> : null}
              <div className="t2-dos">
                <div className="t2-bloque t2-dos__a"><span className="t2-bloque__t t2m">MOVIMIENTOS GRANDES</span>
                  {ficha.onchain.movimientos.map((m, i) => <div key={i} className="t2-mov"><span className="t2m">{m.hora}</span><b>{m.entidad}</b><span className={`t2-lado--${m.lado}`}>{m.accion}</span><span className="t2m">{m.monto}</span></div>)}
                  {!ficha.onchain.movimientos.length && (falta('onchain.movimientos') ? <p className="t2-nada is-motivo">{falta('onchain.movimientos')}</p> : falta('onchain.flujo') ? <p className="t2-nada is-motivo">Llegan con el flujo diario: {falta('onchain.flujo')}</p> : <p className="t2-nada">Sin movimientos grandes en el rango.</p>)}
                </div>
                <div className="t2-bloque"><span className="t2-bloque__t t2m">WALLETS QUE SIGUES</span>
                  {ficha.onchain.wallets.map((w) => <div key={w.nombre} className="t2-wal"><span>{w.nombre}</span><span className={`t2m t2-lado--${w.lado}`}>{w.que_hizo}</span></div>)}
                  {!ficha.onchain.wallets.length && (falta('onchain.wallets') ? <p className="t2-nada is-motivo">{falta('onchain.wallets')}</p> : <p className="t2-nada">Ninguna de tus wallets tocó {activo}. Se agregan conversando con Luffy.</p>)}
                  <span className="t2-nota">Sólo lectura: seguir wallets no opera nada.</span>
                </div>
              </div>
              <Resto items={resto('onchain', [ficha.onchain.cifras])} />
            </>}
          </Seccion>
        )}</Seguro>

        <Seguro t="Oportunidad">{() => (
          <Seccion n={6} nombre="Oportunidad" pregunta="¿Cuánto espacio hay?" prueba="sec-oportunidad" lado={<span className="t2-sec__nota">Escenarios, no pronósticos: «si llegara a valer lo que vale…».</span>}>
            {ficha.oportunidad.escenarios.length ? <div className="t2-tabla" data-prueba="escenarios2"><table>
              <thead><tr><th scope="col">Si llegara a valer lo que vale…</th><th scope="col">Capitalización</th><th scope="col">Múltiplo</th><th scope="col">Ajustado por dilución</th><th scope="col">Precio implícito</th></tr></thead>
              <tbody>{ficha.oportunidad.escenarios.map((x) => { const c = x.multiplo === null ? '' : x.multiplo >= 1 ? 'is-pos' : 'is-neg'; return <tr key={x.ref}><th scope="row">{ESCENARIO[x.ref] ?? x.ref.replace(/_/g, ' ')}</th><td className="t2m">{fmt(x.cap_usd)}</td><td className={`t2m ${c}`}>{x.multiplo === null ? '—' : `${fmt(x.multiplo)}×`}</td><td className={`t2m ${c}`}>{x.multiplo_fdv === null ? '—' : `${fmt(x.multiplo_fdv)}×`}</td><td className="t2m">{fmtPrecio(x.precio)}</td></tr> })}</tbody>
            </table></div> : <Falta motivo={falta('oportunidad.escenarios') ?? 'sin comparables de su categoría'} />}
            <div className="t2-dos">
              <div className="t2-dos__a"><Cifras items={ficha.oportunidad.cifras} /></div>
              <div className="t2-bloque" data-prueba="radar-llano"><span className="t2-bloque__t t2m">EL RADAR, EN LLANO</span>
                {!ficha.oportunidad.radar.length && <p className="t2-nada">{falta('oportunidad.radar') ?? `El radar no evaluó ${activo} en sus modos.`}</p>}
                {ficha.oportunidad.radar.map((r) => <div key={r.modo} className="t2-radar"><i className={r.cumple ? 'is-on' : ''} aria-hidden="true" /><p><b>{modoLlano(r.modo)}{r.version ? ` (v${r.version})` : ''}:</b> {r.frase}</p></div>)}
              </div>
            </div>
            <Resto items={resto('oportunidad', [ficha.oportunidad.cifras])} />
          </Seccion>
        )}</Seguro>
        {ficha.calculado_en && <p className="t2-pie t2m">Calculado {fmtFecha(ficha.calculado_en, true)}{ficha.viejo ? ' · se está recalculando' : ''}</p>}
      </>}
    </>
  )
}
