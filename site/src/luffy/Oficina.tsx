import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { EstadoFuente, EventoOficina, Oficina as OficinaT } from './tipos6b'
import { fmtHora, fmtUsd, hace } from './formato'
import { C, FUENTE_MONO, rgba } from './charts/tema'
import { EmptyState } from '../ui/EmptyState'

/* ============================================================================
   La oficina en vivo (CONTRATO-PANEL.md §8.5): Luffy al centro, los agentes y
   Jev alrededor y las fuentes en el borde. `GET /oficina/estado` da la foto y
   `GET /eventos` (SSE) la anima: los hilos se encienden cuando un agente
   trabaja o una fuente entrega datos, y la salud de cada fuente va en el color
   de su nodo. El stream se reconecta con `desde_id`. Canvas 2D liviano: se
   pausa con la pestaña oculta y no repinta sin cambios.
   ========================================================================== */
interface Nodo { id: string; nombre: string; tipo: 'luffy' | 'agente' | 'fuente'; x: number; y: number; salud?: EstadoFuente; brillo: number; activo: boolean }
const SALUD: Record<EstadoFuente, string> = { al_dia: C.esm, atrasada: C.oro, caida: C.rojoLuz, apagada: C.ceniza2, sin_datos: C.ceniza2 }
const SALUD_LLANO: Record<EstadoFuente, string> = { al_dia: 'al día', atrasada: 'atrasada', caida: 'caída', apagada: 'apagada', sin_datos: 'sin datos aún' }
const ALIAS_FUENTE: Record<string, string> = { motor: 'motor_veta', telegram: 'telegram_fuente' }
const usd = (v: number | undefined) => (typeof v === 'number' && v > 0 ? ` · ${fmtUsd(v, 3)}` : '')
function describir(e: EventoOficina): { texto: string; clase: string } | null {
  switch (e.tipo) {
    case 'latido': return null
    case 'turno_abierto': return { texto: `Luffy abre un turno (${e.modo}, por ${e.canal})`, clase: '' }
    case 'turno_cerrado': return { texto: `Luffy cierra el turno · ${e.tipo_turno} · ${e.herramientas} herramienta${e.herramientas === 1 ? '' : 's'} · ${Math.round(e.duracion_s)} s${usd(e.costo_usd)}`, clase: '' }
    case 'agente_convocado': return { texto: `convoca al ${e.agente}`, clase: '' }
    case 'agente_terminado': return { texto: `el ${e.agente} termina${e.ok ? '' : ' con error'} · ${Math.round(e.duracion_s)} s${usd(e.costo_usd)}`, clase: e.ok ? '' : 'is-mal' }
    case 'herramienta': return { texto: `${e.quien} usa ${e.nombre}${e.fuente ? ` → ${e.fuente}` : ''}${e.ok ? '' : ' (falló)'}`, clase: e.ok ? 'is-fuente' : 'is-mal' }
    case 'jev': return { texto: `Jev clasifica ${e.n} (${e.proposito.replace(/_/g, ' ')})${usd(e.costo_usd)}`, clase: 'is-fuente' }
    case 'fuente_leida': return { texto: `${e.fuente.replace(/_/g, ' ')} ${e.ok ? `entrega ${e.n}` : 'no respondió'}${e.detalle ? ` · ${e.detalle}` : ''}`, clase: e.ok ? 'is-fuente' : 'is-mal' }
    case 'radar_ciclo': return { texto: `radar ${e.modo}: ${e.n_candidatas} candidata${e.n_candidatas === 1 ? '' : 's'} de ${e.n_evaluados}`, clase: '' }
    case 'caja_ciclo': return { texto: `ciclo de la caja (${e.motivo}): ${e.corrio ? `corrió, ${e.propuestas} propuesta${e.propuestas === 1 ? '' : 's'}` : 'sin novedades, no abrió turno'}${usd(e.costo_usd)}`, clase: '' }
    case 'reconciliacion': return { texto: `reconciliación ${e.origen}: ${e.discrepancias ? `${e.discrepancias} discrepancia${e.discrepancias === 1 ? '' : 's'}` : 'todo cuadra'}`, clase: e.discrepancias ? 'is-mal' : '' }
    case 'alerta': return { texto: `alerta ${e.severidad}${e.activo ? ` sobre ${e.activo}` : ''}`, clase: e.severidad === 'alta' ? 'is-mal' : 'is-fuente' }
    case 'propuesta': return { texto: `propuesta #${e.id_corto} ${e.accion} ${e.par} · ${e.estado}`, clase: '' }
    case 'orden': return { texto: `orden #${e.id_corto} ${e.accion} · ${e.estado}`, clase: e.estado === 'fallida' ? 'is-mal' : '' }
    case 'gatillo': return { texto: `gatillo ${e.id_corto} ${e.evento}`, clase: 'is-fuente' }
    case 'informe': return { texto: `informe del ${e.fecha} listo${usd(e.costo_usd)}`, clase: '' }
    default: return null
  }
}

