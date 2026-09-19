export function Footer() {
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
        </nav>
        <p className="mono footer__note">
          Research, no promesas. Nada de esto es consejo de inversión.
        </p>
      </div>
    </footer>
  )
}
