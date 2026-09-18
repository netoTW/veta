import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TierIcon } from '../../ui/TierIcon'
import { api } from '../../lib/datos'
import { fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'
import type { Publicacion, Tier } from '../../lib/contrato'
import { AdminCab, BarraSeveridad, EstadoPublicacion, SelloVerificador } from './piezasAdmin'

/* ============================================================================
   Bandeja de aprobación — donde se decide qué se publica.
   Lista cada informe del motor (gema o análisis) con el estado del
   Verificador, las objeciones del Escéptico, las advertencias por severidad
   y su estado de publicación. Nada se publica sin el clic de acá.
   ========================================================================== */

export interface FilaBandeja {
  id: string; tipo: 'gema' | 'analisis'; simbolo: string; nombre: string; cadena: string; tier: Tier; a_pedido_de?: string | null; simulado?: boolean
  version_registro: number; escrito_en: string; fecha_publicacion: string; origen: string
  verificador: { estado: string; motivo_bloqueo: string; hallazgos: number }
  esceptico: { objeciones: number; rechaza: boolean }
  advertencias: { total: number; COMPROMETE_TESIS: number; LIMITA_LECTURA: number; CONTEXTO: number }
  contradicciones: { campo: string; dice: string; motor: string; sobre: string }[]
  publicacion: Publicacion
}

const PENDIENTES = new Set(['pendiente', 'nueva_version', 'pedir_mas'])

export function Bandeja() {
  const [datos, setDatos] = useState<{ filas: FilaBandeja[]; pendientes: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendientes' | 'todos'>('pendientes')
  useEffect(() => { api<{ filas: FilaBandeja[]; pendientes: number }>('/api/admin/bandeja').then(setDatos, (e: Error) => setError(e.message)) }, [])

  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudo cargar la bandeja." detail={error} /></div>
  if (!datos) return <div className="shell p-cargando"><Loader size={72} label="Cargando la bandeja" /></div>
  const filas = filtro === 'pendientes' ? datos.filas.filter((f) => PENDIENTES.has(f.publicacion.estado)) : datos.filas

  const n = (e: string) => datos.filas.filter((f) => f.publicacion.estado === e).length
  return (
    <>
      <AdminCab
        eyebrow={<>Administración · Bandeja de aprobación</>}
        titulo={<>Nada se publica <em>sin este clic.</em></>}
        lead="Cada informe llega con el sello del Verificador, las objeciones del Escéptico y sus advertencias por severidad. Aprobar lo hace visible según plan; rechazar y pedir más exigen un motivo escrito."
        tiles={[
          { k: 'pendientes', v: datos.pendientes, tono: 'oro', sub: 'esperan tu decisión' },
          { k: 'publicados', v: n('aprobado'), tono: 'esm', sub: 'visibles según plan' },
          { k: 'se pidió más', v: n('pedir_mas'), tono: 'hueso' },
          { k: 'rechazados', v: n('rechazado') + n('despublicado'), tono: 'rojo' },
        ]}
        acciones={<Link to="/admin/acciones" className="btn btn--ghost">Registro de acciones</Link>}
      />
      <div className="shell">
        <div className="a-filtros" role="tablist">
          <button type="button" role="tab" aria-selected={filtro === 'pendientes'} className={`a-filtro mono ${filtro === 'pendientes' ? 'is-on' : ''}`} onClick={() => setFiltro('pendientes')}>Pendientes · {datos.filas.filter((f) => PENDIENTES.has(f.publicacion.estado)).length}</button>
          <button type="button" role="tab" aria-selected={filtro === 'todos'} className={`a-filtro mono ${filtro === 'todos' ? 'is-on' : ''}`} onClick={() => setFiltro('todos')}>Todos · {datos.filas.length}</button>
        </div>
        {filas.length === 0 && <div className="p-vacio"><EmptyState kind="vacio" title="No hay informes pendientes." detail="Cuando el motor termine una corrida nueva, aparece acá con su paquete." /></div>}
        <div className="a-lista">
          {filas.map((f) => (
            <article key={f.id} className={`a-fila a-fila--${f.publicacion.estado} ${f.verificador.estado !== 'pasa' ? 'a-fila--bloqueada' : ''}`}>
              <Link to={`/admin/bandeja/${f.id}`} className="a-fila__piedra" aria-hidden="true"><TierIcon tier={f.tier.toLowerCase() as 'bajo' | 'medio' | 'alto'} size={52} /></Link>
              <div className="a-fila__id">
                <Link to={`/admin/bandeja/${f.id}`} className="a-fila__sym display">{f.simbolo}</Link>
                <span className="a-fila__nombre">{f.nombre} · {f.cadena}</span>
                <span className="mono a-fila__tipo">{f.tipo}{f.a_pedido_de ? <> · <em className="a-fila__pedido">a pedido de {f.a_pedido_de}{f.simulado ? ' · simulado' : ''}</em></> : null} · v{f.version_registro} · riesgo {f.tier.toLowerCase()} · escrito {fechaHora(f.escrito_en)}</span>
              </div>
              <div className="a-fila__meta">
                <SelloVerificador estado={f.verificador.estado} hallazgos={f.verificador.hallazgos} />
                <span className={`p-chip mono ${f.esceptico.rechaza ? 'p-chip--rojo' : 'p-chip--mudo'}`}>Escéptico · {f.esceptico.objeciones} objeciones{f.esceptico.rechaza ? ' · rechaza' : ''}</span>
                <BarraSeveridad c={f.advertencias} />
                {f.contradicciones.length > 0 && <span className="p-chip p-chip--rojo mono" title={f.contradicciones.map((c) => `${c.campo}: «${c.dice}» vs ${c.motor}`).join('\n')}>prosa contradice al motor · {f.contradicciones.length}</span>}
              </div>
              <div className="a-fila__estado"><EstadoPublicacion p={f.publicacion} /></div>
              <Link to={`/admin/bandeja/${f.id}`} className="btn a-fila__ir">Revisar</Link>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}

