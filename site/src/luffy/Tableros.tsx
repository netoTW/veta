import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLuffy, luffy } from './api'
import type { Tablero } from './tipos'
import { Grafico } from './charts/Grafico'
import { fmtFecha } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* Los gráficos guardados, por grupo. Se abren en el laboratorio y se editan ahí;
   aquí se renombran, se ordenan y se borran. Las vistas previas se dibujan al
   entrar en pantalla, no todas de golpe. */

function useVisible<T extends Element>() {
  const ref = useRef<T>(null); const [visible, setVisible] = useState(false)
  useEffect(() => { const el = ref.current; if (!el) return; if (!('IntersectionObserver' in window)) { setVisible(true); return } const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() } }, { rootMargin: '200px' }); io.observe(el); return () => io.disconnect() }, [])
  return { ref, visible }
}

export function Tableros() {
  const [ts, setTs] = useState<Tablero[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => { try { setTs(await luffy.tableros()); setError(null) } catch (e) { setError(e instanceof ErrorLuffy ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar() }, [cargar])
  const mover = async (id: number, d: -1 | 1) => {
    if (!ts) return
    const ids = ts.map((t) => t.id); const i = ids.indexOf(id); const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await luffy.ordenarTableros(ids); await cargar()
  }
  if (error && !ts) return <div className="shell lf-tab__vacio"><EmptyState kind="error" title="No se pudieron cargar los tableros." detail={error} /></div>
  if (!ts) return <div className="lf-tab__vacio"><span className="lf-gema is-latiendo" /></div>
  const grupos = [...new Set(ts.map((t) => t.grupo ?? ''))]
  return (
    <div className="shell lf-tab">
      <div className="lf-tab__cab">
        <div><p className="eyebrow mono"><span className="eyebrow__mark" aria-hidden="true" />Tableros<span className="eyebrow__rule" aria-hidden="true" /></p><h1 className="display lf-tab__t">Tus gráficos <em>guardados</em></h1></div>
        <Link to="/luffy/laboratorio" className="btn">Gráfico nuevo</Link>
      </div>
      {!ts.length && <EmptyState kind="vacio" title="Todavía no hay tableros." detail="Arma un gráfico en el laboratorio y guárdalo aquí." action={<Link to="/luffy/laboratorio" className="btn">Ir al laboratorio</Link>} />}
      {/* una sola rejilla: el grupo va como chip en cada tarjeta, así las tarjetas llenan las columnas */}
      <div className="lf-tab__rejilla">
        {grupos.map((g) => (
          <Fragment key={g || '_'}>
            {ts.filter((t) => (t.grupo ?? '') === g).map((t) => <Tarjeta key={t.id} t={t} recargar={cargar} mover={mover} />)}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function Tarjeta({ t, recargar, mover }: { t: Tablero; recargar: () => Promise<void>; mover: (id: number, d: -1 | 1) => Promise<void> }) {
  const { ref, visible } = useVisible<HTMLDivElement>()
  const [ren, setRen] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const renombrar = async () => { if (ren?.trim()) { await luffy.cambiarTablero(t.id, { nombre: ren.trim() }); setRen(null); await recargar() } }
  const borrar = async () => { await luffy.borrarTablero(t.id); await recargar() }
  return (
    <article className="lf-tabj" ref={ref} data-prueba="tablero" data-nombre={t.nombre}>
      <div className="lf-tabj__cab">
        {ren !== null ? (
          <form className="lf-tabj__ren" onSubmit={(e) => { e.preventDefault(); void renombrar() }}><input value={ren} onChange={(e) => setRen(e.target.value)} autoFocus maxLength={80} /><button type="submit" className="btn btn--esmeralda">Guardar</button><button type="button" className="btn btn--ghost" onClick={() => setRen(null)}>Cancelar</button></form>
        ) : (
          <><h3 className="lf-tabj__n">{t.nombre}</h3><span className="lf-tabj__m mono">{t.grupo && <em className="lf-tabj__g">{t.grupo}</em>}{t.spec.activos?.join(', ')} · {t.spec.rango ?? ''} · {fmtFecha(t.actualizado)}</span></>
        )}
      </div>
      <div className="lf-tabj__prev">{visible ? <Grafico spec={t.spec} compacto interactivo={false} rangos={false} alto={220} /> : <div style={{ height: 220 }} />}</div>
      <div className="lf-tabj__acc mono">
        <Link to={`/luffy/laboratorio/t/${t.id}`} className="lf-chip lf-chip--oro">Abrir y editar</Link>
        <button type="button" className="lf-chip" onClick={() => setRen(t.nombre)}>Renombrar</button>
        <button type="button" className="lf-chip" onClick={() => mover(t.id, -1)} aria-label="Subir">↑</button>
        <button type="button" className="lf-chip" onClick={() => mover(t.id, 1)} aria-label="Bajar">↓</button>
        {borrando ? <><button type="button" className="lf-chip lf-chip--rojo" onClick={borrar}>Sí, borrar</button><button type="button" className="lf-chip" onClick={() => setBorrando(false)}>No</button></> : <button type="button" className="lf-chip" onClick={() => setBorrando(true)}>Borrar</button>}
      </div>
    </article>
  )
}
