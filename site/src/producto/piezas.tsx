import { createContext, useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TierIcon } from '../ui/TierIcon'
import { Loader } from '../ui/Loader'
import { EmptyState } from '../ui/EmptyState'
import { planMinimo, puede, useRol, type Rol, type Seccion, PLAN_LABEL, ROL_LABEL } from '../lib/acceso'
import { ESTADO_TESIS_LABEL, TIER_LABEL, SEVERIDAD_CORTA, TIPO_ADV_LABEL, fechaHora } from '../lib/formato'
import type { Estado } from '../lib/datos'
import { SEVERIDADES, type Advertencia, type Fuente, type Severidad, type Tier } from '../lib/contrato'
import { sinReferencias, tieneCriterioInterno } from '../lib/lenguaje'

/* ============================================================================
   Piezas comunes de las pantallas de datos.
   ========================================================================== */

/* ---------- estados de carga ---------- */
export function Cargando<T>({ st, children }: { st: Estado<T>; children: (d: T) => ReactNode }) {
  if (st.estado === 'cargando') {
    return <div className="shell p-cargando"><Loader size={72} label="Cargando" /></div>
  }
  if (st.estado === 'error') {
    return (
      <div className="shell p-cargando">
        <EmptyState kind="error" title="No se pudieron cargar los datos." detail={st.error} />
      </div>
    )
  }
  return <>{children(st.datos)}</>
}

/* ---------- plan ---------- */
/** Estado de plan: gratis / base / pro / admin. La misma pieza en la barra,
    en la puerta y en el laboratorio. PRO es vidrio oscuro con borde de oro. */
export function PlanBadge({ rol, compacto = false }: { rol: Rol; compacto?: boolean }) {
  return (
    <span className={`p-plan p-plan--${rol} ${compacto ? 'p-plan--compacto' : ''} mono`} title={ROL_LABEL[rol]}>
      <span className="p-plan__dot" aria-hidden="true" />
      <span className="p-plan__k">Plan</span>
      <span className="p-plan__v">{PLAN_LABEL[rol]}</span>
    </span>
  )
}

/* ---------- acceso ---------- */
/** Puerta de acceso: si el rol no puede, muestra qué plan lo abre. La piedra
    cerrada es el contenido; el plan es lo que la abre. */
