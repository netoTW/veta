import { useEffect, useRef, useState } from 'react'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { EventoOficina, Oficina as OficinaT } from './tipos6b'
import { fmtHora, hace } from './formato'
import { C, FUENTE_MONO, rgba } from './charts/tema'
import { EmptyState } from '../ui/EmptyState'

/* ============================================================================
   La oficina en vivo (fase 6b §6): Luffy al centro, los agentes alrededor y las
   fuentes en el borde; los hilos se encienden cuando un agente trabaja o una
   fuente entrega datos. Conectada al SSE /eventos; la salud de cada fuente
   va en el color de su nodo. Canvas 2D liviano: se pausa si la pestaña no se
   ve y no dibuja nada si no cambió nada en el último segundo.
   ========================================================================== */
interface Nodo { id: string; nombre: string; tipo: 'luffy' | 'agente' | 'fuente'; x: number; y: number; salud?: 'al_dia' | 'atrasada' | 'caida'; brillo: number; estado?: string }
const SALUD = { al_dia: C.esm, atrasada: C.oro, caida: C.rojoLuz }
const describir = (e: EventoOficina): { texto: string; clase: string } => {
  switch (e.tipo) {
    case 'turno_abierto': return { texto: `Luffy abre un turno en «${e.hilo_titulo ?? e.hilo_id.slice(0, 8)}»${e.tipo_turno ? ` (${e.tipo_turno})` : ''}`, clase: '' }
    case 'turno_cerrado': return { texto: `Luffy cierra el turno${e.costo_usd ? ` · ${e.costo_usd.toFixed(3).replace('.', ',')} US$` : ''}`, clase: '' }
    case 'agente_convocado': return { texto: `convoca a ${e.agente.replace('_', ' ')}`, clase: '' }
    case 'agente_terminado': return { texto: `${e.agente.replace('_', ' ')} termina${e.costo_usd ? ` · ${e.costo_usd.toFixed(3).replace('.', ',')} US$` : ''}`, clase: '' }
    case 'herramienta': return { texto: `herramienta ${e.herramienta}${e.fuente ? ` → ${e.fuente}` : ''}`, clase: 'is-fuente' }
    case 'fuente': return { texto: `${e.fuente} ${e.ok ? `entrega${e.n ? ` ${e.n} registros` : ''}` : 'no respondió'}`, clase: e.ok ? 'is-fuente' : 'is-mal' }
    case 'radar_ciclo': return { texto: `radar · ${e.detalle}`, clase: '' }
    case 'caja_ciclo': return { texto: `caja · ${e.detalle}`, clase: '' }
    case 'alerta': return { texto: `alerta ${e.severidad}: ${e.texto}`, clase: e.severidad === 'alta' ? 'is-mal' : 'is-fuente' }
    default: return { texto: JSON.stringify(e), clase: '' }
  }
}

