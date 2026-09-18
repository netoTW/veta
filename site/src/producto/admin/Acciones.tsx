import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminCab } from './piezasAdmin'
import { api } from '../../lib/datos'
import { fecha, fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'

interface Accion { id: number; admin_email: string; accion: string; objetivo_tipo: string; objetivo_id: string | null; detalle: string | null; fecha: string }

/** Quién cambió qué y cuándo. Hoy es Pablo; cuando entren socios, importa. */
export function Acciones() {
  const [lista, setLista] = useState<Accion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<{ acciones: Accion[] }>('/api/admin/acciones').then((d) => setLista(d.acciones), (e: Error) => setError(e.message)) }, [])
  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudo cargar el registro." detail={error} /></div>
  if (!lista) return <div className="shell p-cargando"><Loader size={72} label="Cargando el registro" /></div>
  const enlace = (a: Accion) => a.objetivo_tipo === 'usuario' ? `/admin/cuentas/${a.objetivo_id}` : `/admin/bandeja/${a.objetivo_id}`
  const dias = [...new Set(lista.map((a) => a.fecha.slice(0, 10)))]
  const tono = (a: string) => a.includes('aprobar') ? 'esm' : a.includes('rechazar') || a.includes('despublicar') || a.includes('suspender') ? 'rojo' : a.includes('pedir') || a.includes('impersonar') ? 'oro' : 'hueso'
  return (
    <>
      <AdminCab compacta eyebrow={<>Administración · Registro de acciones</>} titulo={<>Quién cambió qué, <em>y cuándo.</em></>} lead="Cada decisión de la bandeja y cada cambio en una cuenta queda acá, con el admin que lo hizo." tiles={[{ k: 'acciones', v: lista.length, tono: 'hueso' }, { k: 'admins', v: new Set(lista.map((a) => a.admin_email)).size, tono: 'oro' }]} />
      <div className="shell">
        {lista.length === 0 ? <div className="p-vacio"><EmptyState kind="vacio" title="Todavía no hay acciones registradas." /></div> : (
          <ol className="a-linea">
            {dias.map((d) => (
              <li key={d} className="a-linea__dia">
                <span className="a-linea__fecha mono">{fecha(d)}</span>
                <ol>
                  {lista.filter((a) => a.fecha.startsWith(d)).map((a) => (
                    <li key={a.id} className={`a-linea__item a-linea__item--${tono(a.accion)}`}>
                      <span className="a-linea__gema" aria-hidden="true" />
                      <span className="a-linea__hora num">{fechaHora(a.fecha).split('·')[1]?.trim()}</span>
                      <span className="a-linea__accion mono">{a.accion}</span>
                      <span className="a-linea__sobre">{a.objetivo_id ? <Link to={enlace(a)}>{a.objetivo_tipo} · {a.objetivo_id}</Link> : a.objetivo_tipo}</span>
                      <span className="a-linea__quien">{a.admin_email}</span>
                      {a.detalle && <span className="a-log__det">{a.detalle}</span>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
