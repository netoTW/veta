/* ============================================================================
   Terminal v2 · el precio en vivo, directo del navegador al websocket público de
   BingX o de Binance (sin pasar por el servidor ni gastar su cupo).

   El ticker de 24 h trae el último precio y el cambio de 24 h cada segundo; con
   eso se mueven el encabezado y la vela en curso del gráfico de precio.
     - Primero BingX (donde opera Pablo); si la moneda no se opera ahí, Binance.
       Si la elegida no manda nada en 6 s, se prueba la otra.
     - BingX manda cada mensaje comprimido (gzip) y pide «Pong» a cada «Ping».
     - Se reconecta solo (1, 2, 4… hasta 30 s) y se apaga con la pestaña oculta;
       vuelve al mostrarse. Al cambiar de moneda, se cierra.
   ========================================================================== */
export type Bolsa = 'bingx' | 'binance'
export interface Tic { precio: number; cambio_pct: number | null; bolsa: Bolsa; t: number }
export type EstadoVivo = 'conectando' | 'vivo' | 'sin_datos' | 'pausado'

const BINGX = 'wss://open-api-ws.bingx.com/market'
const BINANCE = 'wss://stream.binance.com:9443/ws'

async function texto(d: unknown): Promise<string> {
  if (typeof d === 'string') return d
  const buf = d instanceof Blob ? await d.arrayBuffer() : (d as ArrayBuffer)
  // BingX: gzip
  if (typeof DecompressionStream !== 'undefined') {
    try { return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text() } catch { /* no venía comprimido */ }
  }
  return new TextDecoder().decode(buf)
}
const num = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace('%', '')) : NaN; return Number.isFinite(n) ? n : null }

export function escucharPrecio(simbolo: string, primero: Bolsa, alTic: (t: Tic) => void, alEstado: (e: EstadoVivo, b: Bolsa | null) => void): () => void {
  const sym = simbolo.toUpperCase()
  let ws: WebSocket | null = null, bolsa: Bolsa = primero, cerrado = false, espera = 1000, recibio = false
  let silencio: ReturnType<typeof setTimeout> | null = null, reintento: ReturnType<typeof setTimeout> | null = null, mudas = 0
  const otra = (b: Bolsa): Bolsa => (b === 'bingx' ? 'binance' : 'bingx')
  const limpiar = () => { if (silencio) clearTimeout(silencio); silencio = null; if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close() } catch { /* ya */ } } ws = null }

  const abrir = () => {
    if (cerrado || document.hidden) return
    limpiar(); recibio = false; alEstado('conectando', bolsa)
    const b = bolsa
    try { ws = new WebSocket(b === 'bingx' ? BINGX : `${BINANCE}/${sym.toLowerCase()}usdt@ticker`) } catch { programar(); return }
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => { if (b === 'bingx') ws?.send(JSON.stringify({ id: `t2-${sym}`, reqType: 'sub', dataType: `${sym}-USDT@ticker` })) }
    ws.onmessage = async (m) => {
      const t = await texto(m.data)
      if (t === 'Ping') { ws?.send('Pong'); return }
      let j: { data?: Record<string, unknown>; c?: unknown; P?: unknown; e?: string }
      try { j = JSON.parse(t) } catch { return }
      const d = (b === 'bingx' ? j.data : j) as Record<string, unknown> | undefined
      const precio = num(d?.c)
      if (!d || precio === null) return
      if (!recibio) { recibio = true; espera = 1000; mudas = 0; alEstado('vivo', b) }
      alTic({ precio, cambio_pct: num(d.P), bolsa: b, t: Date.now() })
    }
    ws.onclose = () => { if (!cerrado) programar() }
    ws.onerror = () => { /* el cierre que sigue reintenta */ }
    // la moneda no está en esta bolsa (o no manda nada): la otra
    silencio = setTimeout(() => {
      if (recibio || cerrado) return
      // probadas las dos sin un solo precio: no está en ninguna; se deja de insistir
      if (++mudas >= 2) { limpiar(); alEstado('sin_datos', null); return }
      bolsa = otra(b); abrir()
    }, 6000)
  }
  const programar = () => { limpiar(); if (cerrado || document.hidden) return; reintento = setTimeout(abrir, espera); espera = Math.min(30_000, espera * 2) }
  const visible = () => { if (document.hidden) { limpiar(); alEstado('pausado', null) } else abrir() }
  document.addEventListener('visibilitychange', visible)
  abrir()
  return () => { cerrado = true; document.removeEventListener('visibilitychange', visible); if (reintento) clearTimeout(reintento); limpiar() }
}