export function Oficina() {
  const [estado, setEstado] = useState<OficinaT | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventos, setEventos] = useState<(EventoOficina & { n: number })[]>([])
  const [conectado, setConectado] = useState(false)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const nodos = useRef<Map<string, Nodo>>(new Map())
  const hilos = useRef<{ de: string; a: string; brillo: number }[]>([])
  const n = useRef(0)
  useEffect(() => { luffy6b.oficina().then((o) => { setEstado(o); setError(null) }, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [])
  // nodos: Luffy al centro, agentes en un anillo, fuentes en el borde
  useEffect(() => {
    if (!estado) return
    const m = new Map<string, Nodo>()
    m.set('luffy', { id: 'luffy', nombre: 'Luffy', tipo: 'luffy', x: 0.5, y: 0.5, brillo: estado.luffy.estado === 'pensando' ? 1 : 0.2, estado: estado.luffy.estado })
    estado.agentes.forEach((a, i) => { const ang = -Math.PI / 2 + (i / estado.agentes.length) * Math.PI * 2; m.set(a.id, { id: a.id, nombre: a.nombre, tipo: 'agente', x: 0.5 + Math.cos(ang) * 0.22, y: 0.5 + Math.sin(ang) * 0.3, brillo: a.estado === 'trabajando' ? 1 : 0.15, estado: a.estado }) })
    estado.fuentes.forEach((f, i) => { const ang = -Math.PI / 2 + Math.PI / estado.fuentes.length + (i / estado.fuentes.length) * Math.PI * 2; m.set(f.id, { id: f.id, nombre: f.nombre, tipo: 'fuente', x: 0.5 + Math.cos(ang) * 0.43, y: 0.5 + Math.sin(ang) * 0.42, salud: f.salud, brillo: 0.15 }) })
    nodos.current = m
  }, [estado])
  useEffect(() => {
    const cerrar = luffy6b.eventos((e) => {
      n.current += 1
      setEventos((xs) => [{ ...e, n: n.current }, ...xs].slice(0, 80))
      const m = nodos.current; const enciende = (id: string, b = 1) => { const x = m.get(id); if (x) x.brillo = Math.max(x.brillo, b) }
      const hilo = (de: string, a: string) => { if (m.has(de) && m.has(a)) hilos.current.push({ de, a, brillo: 1 }) }
      if (e.tipo === 'turno_abierto') { enciende('luffy'); const l = m.get('luffy'); if (l) l.estado = 'pensando' }
      if (e.tipo === 'turno_cerrado') { const l = m.get('luffy'); if (l) l.estado = 'ocioso' }
      if (e.tipo === 'agente_convocado' || e.tipo === 'agente_terminado') { enciende(e.agente); hilo('luffy', e.agente); const a = m.get(e.agente); if (a) a.estado = e.tipo === 'agente_convocado' ? 'trabajando' : 'ocioso' }
      if (e.tipo === 'herramienta' && e.fuente) { enciende(e.fuente, 0.9); hilo('luffy', e.fuente) }
      if (e.tipo === 'fuente') { enciende(e.fuente, 0.9); hilo(e.fuente, 'luffy'); const f = m.get(e.fuente); if (f && !e.ok) f.salud = 'atrasada' }
      if (e.tipo === 'alerta') enciende('luffy', 0.6)
    }, setConectado)
    return cerrar
  }, [])
  // dibujo: se para cuando la pestaña no se ve; sin cambios, no repinta
  useEffect(() => {
    const cv = lienzo.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let raf = 0, vivo = true, ultimo = performance.now()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const medir = () => { const r = cv.getBoundingClientRect(); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr) }
    medir(); const ro = new ResizeObserver(medir); ro.observe(cv)
    const cuadro = (t: number) => {
      if (!vivo) return
      const dt = Math.min(0.1, (t - ultimo) / 1000); ultimo = t
      const W = cv.width, H = cv.height; const m = nodos.current
      let cambia = false
      for (const x of m.values()) { const objetivo = x.estado === 'pensando' || x.estado === 'trabajando' ? 0.75 + 0.25 * Math.sin(t / 400) : 0.15; if (Math.abs(x.brillo - objetivo) > 0.01) { x.brillo += (objetivo - x.brillo) * Math.min(1, dt * 2.5); cambia = true } }
      for (const h of hilos.current) { h.brillo -= dt * 0.55; cambia = true }
      hilos.current = hilos.current.filter((h) => h.brillo > 0)
      if (cambia || document.hidden === false) {
        ctx.clearRect(0, 0, W, H)
        ctx.lineWidth = 1 * dpr
        const luffy = m.get('luffy')
        for (const x of m.values()) { if (x.tipo === 'luffy' || !luffy) continue; ctx.strokeStyle = rgba(C.hueso, 0.06); ctx.beginPath(); ctx.moveTo(luffy.x * W, luffy.y * H); ctx.lineTo(x.x * W, x.y * H); ctx.stroke() }
        for (const h of hilos.current) { const a = m.get(h.de), b = m.get(h.a); if (!a || !b) continue; const col = b.tipo === 'fuente' || a.tipo === 'fuente' ? C.oroLuz : C.esmLuz; ctx.strokeStyle = rgba(col, Math.min(1, h.brillo)); ctx.lineWidth = 1.5 * dpr; ctx.shadowColor = col; ctx.shadowBlur = 8 * dpr * h.brillo; ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke(); ctx.shadowBlur = 0; ctx.lineWidth = 1 * dpr }
        ctx.font = `500 ${10 * dpr}px ${FUENTE_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        for (const x of m.values()) {
          const px = x.x * W, py = x.y * H
          const col = x.tipo === 'fuente' ? SALUD[x.salud ?? 'al_dia'] : x.tipo === 'luffy' ? C.esmLuz : C.hueso
          const r = (x.tipo === 'luffy' ? 16 : x.tipo === 'agente' ? 8 : 5) * dpr
          ctx.shadowColor = col; ctx.shadowBlur = (6 + 18 * x.brillo) * dpr
          ctx.fillStyle = rgba(col, 0.25 + 0.75 * x.brillo)
          ctx.beginPath(); if (x.tipo === 'luffy') { ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath() } else ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill()
          ctx.shadowBlur = 0
          ctx.fillStyle = x.tipo === 'fuente' ? rgba(C.ceniza, 0.9) : rgba(C.hueso, 0.85)
          ctx.fillText(x.nombre.toUpperCase(), px, py + r + 5 * dpr)
        }
      }
      raf = requestAnimationFrame(cuadro)
    }
    const visibilidad = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(cuadro) } }
    document.addEventListener('visibilitychange', visibilidad)
    raf = requestAnimationFrame(cuadro)
    return () => { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', visibilidad) }
  }, [estado])
  if (error && !estado) return <div className="lf-pag"><EmptyState kind="error" title="No se pudo abrir la oficina." detail={error} /></div>
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">La oficina <em>en vivo</em></h1><span className="mono" style={{ color: conectado ? 'var(--esmeralda-luz)' : 'var(--ceniza-2)', fontSize: '0.56rem' }}><i className={`lf-gema ${conectado ? 'is-latiendo' : ''}`} style={{ marginRight: 8 }} />{conectado ? 'conectada' : 'conectando…'}</span></div>
      <div className="lf-ofi">
        <div className="lf-ofi__lienzo"><canvas ref={lienzo} aria-label="Luffy, los agentes y las fuentes" />
          {estado && <div className="lf-ofi__estado mono">{estado.luffy.estado === 'pensando' ? `Luffy pensando en «${estado.luffy.hilo_titulo ?? ''}»` : 'Luffy en reposo'} · {estado.corriendo.map((c) => c.que).join(' · ')}</div>}
        </div>
        <div className="lf-ficha__lado">
          <section className="lf-tarj"><h3 className="mono">Fuentes</h3><div className="lf-fuentes">{(estado?.fuentes ?? []).map((f) => <span key={f.id} className={`lf-mini ${f.salud === 'al_dia' ? 'lf-mini--esm' : f.salud === 'atrasada' ? 'lf-mini--oro' : 'lf-mini--rojo'}`} title={f.detalle ?? ''}>{f.nombre} · {f.salud === 'al_dia' ? 'al día' : f.salud}{f.ultima_lectura ? ` · ${hace(f.ultima_lectura)}` : ''}</span>)}</div></section>
          <section className="lf-tarj"><h3 className="mono">Registro de actividad<em>{eventos.length ? `${eventos.length} eventos` : ''}</em></h3>
            <div className="lf-ofi__registro">{eventos.map((e) => { const d = describir(e); return <div key={e.n} className="lf-ev"><span className="mono">{fmtHora(e.hora).slice(-5)}</span><span><i className={d.clase}>{d.texto}</i></span></div> })}{!eventos.length && <p className="lf-ctrl__nota mono">Esperando eventos…</p>}</div>
          </section>
        </div>
      </div>
    </div>
  )
}
