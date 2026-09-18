/* ============================================================================
   El motor visto desde la web: un contrato, dos implementaciones.

   La interfaz de abajo es el PUNTO DE ENCHUFE. Todo lo que la web sabe del
   motor pasa por aquí: buscar una moneda, pedir la lectura determinista
   (instantánea, gratis), pedir el análisis profundo (minutos, con cupo) y
   leer su progreso. Hoy responde `motorSimulado.ts` (recorre las etapas con
   tiempos reales sin gastar un peso); cuando el motor implemente el
   contrato (CONTRATO-ANALISIS-A-PEDIDO.md) se enchufa `motorHttp.ts` con
   VETA_MOTOR=http, sin tocar rutas ni interfaz.
   ========================================================================== */
import { ENV } from './entorno.ts'
import { motor as simulado } from './motorSimulado.ts'
import { motor as http } from './motorHttp.ts'
import type { Motor } from './motorTipos.ts'

export * from './motorTipos.ts'

export const motor: Motor = ENV.MOTOR === 'http' ? http : simulado
