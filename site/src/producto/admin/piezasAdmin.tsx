import type { ReactNode } from 'react'
import type { Publicacion } from '../../lib/contrato'
import { fechaHora } from '../../lib/formato'

/* ============================================================================
   Piezas de administración. Identidad propia: platino (hueso metálico) sobre
   los tres materiales. Es la mesa donde se juzgan las piedras: más cuidado
   que el Pro, no más ruido.
   ========================================================================== */

export const ESTADO_PUB_LABEL: Record<Publicacion['estado'], string> = {
  pendiente: 'Pendiente', aprobado: 'Publicado', rechazado: 'Rechazado', pedir_mas: 'Se pidió más', nueva_version: 'Nueva versión sin revisar', despublicado: 'Despublicado',
}

/** Cabecera de las páginas de admin: la mesa de corte detrás, título, lead, tiles y acciones. */
export function AdminCab({ eyebrow, titulo, lead, tiles, acciones, compacta = false, mesa = 'mesa' }: { eyebrow: ReactNode; titulo: ReactNode; lead?: ReactNode; tiles?: { k: string; v: ReactNode; tono?: 'esm' | 'oro' | 'rojo' | 'hueso' | 'mudo'; sub?: ReactNode }[]; acciones?: ReactNode; compacta?: boolean; mesa?: 'mesa' | 'tres' }) {
  return (
    <header className={`a-cab ${compacta ? 'a-cab--compacta' : ''}`}>
      <div className="a-cab__mesa" aria-hidden="true">
        <img src={`/img/admin/${mesa}-1920.webp`} srcSet={`/img/admin/${mesa}-1280.webp 1280w, /img/admin/${mesa}-1920.webp 1920w`} sizes="100vw" alt="" decoding="async" fetchPriority="high" />
        <span className="a-cab__velo" />
      </div>
      <div className="shell a-cab__inner">
        <p className="eyebrow mono a-cab__eyebrow"><span className="eyebrow__mark" aria-hidden="true" />{eyebrow}<span className="eyebrow__rule" aria-hidden="true" /></p>
        <div className="a-cab__row">
          <div className="a-cab__texto">
            <h1 className="display a-cab__title">{titulo}</h1>
            {lead && <p className="a-cab__lead body-muted">{lead}</p>}
          </div>
        </div>
        <div className="a-cab__pie">
          {tiles && tiles.length > 0 && (
            <ul className="a-kpis" aria-label="Resumen">
              {tiles.map((t) => (
                <li key={t.k} className={`a-kpi a-kpi--${t.tono ?? 'hueso'}`}>
                  <span className="a-kpi__dot" aria-hidden="true" />
                  <span className="a-kpi__v display">{t.v}</span>
                  <span className="a-kpi__k mono">{t.k}</span>
                  {t.sub && <span className="a-kpi__sub">{t.sub}</span>}
                </li>
              ))}
            </ul>
          )}
          {acciones && <div className="a-cab__acciones">{acciones}</div>}
        </div>
      </div>
    </header>
  )
}

export function EstadoPublicacion({ p, conFecha = true }: { p: Publicacion; conFecha?: boolean }) {
  return (
    <>
      <span className={`a-pub a-pub--${p.estado} mono`} title={p.ultima ? `${p.ultima.accion} · ${p.ultima.admin_email} · ${fechaHora(p.ultima.fecha)}` : 'sin decisión'}>
        <span className="a-pub__dot" aria-hidden="true" />
        <span className="a-pub__t">
          <span className="a-pub__l">{ESTADO_PUB_LABEL[p.estado]}</span>
          {conFecha && p.ultima && <span className="a-pub__quien">{fechaHora(p.ultima.fecha)} · {p.ultima.admin_email.split('@')[0]}</span>}
        </span>
      </span>
      {/* Sigue publicado. El aviso es para que lo mires, no para esconderlo. */}
      {p.revisar && (
        <span className="a-pub-revisar mono" title={p.cambios?.length ? `cambió: ${p.cambios.join(', ')}` : undefined}>
          cambió desde que lo aprobaste
          {p.version_aprobada != null && p.version_actual != null && (
            <span className="a-pub-revisar__v"> · v{p.version_aprobada} → v{p.version_actual}</span>
          )}
        </span>
      )}
    </>
  )
}

/** El sello del Verificador: pasa o corregido (esmeralda) o bloqueado (rojo, sólo registros viejos). Un sello, no un chip. */
export function SelloVerificador({ estado, hallazgos, grande = false }: { estado: string; hallazgos?: number; grande?: boolean }) {
  const pasa = estado !== 'bloqueado'
  return (
    <span className={`a-sello ${pasa ? 'a-sello--pasa' : 'a-sello--bloqueado'} ${grande ? 'a-sello--grande' : ''}`} title="Estado del Verificador">
      <span className="a-sello__gema" aria-hidden="true" />
      <span className="a-sello__t mono">
        <span className="a-sello__k">Verificador</span>
        <span className="a-sello__v">{estado || 'pasa'}{hallazgos ? ` · ${hallazgos} hallazgos` : ''}</span>
      </span>
    </span>
  )
}

/** Barra de severidad: cuántas comprometen, limitan, contextualizan. Se lee sin leyenda. */
export function BarraSeveridad({ c }: { c: { total: number; COMPROMETE_TESIS: number; LIMITA_LECTURA: number; CONTEXTO: number } }) {
  const t = Math.max(c.total, 1)
  return (
    <span className="a-sev" title={`${c.COMPROMETE_TESIS} comprometen · ${c.LIMITA_LECTURA} limitan · ${c.CONTEXTO} contexto`}>
      <span className="a-sev__n mono"><b className="num">{c.total}</b> adv.</span>
      <span className="a-sev__barra" aria-hidden="true">
        <span className="a-sev__seg a-sev__seg--c" style={{ flexGrow: c.COMPROMETE_TESIS / t }} />
        <span className="a-sev__seg a-sev__seg--l" style={{ flexGrow: c.LIMITA_LECTURA / t }} />
        <span className="a-sev__seg a-sev__seg--x" style={{ flexGrow: c.CONTEXTO / t }} />
      </span>
      <span className="a-sev__leyenda mono">
        <b className="a-sev__c num">{c.COMPROMETE_TESIS}</b><b className="a-sev__l num">{c.LIMITA_LECTURA}</b><b className="a-sev__x num">{c.CONTEXTO}</b>
      </span>
    </span>
  )
}

export const PLAN_DESC: Record<string, string> = {
  gratis: 'titular y tier de las gemas, análisis sin tesis, ledger resumido',
  base: 'todo el informe, seguimiento, watchlist, ledger detallado',
  pro: 'base + acceso anticipado, alertas, exportación, scanner',
}

/** Selector de plan como control segmentado: el plan activo se ve encendido. */
export function SegmentoPlan({ valor, onChange, disabled }: { valor: string; onChange: (p: string) => void; disabled?: boolean }) {
  return (
    <span className={`a-seg ${disabled ? 'is-off' : ''}`} role="radiogroup" aria-label="Plan">
      {(['gratis', 'base', 'pro'] as const).map((p) => (
        <button key={p} type="button" role="radio" aria-checked={valor === p} className={`a-seg__b a-seg__b--${p} mono ${valor === p ? 'is-on' : ''}`} disabled={disabled || valor === p} onClick={() => onChange(p)}>{p}</button>
      ))}
    </span>
  )
}
