import { cifraCliente, type ContextoCifra } from '../lib/formato'

/** Una cifra de cliente, formateada por §23 y marcada para la prueba de contrato:
    `campo` es la ruta del dato en el registro (p. ej. «ficha_esencial.precio_y_fecha_referencia.precio_usd»). */
export function Cifra({ campo, v, u, c = 'normal', className }: { campo: string; v: number | null | undefined; u: string | null; c?: ContextoCifra; className?: string }) {
  const t = cifraCliente(v, u, c)
  if (!t) return null
  return <span className={className} data-cifra={campo} data-valor={String(v)} data-unidad={u ?? ''} data-contexto={c}>{t}</span>
}
