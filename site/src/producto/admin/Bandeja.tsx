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
  /** El informe que vale hoy para esa moneda. Los demás son historial. */
  vigente: boolean
  /** Trae el informe de cinco secciones escrito para el cliente. */
  cinco_secciones: boolean
}

const PENDIENTES = new Set(['pendiente', 'nueva_version', 'pedir_mas'])

export function Bandeja() {
  const [datos, setDatos] = useState<{ filas: FilaBandeja[]; pendientes: number; n_vigentes: number; n_obsoletos: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendientes' | 'todos'>('pendientes')
  /* Por defecto sólo lo vigente: una tarjeta por moneda. El historial se pide aparte. */
  const [verObsoletos, setVerObsoletos] = useState(false)
  useEffect(() => { api<{ filas: FilaBandeja[]; pendientes: number; n_vigentes: number; n_obsoletos: number }>('/api/admin/bandeja').then(setDatos, (e: Error) => setError(e.message)) }, [])

  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudo cargar la bandeja." detail={error} /></div>
  if (!datos) return <div className="shell p-cargando"><Loader size={72} label="Cargando la bandeja" /></div>
  const base = verObsoletos ? datos.filas : datos.filas.filter((f) => f.vigente)
  const filas = filtro === 'pendientes' ? base.filter((f) => PENDIENTES.has(f.publicacion.estado)) : base

  const n = (e: string) => base.filter((f) => f.publicacion.estado === e).length
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
          <button type="button" role="tab" aria-selected={filtro === 'pendientes'} className={`a-filtro mono ${filtro === 'pendientes' ? 'is-on' : ''}`} onClick={() => setFiltro('pendientes')}>Pendientes · {base.filter((f) => PENDIENTES.has(f.publicacion.estado)).length}</button>
          <button type="button" role="tab" aria-selected={filtro === 'todos'} className={`a-filtro mono ${filtro === 'todos' ? 'is-on' : ''}`} onClick={() => setFiltro('todos')}>Todos · {base.length}</button>
          <button type="button" className={`a-filtro a-filtro--obs mono ${verObsoletos ? 'is-on' : ''}`} aria-pressed={verObsoletos} onClick={() => setVerObsoletos((v) => !v)}>
            {verObsoletos ? 'Ocultar obsoletos' : 'Ver obsoletos'} · {datos.n_obsoletos}
          </button>
        </div>
        {filas.length === 0 && <div className="p-vacio"><EmptyState kind="vacio" title="No hay informes pendientes." detail="Cuando el motor termine una corrida nueva, aparece acá con su paquete." /></div>}
        <div className="a-lista">
          {filas.map((f) => (
            <article key={f.id} className={`a-fila a-fila--${f.publicacion.estado} ${f.verificador.estado !== 'pasa' ? 'a-fila--bloqueada' : ''} ${f.vigente ? '' : 'a-fila--obsoleta'}`}>
              <Link to={`/admin/bandeja/${f.id}`} className="a-fila__piedra" aria-hidden="true"><TierIcon tier={f.tier.toLowerCase() as 'bajo' | 'medio' | 'alto'} size={52} /></Link>
              <div className="a-fila__id">
                <Link to={`/admin/bandeja/${f.id}`} className="a-fila__sym display">{f.simbolo}</Link>
                <span className="a-fila__nombre">{f.nombre} · {f.cadena}</span>
                <span className="mono a-fila__tipo">{f.tipo}{f.a_pedido_de ? <> · <em className="a-fila__pedido">a pedido de {f.a_pedido_de}{f.simulado ? ' · simulado' : ''}</em></> : null} · v{f.version_registro} · riesgo {f.tier.toLowerCase()} · escrito {fechaHora(f.escrito_en)}</span>
                <span className="a-fila__marcas">
                  {!f.vigente && <span className="p-chip p-chip--mudo mono">obsoleto</span>}
                  <span className={`p-chip mono ${f.cinco_secciones ? 'p-chip--esm' : 'p-chip--mudo'}`} title={f.cinco_secciones ? 'Trae el informe de cinco secciones' : 'Todavía sin informe de cinco secciones'}>
                    {f.cinco_secciones ? 'cinco secciones' : 'sin cinco secciones'}
                  </span>
                </span>
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

