/* Lo que el formulario le dice a la roca. Vive aparte de HeroScene para que
   quien sólo necesita el estado (las páginas de acceso, «Analiza tu moneda») no
   arrastre three.js entero: /restablecer cargaba 416 KB de 3D para un formulario.

   `u` es el avance de la grieta, `open` cuánto se abre, `tint` el tinte de la veta
   (0 esmeralda · 1 rojo: la llave equivocada), `shake` un pulso de temblor que la
   escena consume y `dolly` el acercamiento de cámara del éxito. */
export interface Control {
  /** Avance objetivo de la propagación, 0..1. Se mapea a los saltos reales. */
  u: number
  open: number
  form: number
  tint: number
  /** Pulso de temblor: la escena lo consume (lo vuelve a 0). */
  shake: number
  dolly: number
}
export const controlInicial = (): Control => ({ u: 0.12, open: 0, form: 1, tint: 0, shake: 0, dolly: 0 })
