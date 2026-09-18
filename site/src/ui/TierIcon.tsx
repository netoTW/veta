/* ============================================================================
   Iconografía de riesgo — tres piedras, distinto grado de veta expuesta.

     bajo   la piedra abierta de par en par: veta esmeralda ancha e intensa
     medio  la piedra abierta a medias: veta esmeralda más angosta
     alto   la misma apertura e intensidad que bajo, pero la veta es roja:
            el color del riesgo

   Son fotografías de mineral (generadas, recortadas a alfa, en
   public/img/tier/). La misma piedra en los tres; lo único que cambia es
   cuánto se ve y de qué color. A 24 px manda la silueta; a 120 px el grano
   y la veta. Al pasar el mouse la piedra respira: la veta late (rojo más
   fuerte que verde) y la roca gira apenas.
   ========================================================================== */

export type Tier = 'bajo' | 'medio' | 'alto'

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> { tier: Tier; size?: number; className?: string; title?: string }

const LABEL: Record<Tier, string> = { bajo: 'Riesgo bajo', medio: 'Riesgo medio', alto: 'Riesgo alto' }

export function TierIcon({ tier, size = 24, className = '', title, style, ...rest }: Props) {
  // ≤ 48 px CSS (≤ 96 px físicos) usa el recorte chico; el grande sólo cuando se mira de cerca
  const src = size <= 48 ? `/img/tier/${tier}-96.webp` : `/img/tier/${tier}-480.webp`
  return (
    <img
      className={`tier tier--${tier} ${className}`}
      src={src}
      width={size} height={size}
      alt={title ?? LABEL[tier]}
      loading="lazy" decoding="async" draggable={false}
      style={{ width: size, height: size, ...style }}
      {...rest}
    />
  )
}
