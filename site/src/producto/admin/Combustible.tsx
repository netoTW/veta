import { usd } from '../../lib/formato'

/* ============================================================================
   Combustible · sólo admin (ESPECIFICACION-LANZAMIENTO.md §10, contrato §21.5).

   Cuánta posición apalancada está expuesta y de qué lado, desde el mapa de
   liquidación proyectada. No calibrado: indica volatilidad, no dirección, y no
   produce magnitud. El servidor no lo manda a nadie más (contenido.paraCliente).
   ========================================================================== */
export interface Combustible {
  hay_combustible?: boolean; lado_dominante?: string; notional_largo?: number | null; notional_corto?: number | null
  squeeze_setup?: boolean; lectura?: string; confianza?: string; calibrado?: boolean; indica?: string
  motivo_ausencia?: string; venues?: string[]; fuente?: string
}

export function PanelCombustible({ c }: { c: Combustible | null | undefined }) {
  if (!c) return null
  return (
    <section className="a-comb" aria-label="Combustible (sólo admin)">
      <div className="a-comb__cab">
        <span className="mono a-comb__k">Combustible · sólo admin</span>
        <span className="mono a-comb__estado">{c.hay_combustible ? `lado dominante: ${c.lado_dominante ?? '—'}` : 'sin combustible medible'}{c.calibrado === false ? ' · no calibrado' : ''}</span>
      </div>
      {c.hay_combustible ? (
        <>
          <dl className="a-comb__kv">
            <dt>Nocional largo</dt><dd className="num">{typeof c.notional_largo === 'number' ? usd(c.notional_largo) : '—'}</dd>
            <dt>Nocional corto</dt><dd className="num">{typeof c.notional_corto === 'number' ? usd(c.notional_corto) : '—'}</dd>
            <dt>squeeze_setup</dt><dd className="mono">{c.squeeze_setup ? 'sí' : 'no'}</dd>
            <dt>Confianza</dt><dd>{c.confianza ?? '—'}</dd>
            <dt>Indica</dt><dd>{c.indica ?? '—'}</dd>
            <dt>Mercados</dt><dd className="mono">{(c.venues ?? []).join(', ') || '—'}</dd>
          </dl>
          {c.lectura && <p className="a-comb__lectura">{c.lectura}</p>}
        </>
      ) : <p className="a-comb__lectura">{c.motivo_ausencia || 'El motor no dejó motivo.'}</p>}
      {c.fuente && <p className="mono a-comb__fuente">{c.fuente}</p>}
    </section>
  )
}
