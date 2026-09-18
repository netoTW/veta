import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSesion } from '../../lib/sesion'
import { api } from '../../lib/datos'
import { puede } from '../../lib/acceso'
import { CupoChip, ETAPA_LABEL, type Cupo, type Solicitud } from './piezasAnalizar'

/* ============================================================================
   Lo que vive en la barra: el cupo (siempre visible, spec §5.4) y el aviso
   de un análisis en marcha o recién terminado. El usuario puede irse de la
   espera: acá lo esperan.
   ========================================================================== */

export function CupoBarra() {
  const { rol, yo } = useSesion()
  const loc = useLocation()
  const [cupo, setCupo] = useState<Cupo | null>(null)
  const activo = !!yo?.usuario && rol !== 'admin' && puede(rol, 'analiza.profundo')
  // se vuelve a pedir al cambiar de página y cada 6 s: el contador tiene que estar al día siempre (spec §5.4)
  useEffect(() => {
    if (!activo) { setCupo(null); return }
    let vivo = true
    const tick = () => api<{ cupo: Cupo | null }>('/api/analizar/cupo').then((d) => { if (vivo) setCupo(d.cupo) }, () => {})
    tick(); const id = setInterval(tick, 6000)
    return () => { vivo = false; clearInterval(id) }
  }, [activo, loc.pathname])
  if (!activo || !cupo) return null
  return <Link to="/analizar" className="p-top__cupo" title="Análisis profundos que te quedan este ciclo"><CupoChip cupo={cupo} compacto /></Link>
}

export function AvisoAnalisis() {
  const { yo } = useSesion()
  const loc = useLocation()
  const [d, setD] = useState<{ activas: Solicitud[]; sin_ver: Solicitud[] } | null>(null)
  const [cerrados, setCerrados] = useState<string[]>([])
  useEffect(() => {
    if (!yo?.usuario) { setD(null); return }
    let vivo = true
    const tick = () => api<{ activas: Solicitud[]; sin_ver: Solicitud[] }>('/api/analizar/activas').then((x) => { if (vivo) setD(x) }, () => {})
    tick(); const id = setInterval(tick, 6000)
    return () => { vivo = false; clearInterval(id) }
  }, [yo, loc.pathname])
  if (!d) return null
  const activa = d.activas[0]
  const lista = d.sin_ver.filter((s) => !cerrados.includes(s.id) && loc.pathname !== `/analizar/s/${s.id}`)
  const marcar = (s: Solicitud) => { setCerrados((c) => [...c, s.id]); api(`/api/analizar/solicitudes/${s.id}/vista`, { cuerpo: {} }).catch(() => {}) }
  return (
    <>
      {activa && loc.pathname !== `/analizar/s/${activa.id}` && (
        <Link to={`/analizar/s/${activa.id}`} className="p-top__trabajo mono" title="Ver el avance">
          <span className="p-top__trabajo-gema" aria-hidden="true" />
          {activa.simbolo} · {activa.estado === 'en_cola' ? 'en cola' : activa.etapa ? ETAPA_LABEL[activa.etapa].titulo.toLowerCase() : 'arrancando'}
        </Link>
      )}
      {lista.length > 0 && (
        <div className="an-toasts" role="status">
          {lista.slice(0, 2).map((s) => (
            <div key={s.id} className={`an-toast an-toast--${s.estado}`}>
              <span className="an-toast__gema" aria-hidden="true" />
              <div className="an-toast__texto">
                <b>{s.simbolo}</b> {s.estado === 'listo' ? 'está listo.' : s.estado === 'bloqueado' ? 'no pasó la verificación. No se descontó.' : 'no terminó. No se descontó.'}
              </div>
              <Link to={`/analizar/s/${s.id}`} className="an-toast__ver mono" onClick={() => setCerrados((c) => [...c, s.id])}>Ver</Link>
              <button type="button" className="an-toast__x mono" onClick={() => marcar(s)} aria-label="Cerrar">×</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
