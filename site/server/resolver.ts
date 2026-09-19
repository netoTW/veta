/* ============================================================================
   De lo que escribe el usuario a una moneda concreta.

   Es el respaldo de `POST /resolver` del motor (contrato §9.1) mientras esa
   ruta no exista: resuelve contra el universo, que trae un símbolo por
   moneda y sin direcciones de contrato. Por eso lo que devuelve va marcado
   `aproximada: true` y nunca puede desambiguar dos monedas con el mismo
   ticker: el universo no las distingue.
   ========================================================================== */
import type { Candidata, Moneda, Resolucion } from './motorTipos.ts'

/** Sufijos de par de exchange: lo que el usuario copia de un gráfico. */
const SUFIJOS = /[-/_]?(USDT|USDC|BUSD|USD|PERP|SWAP|SPOT|BTC|ETH)$/i
/** Una dirección de contrato: EVM o base58 de Solana. */
const EVM = /^0x[a-fA-F0-9]{40}$/
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function normalizarTicker(consulta: string): { limpio: string; normalizada: string | null } {
  const t = consulta.trim().toUpperCase()
  // Sólo se recorta si lo que queda sigue pareciendo un ticker: BTCUSDT → BTC, pero USDT queda.
  const corto = t.replace(SUFIJOS, '')
  if (corto !== t && corto.length >= 2) return { limpio: corto, normalizada: corto }
  return { limpio: t, normalizada: null }
}

export const esContrato = (c: string) => EVM.test(c.trim()) || SOLANA.test(c.trim())

export function resolverEnUniverso(consulta: string, universo: Moneda[]): Resolucion {
  const crudo = consulta.trim()
  if (esContrato(crudo)) {
    // El universo no trae contratos: no se puede resolver acá, y decirlo es mejor que adivinar.
    return { consulta: crudo, interpretada_como: 'contrato', candidatas: [], aproximada: true }
  }
  const { limpio, normalizada } = normalizarTicker(crudo)
  const exacta = universo.filter((m) => m.simbolo.toUpperCase() === limpio)
  const porNombre = universo.filter((m) => m.simbolo.toUpperCase() !== limpio
    && (m.nombre ?? '').toLowerCase().includes(crudo.toLowerCase()) && crudo.length >= 3)
  const candidatas: Candidata[] = [...exacta, ...porNombre.slice(0, 5)].map((m) => ({ ...m }))
  // Sin candidatas hay que decir igual qué se creyó leer: un ticker corto sin espacios se leyó como ticker.
  const pareceTicker = /^[A-Z0-9]{2,12}$/.test(limpio)
  return {
    consulta: crudo,
    interpretada_como: exacta.length || (!porNombre.length && pareceTicker) ? 'ticker' : 'nombre',
    normalizada,
    candidatas,
    aproximada: true,
  }
}
