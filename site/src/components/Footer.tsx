import { useEffect, useState } from 'react'

/* La dirección pública no se escribe aquí: sale del servidor, que la lee del entorno.
   Una sola petición para todo el sitio; si no hay dirección, el enlace no aparece. */
let cache: Promise<{ contacto: string | null }> | null = null
function useContacto() {
  const [c, setC] = useState<string | null>(null)
  useEffect(() => {
    cache ??= fetch('/api/planes', { credentials: 'same-origin' }).then((r) => r.json())
    cache.then((d) => setC(d?.contacto ?? null), () => setC(null))
  }, [])
  return c
}

export function Footer() {
  const contacto = useContacto()
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <div className="footer__brand">
          <span className="wordmark">Veta</span>
          <span className="wordmark__sub">Crypto Intelligence</span>
        </div>
        <nav className="footer__links mono" aria-label="Secciones">
          <a href="/metodologia">Cómo trabajamos</a>
          <a href="/precios">Planes</a>
          <a href="/analizar">Analiza tu moneda</a>
          <a href="/gemas">Gemas</a>
          <a href="/entrar">Entrar</a>
          {contacto && <a href={`mailto:${contacto}`}>Contacto</a>}
        </nav>
        <p className="mono footer__note">
          Research, no promesas. Nada de esto es consejo de inversión.
        </p>
      </div>
    </footer>
  )
}
