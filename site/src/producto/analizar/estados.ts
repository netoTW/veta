/* ============================================================================
   Qué se le dice al cliente en cada estado de un pedido de análisis
   (ESPECIFICACION-LANZAMIENTO.md §5, contrato §20).

   Una sola tabla. La pantalla del pedido, la barra de aviso, la lista de «tus
   análisis», la notificación del navegador y la cuenta leen de aquí: si dos
   pantallas cuentan lo mismo, salen de la misma función.

   Reglas que viven en esta tabla:
   - el reloj es del motor: la web nunca da un pedido por perdido;
   - `requiere_admin` es cosa de la mesa: el cliente lo ve en cola, sin hora;
   - `bloqueado` ya no existe; un registro viejo con ese estado, o un `fallido`
     viejo con cualquier código, cae al respaldo genérico, sin el motivo crudo;
   - cualquier otra cosa (red caída, forma rara) es «estamos comprobando»:
     nunca una pantalla en blanco.
   ========================================================================== */
import { prosaDeCliente } from '../../lib/lenguaje'

export type ClaveEstado = 'en_cola' | 'reservado' | 'en_curso' | 'entregado' | 'sin_tesis' | 'no_analizable' | 'cancelado' | 'respaldo' | 'desconocido'

export interface PedidoParaEstado {
  estado: string
  simbolo: string
  nombre?: string | null
  enviada?: boolean
  posicion_cola?: number | null
  puesto?: number | null
  inicio_estimado?: string | null
  motivo_no_analizable?: string | null
  fallo?: { codigo?: string } | null
  resultado?: Record<string, unknown> | null
}

export interface TextoEstado {
  clave: ClaveEstado
  /** Para la lista y la barra: dos o tres palabras. */
  etiqueta: string
  titular: string
  cuerpo: string[]
  accion: { texto: string; a: string } | null
  /** Una segunda salida, cuando la tabla lo pide (no analizable: ficha gratis u otra moneda). */
  accion2?: { texto: string; a: string }
  /** Sigue viva: la pantalla vuelve a preguntar. */
  viva: boolean
  tono: 'oro' | 'esm' | 'mudo'
}

export const ETAPAS: { clave: string; texto: string }[] = [
  { clave: 'recolectando', texto: 'Reuniendo datos de mercado, de la cadena y del protocolo' },
  { clave: 'calculando', texto: 'Calculando riesgo, liquidez y niveles' },
  { clave: 'esceptico', texto: 'Buscando lo que podría salir mal' },
  { clave: 'redactando', texto: 'Escribiendo tu informe' },
  { clave: 'verificando', texto: 'Comprobando cada cifra contra su fuente' },
]

const CUPO_RESERVADO = 'Tu cupo está reservado, no gastado: sólo se descuenta cuando el informe está listo.'
const INTACTO = 'No se descontó nada de tu cupo.'

/** «hacia las 14:30» hoy, «mañana hacia las 09:00», o la fecha si es más lejos. En la hora del lector. */
export function horaEstimada(iso: string, ahora = new Date()): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getTime() < ahora.getTime() - 60_000) return null
  const hh = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dia = (x: Date) => x.toLocaleDateString('es', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const manana = new Date(ahora.getTime() + 86_400_000)
  if (dia(d) === dia(ahora)) return `hacia las ${hh}`
  if (dia(d) === dia(manana)) return `mañana hacia las ${hh}`
  return `el ${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })} hacia las ${hh}`
}

export function textoDeEstado(s: PedidoParaEstado, ahora = new Date()): TextoEstado {
  const nombre = s.nombre || s.simbolo
  const otra = { texto: 'Elegir otra moneda', a: '/analizar' }
  const deNuevo = { texto: 'Pedirlo de nuevo', a: `/analizar?m=${encodeURIComponent(s.simbolo)}` }

  if (s.estado === 'en_cola' && s.enviada === false) return {
    clave: 'reservado', etiqueta: 'reservado', viva: true, tono: 'oro', accion: null,
    titular: `Tu análisis de ${nombre} está reservado`,
    cuerpo: ['Arranca en el próximo turno de análisis, sin que tengas que hacer nada. Te avisamos en cuanto empiece.', CUPO_RESERVADO],
  }
  if (s.estado === 'en_cola') {
    const puesto = s.puesto ?? s.posicion_cola ?? null
    const hora = s.inicio_estimado ? horaEstimada(s.inicio_estimado, ahora) : null
    const cuando = hora ? `Empieza ${hora}.` : 'Te avisamos en cuanto empiece.'
    return {
      clave: 'en_cola', etiqueta: 'en cola', viva: true, tono: 'oro', accion: null,
      titular: `Tu análisis de ${nombre} está en la cola`,
      cuerpo: [`${puesto ? `Puesto ${puesto}. ` : ''}${cuando}`, CUPO_RESERVADO, 'Puedes cerrar esta página.'],
    }
  }
  if (s.estado === 'en_curso') return {
    clave: 'en_curso', etiqueta: 'analizando', viva: true, tono: 'oro', accion: null,
    titular: `Analizando ${nombre}`,
    cuerpo: ['Puedes cerrar esta página: te avisamos al terminar.'],
  }
  if (s.estado === 'listo') {
    const motivo = prosaDeCliente(String(s.resultado?.motivo_sin_tesis_cliente ?? ''))
    if (motivo) return {
      clave: 'sin_tesis', etiqueta: 'listo', viva: false, tono: 'esm', accion: null,
      titular: `Tu análisis de ${nombre} está listo`,
      // El motivo lo dice el informe, arriba de todo; aquí no se repite.
      cuerpo: ['Esta vez sin tesis, y te decimos por qué en el informe. Tienes la foto completa: riesgo, liquidez, quién la tiene y lo que podría salir mal.'],
    }
    return {
      clave: 'entregado', etiqueta: 'listo', viva: false, tono: 'esm', accion: null,
      titular: `Tu análisis de ${nombre} está listo`, cuerpo: [],
    }
  }
  if (s.estado === 'no_analizable') {
    const motivo = prosaDeCliente(s.motivo_no_analizable ?? '')
    return {
      clave: 'no_analizable', etiqueta: 'no da para análisis', viva: false, tono: 'mudo',
      accion: { texto: 'Ver su ficha gratis', a: `/analizar?m=${encodeURIComponent(s.simbolo)}` }, accion2: otra,
      titular: `${nombre} no da para un análisis completo`,
      cuerpo: [`${motivo ? motivo.replace(/\.?$/, '. ') : ''}${INTACTO}`],
    }
  }
  if (s.estado === 'fallido' && s.fallo?.codigo === 'cancelado') return {
    clave: 'cancelado', etiqueta: 'cancelado', viva: false, tono: 'mudo', accion: deNuevo,
    titular: 'Cancelaste este análisis', cuerpo: [INTACTO],
  }
  if (s.estado === 'fallido' || s.estado === 'bloqueado') return {
    clave: 'respaldo', etiqueta: 'no se completó', viva: false, tono: 'mudo', accion: deNuevo,
    titular: 'Este análisis no se completó', cuerpo: ['No se descontó de tu cupo: puedes pedirlo de nuevo.'],
  }
  return {
    clave: 'desconocido', etiqueta: 'comprobando', viva: true, tono: 'mudo', accion: { texto: 'Actualizar', a: '' },
    titular: 'Estamos comprobando tu pedido', cuerpo: ['Tu cupo está a salvo. Esta página se actualiza sola.'],
  }
}
