import { Fragment, type ReactNode } from 'react'

/* ============================================================================
   Lo que escribe Luffy es Markdown ligero: negritas, listas, títulos, código,
   citas y alguna tabla. Se pinta a elementos de React, nunca a HTML crudo.
   ========================================================================== */

function enLinea(s: string, clave: string): ReactNode[] {
  const out: ReactNode[] = []
  // el guion bajo sólo abre o cierra cursiva fuera de una palabra: «social_pulso» es un nombre, no un énfasis
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|(?<![\wÀ-ÿ])_(?=\S)(?:[^_]|_(?=[\wÀ-ÿ]))+?_(?![\wÀ-ÿ])|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let i = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={`${clave}-${k++}`}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={`${clave}-${k++}`}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) { const txt = t.slice(1, t.indexOf(']')); out.push(<a key={`${clave}-${k++}`} href={m[2]} target="_blank" rel="noopener noreferrer">{txt}</a>) }
    else out.push(<em key={`${clave}-${k++}`}>{t.slice(1, -1)}</em>)
    i = m.index + t.length
  }
  if (i < s.length) out.push(s.slice(i))
  return out
}

/** Lo que escribe Luffy, sin marcas: para una vista previa de una o dos líneas. */
export function aTextoPlano(md: string): string {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*([-*•]|\d+[.)])\s+/gm, '').replace(/\|/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|[.,;:!?]|$)/g, '$1$2').replace(/[*_]{2,}/g, '')
    .replace(/\s+/g, ' ').trim()
}

export function Md({ texto, className = '' }: { texto: string; className?: string }) {
  const lineas = texto.replace(/\r/g, '').split('\n')
  const bloques: ReactNode[] = []
  let i = 0, k = 0
  const key = () => `b${k++}`
  while (i < lineas.length) {
    const l = lineas[i]
    if (!l.trim()) { i++; continue }
    if (l.startsWith('```')) {
      const cuerpo: string[] = []; i++
      while (i < lineas.length && !lineas[i].startsWith('```')) cuerpo.push(lineas[i++])
      i++
      bloques.push(<pre key={key()}><code>{cuerpo.join('\n')}</code></pre>); continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l)
    if (h) { const n = h[1].length; const kk = key(); bloques.push(n <= 2 ? <h3 key={kk}>{enLinea(h[2], kk)}</h3> : <h4 key={kk}>{enLinea(h[2], kk)}</h4>); i++; continue }
    if (/^\s*[-*•]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const ordenada = /^\s*\d+[.)]\s+/.test(l); const items: string[] = []
      while (i < lineas.length && (/^\s*[-*•]\s+/.test(lineas[i]) || /^\s*\d+[.)]\s+/.test(lineas[i]))) items.push(lineas[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
      const kk = key()
      const li = items.map((x, j) => <li key={`${kk}-${j}`}>{enLinea(x, `${kk}-${j}`)}</li>)
      bloques.push(ordenada ? <ol key={kk}>{li}</ol> : <ul key={kk}>{li}</ul>); continue
    }
    if (l.startsWith('>')) {
      const cuerpo: string[] = []
      while (i < lineas.length && lineas[i].startsWith('>')) cuerpo.push(lineas[i++].replace(/^>\s?/, ''))
      const kk = key(); bloques.push(<blockquote key={kk}>{enLinea(cuerpo.join(' '), kk)}</blockquote>); continue
    }
    if (l.trim().startsWith('|') && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
      const filas: string[][] = []
      const celdas = (x: string) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const cab = celdas(l); i += 2
      while (i < lineas.length && lineas[i].trim().startsWith('|')) filas.push(celdas(lineas[i++]))
      const kk = key()
      bloques.push(<div key={kk} className="lf-md__tabla"><table><thead><tr>{cab.map((c, j) => <th key={j}>{enLinea(c, `${kk}h${j}`)}</th>)}</tr></thead><tbody>{filas.map((f, r) => <tr key={r}>{f.map((c, j) => <td key={j}>{enLinea(c, `${kk}${r}-${j}`)}</td>)}</tr>)}</tbody></table></div>); continue
    }
    const parrafo: string[] = []
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*•]\s|\s*\d+[.)]\s|\s*\|)/.test(lineas[i])) parrafo.push(lineas[i++])
    if (!parrafo.length) { parrafo.push(l); i++ }
    const kk = key()
    bloques.push(<p key={kk}>{parrafo.map((x, j) => <Fragment key={j}>{j > 0 && <br />}{enLinea(x, `${kk}-${j}`)}</Fragment>)}</p>)
  }
  return <div className={`lf-md ${className}`}>{bloques}</div>
}
