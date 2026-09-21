import { useCallback, useEffect, useState } from 'react'
import { api, ErrorApi } from '../../lib/datos'
import { fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'
import { AdminCab } from './piezasAdmin'

/* ============================================================================
   Enlaces cortos de redes.

   `vetalab.io/ig` lleva al inicio marcando de dónde viene la visita, porque la
   bio de Instagram enseña la URL entera y ahí no caben los UTM.

   Se gobiernan desde aquí y no desde el código: cambiar a dónde apunta uno, o
   crear el de una campaña nueva, no puede depender de un despliegue.
   ========================================================================== */

interface Enlace {
  slug: string; destino: string
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
  activo: number; notas: string | null
  visitas: number; ultima_visita: string | null
  url: string; destino_final: string
}

const VACIO = { slug: '', destino: '/', utm_source: '', utm_medium: '', utm_campaign: '', notas: '' }

export function Enlaces() {
  const [datos, setDatos] = useState<{ enlaces: Enlace[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ ...VACIO })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => api<{ enlaces: Enlace[] }>('/api/admin/enlaces')
    .then(setDatos, (e: Error) => setError(e.message)), [])
  useEffect(() => { void cargar() }, [cargar])

  const guardar = async () => {
    setGuardando(true); setMsg(null)
    try {
      await api('/api/admin/enlaces', { cuerpo: form })
      setMsg(`Guardado /${form.slug}`); setForm({ ...VACIO }); await cargar()
    } catch (e) {
      setMsg(e instanceof ErrorApi ? (e.cuerpo.detalle as string) ?? e.message : String(e))
    } finally { setGuardando(false) }
  }

  const editar = (e: Enlace) => setForm({
    slug: e.slug, destino: e.destino,
    utm_source: e.utm_source ?? '', utm_medium: e.utm_medium ?? '',
    utm_campaign: e.utm_campaign ?? '', notas: e.notas ?? '',
  })

  const borrar = async (slug: string) => {
    setMsg(null)
    try { await api(`/api/admin/enlaces/${slug}/borrar`, { cuerpo: {} }); setMsg(`Borrado /${slug}`); await cargar() }
    catch (e) { setMsg(e instanceof ErrorApi ? e.message : String(e)) }
  }

  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudieron cargar los enlaces." detail={error} /></div>
  if (!datos) return <div className="shell p-cargando"><Loader size={72} label="Cargando los enlaces" /></div>

  return (
    <>
      <AdminCab
        compacta
        eyebrow="Enlaces cortos"
        titulo={<>De dónde viene <em>cada visita</em>.</>}
        lead="Se cambian aquí y surten efecto en la siguiente visita: la redirección es temporal a propósito, para que ningún navegador se quede con el destino viejo."
      />
      <div className="shell">
        {msg && <p className="a-msg mono" role="status">{msg}</p>}

        <section className="p-card a-enl__form">
          <span className="mono a-sec__k">{datos.enlaces.some((e) => e.slug === form.slug) ? `Editando /${form.slug}` : 'Nuevo enlace'}</span>
          <div className="a-enl__campos">
            <label><span className="mono">slug</span><input value={form.slug} onChange={(ev) => setForm({ ...form, slug: ev.target.value })} placeholder="ig" autoComplete="off" /></label>
            <label><span className="mono">destino</span><input value={form.destino} onChange={(ev) => setForm({ ...form, destino: ev.target.value })} placeholder="/" autoComplete="off" /></label>
            <label><span className="mono">utm_source</span><input value={form.utm_source} onChange={(ev) => setForm({ ...form, utm_source: ev.target.value })} placeholder="instagram" autoComplete="off" /></label>
            <label><span className="mono">utm_medium</span><input value={form.utm_medium} onChange={(ev) => setForm({ ...form, utm_medium: ev.target.value })} placeholder="bio" autoComplete="off" /></label>
            <label><span className="mono">utm_campaign</span><input value={form.utm_campaign} onChange={(ev) => setForm({ ...form, utm_campaign: ev.target.value })} placeholder="(opcional)" autoComplete="off" /></label>
            <label className="a-enl__ancho"><span className="mono">notas</span><input value={form.notas} onChange={(ev) => setForm({ ...form, notas: ev.target.value })} placeholder="para qué es" autoComplete="off" /></label>
          </div>
          <div className="a-acciones">
            <button type="button" className="btn" disabled={!form.slug.trim() || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            {form.slug && <button type="button" className="btn btn--ghost" onClick={() => setForm({ ...VACIO })}>Limpiar</button>}
          </div>
        </section>

        <div className="a-enl__lista">
          {datos.enlaces.map((e) => (
            <article key={e.slug} className={`a-enl ${e.activo ? '' : 'a-enl--off'}`}>
              <div className="a-enl__id">
                <b className="mono">{e.url}</b>
                {e.notas && <span className="a-enl__notas">{e.notas}</span>}
              </div>
              <div className="a-enl__destino mono">{e.destino_final.replace(/^https?:\/\//, '')}</div>
              <div className="a-enl__uso mono">
                {e.visitas} {e.visitas === 1 ? 'visita' : 'visitas'}
                {e.ultima_visita && <span className="a-enl__ult"> · última {fechaHora(e.ultima_visita)}</span>}
              </div>
              <div className="a-enl__acciones">
                <button type="button" className="btn btn--ghost" onClick={() => editar(e)}>Editar</button>
                <button type="button" className="btn btn--ghost" onClick={() => borrar(e.slug)}>Borrar</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