export function Puerta({ seccion, que, children, compacta = false }: { seccion: Seccion; que: string; children?: ReactNode; compacta?: boolean }) {
  const { rol } = useRol()
  if (puede(rol, seccion)) return <>{children}</>
  const plan = planMinimo(seccion)
  return (
    <div className={`p-puerta p-puerta--${plan} ${compacta ? 'p-puerta--compacta' : ''}`} role="note">
      <span className="p-puerta__linea" aria-hidden="true" />
      <img className="p-puerta__piedra" src="/img/vacio/intacta-480.webp" alt="" width={compacta ? 30 : 52} height={compacta ? 30 : 52} loading="lazy" decoding="async" draggable={false} />
      <div className="p-puerta__cuerpo">
        <p className="p-puerta__que">{que}</p>
        <p className="p-puerta__plan"><PlanBadge rol={plan} compacto />{plan !== 'admin' && <span className="mono">o superior</span>}</p>
        {!compacta && (
          <div className="p-puerta__acciones">
            {rol === 'visitante' && <Link to={`/entrar?volver=${encodeURIComponent(typeof window === 'undefined' ? '/gemas' : window.location.pathname)}`} className="btn btn--ghost">Entrar</Link>}
            <Link to="/cuenta#plan" className="btn">Ver planes</Link>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- nivel de lectura ---------- */
export type Nivel = 'esencial' | 'avanzado'
export const NivelContext = createContext<{ nivel: Nivel; setNivel: (n: Nivel) => void }>({ nivel: 'esencial', setNivel: () => {} })
export const useNivel = () => useContext(NivelContext)

export function ProveedorNivel({ children }: { children: ReactNode }) {
  const [nivel, setNivel] = useState<Nivel>('esencial')
  return <NivelContext.Provider value={{ nivel, setNivel }}>{children}</NivelContext.Provider>
}

export function SelectorNivel() {
  const { nivel, setNivel } = useNivel()
  return (
    <div className="p-nivel" role="tablist" aria-label="Nivel de lectura">
      {(['esencial', 'avanzado'] as Nivel[]).map((n) => (
        <button key={n} type="button" role="tab" aria-selected={nivel === n} className={`p-nivel__btn mono ${nivel === n ? 'is-on' : ''}`} onClick={() => setNivel(n)}>
          {n}
        </button>
      ))}
      <span className="p-nivel__nota mono">{nivel === 'esencial' ? 'lectura en una frase por sección' : 'todos los números, con fuente'}</span>
    </div>
  )
}

/** Sólo se ve en avanzado. Las advertencias NUNCA van dentro de esto. */
export function Avanzado({ children }: { children: ReactNode }) {
  const { nivel } = useNivel()
  if (nivel !== 'avanzado') return null
  return <div className="p-avanzado">{children}</div>
}

/* ---------- etiquetas ---------- */
export function TierBadge({ tier, size = 22 }: { tier: Tier; size?: number }) {
  const t = tier.toLowerCase() as 'bajo' | 'medio' | 'alto'
  return (
    <span className={`p-tier p-tier--${t} mono`}>
      <TierIcon tier={t} size={size} />
      {TIER_LABEL[tier] ?? tier}
    </span>
  )
}

export function EstadoTesisBadge({ estado }: { estado: string }) {
  const k = estado.toLowerCase()
  return <span className={`p-estado p-estado--${k} mono`}><span className="p-estado__dot" aria-hidden="true" />{ESTADO_TESIS_LABEL[estado] ?? estado}</span>
}

/* ---------- advertencias (Sprint 6: tipadas) ----------
   Regla del contrato: TIPAR NO ES ESCONDER. Se muestran todas, en ambos
   niveles; la severidad sólo ordena y marca. COMPROMETE_TESIS va primero y
   con marca roja; LIMITA_LECTURA en oro; CONTEXTO en ceniza. */
const PESO: Record<string, number> = { COMPROMETE_TESIS: 0, LIMITA_LECTURA: 1, CONTEXTO: 2 }
const sevClase = (sv?: string) => (sv ?? 'LIMITA_LECTURA').toLowerCase().replace('_', '-')
/** Orden estable por severidad: nunca se pierde ninguna. */
export const ordenar = (items: Advertencia[]) =>
  items.map((a, i) => ({ a, i })).sort((x, y) => (PESO[x.a.severidad] ?? 0) - (PESO[y.a.severidad] ?? 0) || x.i - y.i).map((x) => x.a)
export const porSeveridad = (items: Advertencia[]) =>
  Object.fromEntries(SEVERIDADES.map((sv) => [sv, items.filter((a) => a.severidad === sv).length])) as Record<Severidad, number>

/** Una advertencia: marca por severidad + tipo + texto. Acepta string por compatibilidad. */
export function Adv({ a, children, detalle = false, etiquetas = true }: { a?: Advertencia; children?: ReactNode; detalle?: boolean; etiquetas?: boolean }) {
  const sv = a?.severidad
  return (
    <li className={`p-adv p-adv--${sevClase(sv)}`}>
      <span className="p-adv__mark" aria-hidden="true" />
      <span className="p-adv__cuerpo">
        {a && etiquetas && (
          <span className="p-adv__meta">
            <span className="p-adv__sev">{SEVERIDAD_CORTA[sv ?? ''] ?? sv}</span>
            <span className="p-adv__tipo">{TIPO_ADV_LABEL[a.tipo] ?? a.tipo}</span>
            {detalle && a.campo_afectado && <span className="p-adv__campo">{a.campo_afectado}</span>}
          </span>
        )}
        <span className="p-adv__texto">{a ? sinReferencias(a.texto) : children}</span>
      </span>
    </li>
  )
}

/** Contador compacto "1 compromete · 9 limitan · 2 contexto". */
export function ContadorSeveridad({ items }: { items: Advertencia[] }) {
  const c = porSeveridad(items)
  return (
    <span className="p-sevs mono">
      {SEVERIDADES.filter((sv) => c[sv] > 0).map((sv) => (
        <span key={sv} className={`p-sevs__i p-sevs__i--${sevClase(sv)}`}><b className="num">{c[sv]}</b> {SEVERIDAD_CORTA[sv]}</span>
      ))}
    </span>
  )
}

const PLEGADO_LABEL: Record<Severidad, (n: number) => string> = {
  COMPROMETE_TESIS: (n) => `${n} ${n === 1 ? 'compromete la tesis' : 'comprometen la tesis'}`,
  LIMITA_LECTURA: (n) => `${n} ${n === 1 ? 'limitación de datos' : 'limitaciones de datos'}`,
  CONTEXTO: (n) => `${n} ${n === 1 ? 'nota de contexto' : 'notas de contexto'}`,
}

/** Un grupo plegable de advertencias de la misma severidad. */
function GrupoPlegable({ sv, lista, abierto, detalle }: { sv: Severidad; lista: Advertencia[]; abierto: boolean; detalle?: boolean }) {
  const [open, setOpen] = useState(abierto)
  return (
    <div className={`p-advs__grupo p-advs__grupo--${sevClase(sv)} ${open ? 'is-open' : ''}`}>
      <button type="button" className="p-advs__sev" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="p-advs__sev__mark" aria-hidden="true" />
        <span>{PLEGADO_LABEL[sv](lista.length)}</span>
        <span className="p-advs__sev__chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <ul className="p-advs__lista">{lista.map((a, i) => <Adv key={i} a={a} detalle={detalle} />)}</ul>}
    </div>
  )
}

/** Bloque de advertencias, jerarquizado. Visible en AMBOS niveles.
    Lo que COMPROMETE la tesis va siempre abierto y primero; lo que limita la
    lectura y el contexto van agrupados y plegados con su contador visible.
    Jerarquizar no es esconder: el total está arriba y todo se abre con un clic. */
export function Advertencias({ items, titulo, compacta = false, detalle = false, completo = false }: { items: Advertencia[]; titulo?: string; compacta?: boolean; detalle?: boolean; completo?: boolean }) {
  // Cliente: un solo bloque con los riesgos reales, en palabras normales. Lo que limita la
  // lectura y las notas de método son trabajo interno y quedan en la mesa de revisión.
  const usados = completo ? items : items.filter((a) => a.severidad === 'COMPROMETE_TESIS' && !tieneCriterioInterno(a.texto))
  if (!usados.length) return null
  const rotulo = titulo ?? (completo ? 'Advertencias' : 'Lo que podría salir mal')
  if (!completo) {
    return (
      <section className="p-advs p-advs--compromete" aria-label={rotulo}>
        <div className="p-advs__head">
          <span className="p-advs__mark" aria-hidden="true" />
          <span className="p-advs__titulo">{rotulo}</span>
        </div>
        <ul className="p-advs__lista">{ordenar(usados).map((a, i) => <Adv key={i} a={a} etiquetas={false} />)}</ul>
      </section>
    )
  }
  const c = porSeveridad(usados)
  const ord = ordenar(usados)
  const grupos = SEVERIDADES.map((sv) => ({ sv, lista: ord.filter((a) => a.severidad === sv) })).filter((g) => g.lista.length)
  return (
    <section className={`p-advs ${c.COMPROMETE_TESIS > 0 ? 'p-advs--compromete' : ''} ${compacta ? 'p-advs--compacta' : ''}`} aria-label={rotulo}>
      <div className="p-advs__head">
        <span className="p-advs__mark" aria-hidden="true" />
        <span className="p-advs__titulo">{rotulo}</span>
        <span className="p-advs__n num">{usados.length} en total</span>
        <ContadorSeveridad items={usados} />
      </div>
      {grupos.map((g) => <GrupoPlegable key={g.sv} sv={g.sv} lista={g.lista} abierto={g.sv === 'COMPROMETE_TESIS'} detalle={detalle} />)}
    </section>
  )
}

/* ---------- fuente y timestamp ---------- */
export function FuenteChip({ fuente, timestamp, calidad }: { fuente?: string; timestamp?: string; calidad?: string }) {
  if (!fuente && !timestamp) return null
  return (
    <span className={`p-fuente mono ${calidad ? 'p-fuente--' + calidad : ''}`} title={fuente}>
      <span className="p-fuente__k">fuente</span>
      <span className="p-fuente__v">{fuente}</span>
      {timestamp && <span className="p-fuente__t">{fechaHora(timestamp)}</span>}
      {calidad && <span className="p-fuente__q">{calidad}</span>}
    </span>
  )
}

export function TablaFuentes({ fuentes, detalle = true }: { fuentes: Fuente[]; detalle?: boolean }) {
  const [open, setOpen] = useState(false)
  const ausentes = fuentes.filter((f) => f.calidad === 'ausente').length
  return (
    <div className="p-fuentes">
      <button type="button" className="p-fuentes__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="mono">Fuentes consultadas, con fecha</span>
        <span className="num">{detalle ? `${fuentes.length} campos · ${ausentes} ausentes` : `${fuentes.length}`}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="p-tabla-wrap">
          <table className="p-tabla p-tabla--fuentes">
            <thead><tr><th>Campo</th><th>Fuente</th><th>Timestamp</th><th>Calidad</th></tr></thead>
            <tbody>
              {fuentes.map((f) => (
                <tr key={f.campo} className={`is-${f.calidad}`}>
                  <td className="mono">{f.campo}</td>
                  <td>{f.fuente}</td>
                  <td className="num">{fechaHora(f.timestamp)}</td>
                  <td className="mono">{f.calidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------- dato / valor ---------- */
export function Dato({ k, v, sub, tono }: { k: ReactNode; v: ReactNode; sub?: ReactNode; tono?: 'pos' | 'neg' | 'oro' | 'mudo' }) {
  return (
    <div className={`p-dato ${tono ? 'p-dato--' + tono : ''}`}>
      <span className="p-dato__k mono">{k}</span>
      <span className="p-dato__v num">{v}</span>
      {sub && <span className="p-dato__sub">{sub}</span>}
    </div>
  )
}

/** Dato ausente: se dice, no se esconde. */
export function Ausente({ motivo }: { motivo: string }) {
  return (
    <div className="p-ausente" role="note">
      <span className="p-ausente__k mono">Dato ausente</span>
      <p>{motivo}</p>
      <p className="p-ausente__regla mono">Un dato ausente no cuenta a favor.</p>
    </div>
  )
}

/* ---------- navegación ---------- */
export function Volver({ to, label }: { to: string; label: string }) {
  return <Link to={to} className="p-volver mono">← {label}</Link>
}