export function Oficina() {
  const [estado, setEstado] = useState<OficinaT | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventos, setEventos] = useState<(EventoOficina & { clave: number })[]>([])
  const [conectado, setConectado] = useState(false)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const nodos = useRef<Map<string, Nodo>>(new Map())
  const hilos = useRef<{ de: string; a: string; brillo: number }[]>([])
  const n = useRef(0)
  const sucio = useRef(true)
  useEffect(() => { luffy6b.oficina().then((o) => { setEstado(o); setError(null) }, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [])
  useEffect(() => {
    if (!estado) return
    const m = new Map<string, Nodo>()
    m.set('luffy', { id: 'luffy', nombre: 'Luffy', tipo: 'luffy', x: 0.5, y: 0.5, brillo: estado.luffy.en_curso.length ? 1 : 0.2, activo: estado.luffy.en_curso.length > 0 })
    estado.agentes.forEach((a, i) => { const ang = -Math.PI / 2 + (i / estado.agentes.length) * Math.PI * 2; m.set(a.nombre, { id: a.nombre, nombre: a.etiqueta ?? a.nombre, tipo: 'agente', x: 0.5 + Math.cos(ang) * 0.22, y: 0.5 + Math.sin(ang) * 0.3, brillo: a.en_curso ? 1 : 0.15, activo: a.en_curso }) })
    estado.fuentes.forEach((f, i) => { const ang = -Math.PI / 2 + Math.PI / estado.fuentes.length + (i / estado.fuentes.length) * Math.PI * 2; m.set(f.nombre, { id: f.nombre, nombre: f.etiqueta ?? f.nombre.replace(/_/g, ' '), tipo: 'fuente', x: 0.5 + Math.cos(ang) * 0.43, y: 0.5 + Math.sin(ang) * 0.42, salud: f.estado, brillo: 0.15, activo: false }) })
    nodos.current = m; sucio.current = true
    const cerrar = luffy6b.eventos((e) => {
      const d = describir(e)
      if (d) { n.current += 1; const k = n.current; setEventos((xs) => [{ ...e, clave: k }, ...xs].slice(0, 80)) }
      const mm = nodos.current; const enciende = (id: string, b = 1) => { const x = mm.get(id); if (x) { x.brillo = Math.max(x.brillo, b); sucio.current = true } }
      const hilo = (de: string, a: string) => { if (mm.has(de) && mm.has(a)) { hilos.current.push({ de, a, brillo: 1 }); sucio.current = true } }
      const fuente = (f: string) => ALIAS_FUENTE[f] ?? f
      const l = mm.get('luffy')
      if (e.tipo === 'turno_abierto' && l) { l.activo = true; enciende('luffy') }
      if (e.tipo === 'turno_cerrado' && l) { l.activo = false; sucio.current = true }
      if (e.tipo === 'agente_convocado' || e.tipo === 'agente_terminado') { const a = mm.get(e.agente); if (a) a.activo = e.tipo === 'agente_convocado'; enciende(e.agente); hilo('luffy', e.agente) }
      if (e.tipo === 'herramienta' && e.fuente) { const de = mm.has(e.quien) ? e.quien : 'luffy'; enciende(fuente(e.fuente), 0.9); hilo(de, fuente(e.fuente)) }
      if (e.tipo === 'jev') { enciende('jev'); hilo('jev', 'x') }
      if (e.tipo === 'fuente_leida') { const f = mm.get(fuente(e.fuente)); if (f) { f.salud = e.ok ? 'al_dia' : 'caida'; enciende(f.id, 0.9); hilo(f.id, 'luffy') } }
      if (e.tipo === 'alerta' || e.tipo === 'propuesta' || e.tipo === 'orden') enciende('luffy', 0.7)
    }, setConectado, estado.eventos_ultimo_id ?? null)
    return cerrar
  }, [estado])
  useEffect(() => {
    const cv = lienzo.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let raf = 0, vivo = true, ultimo = performance.now()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const medir = () => { const r = cv.getBoundingClientRect(); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); sucio.current = true }
    medir(); const ro = new ResizeObserver(medir); ro.observe(cv)
    const cuadro = (t: number) => {
      if (!vivo) return
      const dt = Math.min(0.1, (t - ultimo) / 1000); ultimo = t
      const W = cv.width, H = cv.height, m = nodos.current
      for (const x of m.values()) { const objetivo = x.activo ? 0.75 + 0.25 * Math.sin(t / 400) : 0.15; if (Math.abs(x.brillo - objetivo) > 0.01) { x.brillo += (objetivo - x.brillo) * Math.min(1, dt * 2.5); sucio.current = true } }
      if (hilos.current.length) { for (const h of hilos.current) h.brillo -= dt * 0.55; hilos.current = hilos.current.filter((h) => h.brillo > 0); sucio.current = true }
      if (sucio.current) {
        sucio.current = false
        ctx.clearRect(0, 0, W, H); ctx.lineWidth = dpr
        const luffy = m.get('luffy')
        for (const x of m.values()) { if (x.tipo === 'luffy' || !luffy) continue; ctx.strokeStyle = rgba(C.hueso, 0.06); ctx.beginPath(); ctx.moveTo(luffy.x * W, luffy.y * H); ctx.lineTo(x.x * W, x.y * H); ctx.stroke() }
        for (const h of hilos.current) { const a = m.get(h.de), b = m.get(h.a); if (!a || !b) continue; const col = a.tipo === 'fuente' || b.tipo === 'fuente' ? C.oroLuz : C.esmLuz; ctx.strokeStyle = rgba(col, Math.min(1, h.brillo)); ctx.lineWidth = 1.5 * dpr; ctx.shadowColor = col; ctx.shadowBlur = 8 * dpr * h.brillo; ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke(); ctx.shadowBlur = 0; ctx.lineWidth = dpr }
        ctx.font = `500 ${10 * dpr}px ${FUENTE_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        for (const x of m.values()) {
          const px = x.x * W, py = x.y * H
          const col = x.tipo === 'fuente' ? SALUD[x.salud ?? 'sin_datos'] : x.tipo === 'luffy' ? C.esmLuz : C.hueso
          const r = (x.tipo === 'luffy' ? 16 : x.tipo === 'agente' ? 8 : 5) * dpr
          ctx.shadowColor = col; ctx.shadowBlur = (6 + 18 * x.brillo) * dpr; ctx.fillStyle = rgba(col, 0.25 + 0.75 * x.brillo)
          ctx.beginPath(); if (x.tipo === 'luffy') { ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath() } else ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill()
          ctx.shadowBlur = 0; ctx.fillStyle = x.tipo === 'fuente' ? rgba(C.ceniza, 0.9) : rgba(C.hueso, 0.85)
          ctx.fillText(x.nombre.toUpperCase(), px, py + r + 5 * dpr)
        }
      }
      raf = requestAnimationFrame(cuadro)
    }
    const visibilidad = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else if (!raf) { ultimo = performance.now(); sucio.current = true; raf = requestAnimationFrame(cuadro) } }
    document.addEventListener('visibilitychange', visibilidad)
    raf = requestAnimationFrame(cuadro)
    return () => { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', visibilidad) }
  }, [estado])
  if (error && !estado) return <div className="lf-pag"><EmptyState kind="error" title="No se pudo abrir la oficina." detail={error} /></div>
  const enCurso = estado?.luffy.en_curso ?? []
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">La oficina <em>en vivo</em></h1><span className="mono" style={{ color: conectado ? 'var(--esmeralda-luz)' : 'var(--ceniza-2)', fontSize: '0.56rem' }}><i className={`lf-gema ${conectado ? 'is-latiendo' : ''}`} style={{ marginRight: 8 }} />{conectado ? 'conectada' : 'conectando…'}</span></div>
      <div className="lf-ofi">
        <div className="lf-ofi__lienzo"><canvas ref={lienzo} aria-label="Luffy, los agentes y las fuentes" />
          {estado && <div className="lf-ofi__estado mono">{enCurso.length ? <>Luffy trabajando en {enCurso.map((t, i) => <span key={t.hilo_id}>{i > 0 && ', '}<Link to={`/luffy/h/${t.hilo_id}`}>«{t.titulo}»</Link></span>)}</> : `Luffy en reposo · último turno ${hace(estado.luffy.ultimo_turno)}`} · {estado.luffy.turnos_24h} turnos en 24 h · {fmtUsd(estado.luffy.costo_24h_usd)}</div>}
        </div>
        <div className="lf-ficha__lado">
          <section className="lf-tarj"><h3 className="mono">Fuentes</h3><div className="lf-fuentes">{(estado?.fuentes ?? []).map((f) => <span key={f.nombre} className={`lf-mini ${f.estado === 'al_dia' ? 'lf-mini--esm' : f.estado === 'atrasada' ? 'lf-mini--oro' : f.estado === 'caida' ? 'lf-mini--rojo' : ''}`} title={f.detalle ?? ''}>{f.etiqueta ?? f.nombre.replace(/_/g, ' ')} · {SALUD_LLANO[f.estado]}{f.ultima_lectura ? ` · ${hace(f.ultima_lectura)}` : ''}</span>)}</div></section>
          <section className="lf-tarj"><h3 className="mono">Agentes</h3>{(estado?.agentes ?? []).map((a) => <p key={a.nombre} className="lf-nota"><b>{a.etiqueta ?? a.nombre}</b>{a.en_curso ? <em className="mono" style={{ display: 'inline', color: 'var(--esmeralda-luz)' }}> · trabajando</em> : null} <em className="mono" style={{ display: 'inline' }}>· {a.llamadas_24h.toLocaleString('es-ES')} en 24 h · {fmtUsd(a.costo_24h_usd)}{a.ultima_actividad ? ` · ${hace(a.ultima_actividad)}` : ''}</em></p>)}</section>
          <section className="lf-tarj"><h3 className="mono">Registro de actividad<em>{eventos.length ? `${eventos.length} eventos` : ''}</em></h3>
            <div className="lf-ofi__registro">{eventos.map((e) => { const d = describir(e); return d ? <div key={e.clave} className="lf-ev"><span className="mono">{fmtHora(e.hora).slice(-5)}</span><span><i className={d.clase}>{d.texto}</i></span></div> : null })}{!eventos.length && <p className="lf-ctrl__nota mono">Esperando eventos…</p>}</div>
          </section>
          <section className="lf-tarj"><h3 className="mono">Trabajos programados</h3>{(estado?.trabajos ?? []).map((t) => <p key={t.nombre} className="lf-nota" style={{ fontSize: '0.8rem' }}><b>{t.etiqueta ?? t.nombre}</b> <em className="mono" style={{ display: 'inline' }}>· cada {t.cada}{t.ultima ? ` · último ${hace(t.ultima)}` : ''}{t.estado && t.estado !== 'ok' ? ` · ${t.estado.replace(/_/g, ' ')}` : ''}</em></p>)}</section>
        </div>
      </div>
    </div>
  )
}
