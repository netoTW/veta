/* Los colores de SISTEMA-VISUAL.md §6, para los lienzos (no leen CSS). */
export const C = {
  roca: '#0C0E10', roca2: '#15181B', roca3: '#1F2327', grano: '#2B3035',
  esm: '#1FA46F', esmLuz: '#5FE0A6', esmSombra: '#0F5A3C',
  oro: '#C9A24B', oroLuz: '#EAD189', oroSombra: '#8A6A2A',
  hueso: '#ECE6D8', ceniza: '#8E918C', ceniza2: '#5C605D',
  rojo: '#B5473E', rojoLuz: '#D9695F',
  grid: 'rgba(236,230,216,0.06)', hairline: 'rgba(236,230,216,0.10)',
}
export const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }
export const FUENTE_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"

/** Color de una serie por rol y orden: la principal es esmeralda; la segunda principal, hueso;
    los benchmarks ceniza (y oro-luz el segundo); el apoyo, un hilo de oro. */
export function colorSerie(rol: string, indice: number, tipo?: string, lado?: string): string {
  if (lado === 'vendedores') return C.rojoLuz
  if (rol === 'benchmark') return [C.ceniza, C.oroLuz, C.hueso, C.ceniza2][indice % 4]
  if (rol === 'apoyo') return [C.oro, C.oroLuz, C.hueso][indice % 3]
  if (tipo === 'pulso_bots') return C.ceniza
  if (tipo === 'pulso_granjas') return C.rojoLuz
  return [C.esmLuz, C.hueso, C.oroLuz, C.ceniza][indice % 4]
}
