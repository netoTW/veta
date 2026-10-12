/* Terminal v2 · el cliente. Las rutas y la forma vienen de contrato.ts (lo único que cambia
   cuando Mugiwara publique su sección); aquí sólo la memoria y los cortes:
   - la ficha se recuerda 45 s por moneda y rango, y lo último que llegó queda guardado sin vencer
     para pintarlo al instante mientras llega lo nuevo;
   - al cambiar de moneda se corta lo que seguía en vuelo de la anterior (salvo lo ya listo);
   - una ficha `pendiente` no se recuerda: se vuelve a pedir. */
import { pedir, qs } from '../api6b'
import { RUTAS, adaptarFicha, adaptarLista, type Ficha2, type Fila2, type Filtro2, type Orden2 } from './contrato'

const FICHAS = new Map<string, { hasta: number; p: Promise<Ficha2>; ctl: AbortController; listo: boolean }>()
const ULTIMAS = new Map<string, Ficha2>()
const clave = (a: string, r: string) => `${a.toUpperCase()}|${r}`

export const terminal2 = {
  lista: (filtro: Filtro2, orden: Orden2, q = '', signal?: AbortSignal) =>
    pedir<unknown>(`${RUTAS.lista}${qs({ filtro, orden, q, limite: 300 })}`, { signal }).then(adaptarLista) as Promise<Fila2[]>,
  ficha(activo: string, rango: string, o: { fresca?: boolean } = {}): Promise<Ficha2> {
    const k = clave(activo, rango), m = FICHAS.get(k)
    if (!o.fresca && m && m.hasta > Date.now()) return m.p
    const ctl = new AbortController()
    const p = pedir<unknown>(`${RUTAS.ficha(activo)}${qs({ rango })}`, { signal: ctl.signal, tope: 25_000 }).then(adaptarFicha)
    const e = { hasta: Date.now() + 45_000, p, ctl, listo: false }
    p.then((f) => { e.listo = true; if (f.pendiente) e.hasta = 0; ULTIMAS.delete(k); ULTIMAS.set(k, f); if (ULTIMAS.size > 40) ULTIMAS.delete(ULTIMAS.keys().next().value!) }, () => { if (FICHAS.get(k) === e) FICHAS.delete(k) })
    if (FICHAS.size > 40) FICHAS.clear()
    FICHAS.set(k, e)
    return p
  },
  guardada: (activo: string, rango: string) => ULTIMAS.get(clave(activo, rango)) ?? null,
  /** la última de esta moneda en cualquier rango: al cambiar de rango se ve algo mientras llega */
  deLaMoneda: (activo: string) => { const a = activo.toUpperCase(); for (const [k, f] of [...ULTIMAS].reverse()) if (k.startsWith(`${a}|`)) return f; return null },
  /** corta lo que sigue en vuelo, salvo la moneda de ahora */
  soltar: (salvo: string) => { for (const [k, e] of FICHAS) if (!e.listo && !k.startsWith(`${salvo.toUpperCase()}|`)) { e.ctl.abort(); FICHAS.delete(k) } },
  precargar: (activo: string, rango: string) => { const k = clave(activo, rango); if ((FICHAS.get(k)?.hasta ?? 0) > Date.now()) return; void terminal2.ficha(activo, rango).catch(() => {}) },
}
