import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLuffy6b, pedir, qs } from '../api6b'
import { fmtFecha, fmtHora, fmtUsd } from '../formato'

/* ============================================================================
   Telegram como fuente, en la oficina (CONTRATO-PANEL §8.5, v2.4: `GET /fuentes/telegram`):
   los grupos que Pablo eligió, con su estado, quién y por qué; los que están en la
   cuenta sin elegir, aparte (no se leen); la medición de los días (llegan, pasan el
   filtro, hechos) y lo último que se extrajo, que sale de los eventos `fuente_leida`
   de `telegram_grupos` (los hechos, con su texto y su moneda).
   ========================================================================== */
type C = Record<string, unknown>
const obj = (v: unknown): C => (v && typeof v === 'object' && !Array.isArray(v) ? (v as C) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

interface Grupo { id: string; titulo: string; enlace: string | null; activo: string | null; estado: string; quien: string; motivo: string | null; participantes: number | null; ultima_lectura: string | null; agregado_en: string | null; dejado_en: string | null }
interface Dia { dia: string; llegan: number; pasan: number; hechos: number; catalizadores: number; costo_usd: number }
interface Fuente {
  activa: boolean; motivo: string | null; detenido: boolean; ultimo_ciclo: string | null; grupos: Grupo[]; dias: Dia[]
  total: { llegan: number; pasan: number; hechos: number; catalizadores: number; costo_usd: number } | null; pasa_pct: number | null
  ciclo: { leidos: number | null; nuevos: number | null; pasan: number | null; por_motivo: Record<string, number>; extraccion: { hechos: number | null; a_agenda: number | null; costo_usd: number | null } | null } | null
  viejo: boolean; calculado_en: string | null
}
interface Hecho { hora: string; texto: string; activos: string[]; n: number | null }

function adaptar(c: unknown): Fuente {
  const o = obj(c), m = obj(o.medicion), r = o.resumen_ultimo_ciclo ? obj(o.resumen_ultimo_ciclo) : null, v = obj(o.vitrina), t = m.total ? obj(m.total) : null
  const ex = r?.extraccion ? obj(r.extraccion) : null
  return {
    activa: o.activa !== false, motivo: str(o.motivo), detenido: o.detenido === true, ultimo_ciclo: str(o.ultimo_ciclo),
    grupos: arr(o.grupos).flatMap((x) => { const g = obj(x), titulo = str(g.titulo) ?? str(g.username); return titulo ? [{ id: String(g.chat_id ?? titulo), titulo, enlace: str(g.enlace), activo: str(g.activo), estado: str(g.estado) ?? 'no_elegido', quien: str(g.quien) ?? 'sistema', motivo: str(g.motivo), participantes: num(g.participantes), ultima_lectura: str(g.ultima_lectura), agregado_en: str(g.agregado_en), dejado_en: str(g.dejado_en) }] : [] }),
    dias: arr(m.dias).flatMap((x) => { const d = obj(x), dia = str(d.dia); return dia ? [{ dia, llegan: num(d.llegan) ?? 0, pasan: num(d.pasan) ?? 0, hechos: num(d.hechos) ?? 0, catalizadores: num(d.catalizadores) ?? 0, costo_usd: num(d.costo_usd) ?? 0 }] : [] }).sort((a, b) => a.dia.localeCompare(b.dia)),
    total: t ? { llegan: num(t.llegan) ?? 0, pasan: num(t.pasan) ?? 0, hechos: num(t.hechos) ?? 0, catalizadores: num(t.catalizadores) ?? 0, costo_usd: num(t.costo_usd) ?? 0 } : null,
    pasa_pct: num(m.pasa_pct),
    ciclo: r ? { leidos: num(r.leidos), nuevos: num(r.nuevos), pasan: num(r.pasan), por_motivo: Object.fromEntries(Object.entries(obj(r.por_motivo)).filter(([, n]) => typeof n === 'number')) as Record<string, number>, extraccion: ex ? { hechos: num(ex.hechos), a_agenda: num(ex.a_agenda), costo_usd: num(ex.costo_usd) } : null } : null,
    viejo: v.estado === 'viejo', calculado_en: str(v.calculado_en),
  }
}
const hechosDe = (c: unknown): Hecho[] => arr(obj(c).items).flatMap((x) => {
  const e = obj(x)
  if (e.fuente !== 'telegram_grupos' || !str(e.texto) || e.accion) return []
  const activos = [...new Set([...arr(e.activos).flatMap((a) => (str(a) ? [str(a)!] : [])), ...(str(e.activo) ? [str(e.activo)!] : [])])]
  return [{ hora: str(e.hora) ?? '', texto: str(e.texto)!.replace(/^Telegram [^:]+:\s*/, ''), activos, n: num(e.hechos) }]
}).sort((a, b) => b.hora.localeCompare(a.hora))

const ESTADO: Record<string, string> = { seguido: 'se lee', no_elegido: 'sin elegir', dejado: 'dejado', verificacion: 'pide verificación', solicitud: 'espera aprobación' }
const QUIEN: Record<string, string> = { pablo_manual: 'lo unió Pablo a mano', pablo_luffy: 'Pablo se lo pidió a Luffy', sistema: 'apareció en la cuenta' }
const MOTIVO: Record<string, string> = { saludo: 'saludos', corto: 'cortos', solo_enlace: 'sólo enlace', comando: 'comandos', repetido: 'repetidos', conversacion: 'conversación', sin_texto: 'sin texto', equipo: 'del equipo', tema: 'del tema', cifra: 'con cifras' }

export function TelegramOficina() {
  const [f, setF] = useState<Fuente | null>(null)
  const [hechos, setHechos] = useState<Hecho[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [otros, setOtros] = useState(false)
  useEffect(() => {
    let v = true; const ctl = new AbortController()
    const traer = () => {
      pedir<unknown>('/fuentes/telegram', { signal: ctl.signal }).then((x) => { if (v) { setF(adaptar(x)); setError(null) } }, (e) => { if (v && !(e instanceof DOMException)) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) })
      pedir<unknown>(`/eventos/recientes${qs({ tipos: 'fuente_leida', horas: 72, limite: 500 })}`, { signal: ctl.signal }).then((x) => { if (v) setHechos(hechosDe(x).slice(0, 8)) }, () => { if (v) setHechos((h) => h ?? []) })
    }
    traer()
    const t = setInterval(traer, 120_000)
    return () => { v = false; ctl.abort(); clearInterval(t) }
  }, [])

  if (error && !f) return <section className="lf-tarj lf-tgo" data-prueba="telegram-oficina"><h3 className="mono">Telegram como fuente</h3><p className="lf-ctrl__nota mono">{error}</p></section>
  if (!f) return <section className="lf-tarj lf-tgo is-cargando" data-prueba="telegram-oficina"><h3 className="mono">Telegram como fuente</h3></section>
  const seguidos = f.grupos.filter((g) => g.estado === 'seguido'), resto = f.grupos.filter((g) => g.estado !== 'seguido')
  const max = Math.max(1, ...f.dias.map((d) => d.llegan))
  const estado = !f.activa ? `apagada${f.motivo ? `: ${f.motivo}` : ''}` : f.detenido ? 'detenida' : 'leyendo'
  return (
    <section className="lf-tarj lf-tgo" data-prueba="telegram-oficina">
      <h3 className="mono">Telegram como fuente<em><span className={`lf-tgo__estado ${f.activa && !f.detenido ? 'is-on' : 'is-off'}`}>{estado}</span>{f.ultimo_ciclo ? ` · última pasada ${fmtHora(f.ultimo_ciclo.replace(' ', 'T'))}` : ''}{f.viejo && f.calculado_en ? ` · datos de las ${fmtHora(f.calculado_en)}` : ''}</em></h3>
      <p className="lf-ctrl__nota mono">Una cuenta aparte, sólo de lectura: nunca escribe ni abre enlaces. Se leen sólo los grupos que eligió Pablo.</p>

      <div className="lf-tgo__cuerpo">
        <div className="lf-tgo__grupos" data-prueba="telegram-grupos">
          <h4 className="mono">Grupos que se leen <em>{seguidos.length}</em></h4>
          {seguidos.map((g) => (
            <div key={g.id} className="lf-tgo__g" data-prueba="telegram-grupo">
              <p className="lf-tgo__t">{g.enlace ? <a href={g.enlace} target="_blank" rel="noreferrer noopener">{g.titulo}</a> : <b>{g.titulo}</b>}{g.activo && <Link to={`/luffy/terminal/${g.activo}`} className="lf-tgo__sym mono">{g.activo}</Link>}<span className="lf-tgo__chip mono is-on">{ESTADO[g.estado] ?? g.estado}</span></p>
              <p className="lf-tgo__m mono">{[QUIEN[g.quien] ?? g.quien, g.participantes ? `${g.participantes.toLocaleString('es-ES')} participantes` : null, g.agregado_en ? `elegido ${fmtHora(g.agregado_en)}` : null, g.ultima_lectura ? `leído ${fmtHora(g.ultima_lectura)}` : 'todavía sin leer'].filter(Boolean).join(' · ')}</p>
              {g.motivo && <p className="lf-tgo__por">{g.motivo}</p>}
            </div>
          ))}
          {!seguidos.length && <p className="lf-tgo__por">Pablo todavía no eligió ningún grupo: se eligen conversando con Luffy.</p>}
          {resto.length > 0 && <>
            <button type="button" className="lf-tgo__otros mono" aria-expanded={otros} onClick={() => setOtros((o) => !o)}>{otros ? 'ocultar' : 'ver'} los {resto.length} que no se leen</button>
            {otros && <ul className="lf-tgo__lista" data-prueba="telegram-otros">{resto.map((g) => <li key={g.id}><span>{g.titulo}</span><em className="mono">{ESTADO[g.estado] ?? g.estado}{g.dejado_en ? ` el ${fmtFecha(g.dejado_en)}` : ''}</em></li>)}</ul>}
          </>}
        </div>

        <div className="lf-tgo__medida" data-prueba="telegram-medicion">
          <h4 className="mono">Lo que llega y lo que pasa <em>{f.total ? `${f.dias.length} días · ${f.total.llegan.toLocaleString('es-ES')} mensajes, ${f.pasa_pct !== null ? `${f.pasa_pct.toLocaleString('es-ES')} % pasa el filtro` : `${f.total.pasan} pasan`} · ${f.total.hechos} hechos · ${fmtUsd(f.total.costo_usd, 3)}` : ''}</em></h4>
          <div className="lf-tgo__dias">
            {f.dias.map((d) => (
              <div key={d.dia} className="lf-tgo__dia" title={`${fmtFecha(d.dia)}: llegan ${d.llegan}, pasan ${d.pasan}, ${d.hechos} hechos, ${d.catalizadores} catalizadores, ${fmtUsd(d.costo_usd, 4)}`}>
                <span className="lf-tgo__barra"><i className="is-llegan" style={{ height: `${(d.llegan / max) * 100}%` }} /><i className="is-pasan" style={{ height: `${(d.pasan / max) * 100}%` }} /></span>
                <b className="mono">{d.hechos ? d.hechos : ''}</b>
                <span className="mono">{d.dia.slice(8)}</span>
              </div>
            ))}
          </div>
          <div className="lf-gof__ley mono"><span><i className="lf-tgo__ley is-llegan" />llegan</span><span><i className="lf-tgo__ley is-pasan" />pasan el filtro y van al modelo</span><span><b>n</b> hechos extraídos</span></div>
          {f.ciclo && <p className="lf-tgo__m mono">Última pasada: {[f.ciclo.nuevos !== null ? `${f.ciclo.nuevos} nuevos` : null, f.ciclo.pasan !== null ? `${f.ciclo.pasan} pasan` : null, f.ciclo.extraccion?.hechos ? `${f.ciclo.extraccion.hechos} hechos` : null, f.ciclo.extraccion?.a_agenda ? `${f.ciclo.extraccion.a_agenda} a la agenda` : null].filter(Boolean).join(' · ') || 'sin mensajes nuevos'}{Object.keys(f.ciclo.por_motivo).length ? ` · ${Object.entries(f.ciclo.por_motivo).map(([k, n]) => `${n} ${MOTIVO[k] ?? k}`).join(', ')}` : ''}</p>}
        </div>
      </div>

      <div className="lf-tgo__hechos" data-prueba="telegram-hechos">
        <h4 className="mono">Lo último que se extrajo</h4>
        {hechos === null && <p className="lf-tgo__m mono">Trayendo…</p>}
        {hechos && !hechos.length && <p className="lf-tgo__por">Nada extraído en los últimos tres días.</p>}
        <ol className="lf-linea">
          {hechos?.map((h, i) => (
            <li key={i} className="lf-linea__r">
              <span className="lf-linea__h mono">{fmtHora(h.hora)}</span>
              <div className="lf-linea__c"><p>{h.texto}</p>{(h.activos.length > 0 || h.n) && <p className="lf-linea__m mono">{h.activos.map((a, j) => <span key={a}>{j > 0 && ', '}<Link to={`/luffy/terminal/${a}`}>{a}</Link></span>)}{h.n ? `${h.activos.length ? ' · ' : ''}${h.n} hecho${h.n > 1 ? "s" : ""} en esa lectura` : ''}</p>}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
