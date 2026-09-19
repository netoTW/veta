import { useEffect, useState } from 'react'

/* El nav público no expone el laboratorio de diseño: sólo entrar y la acción. */
const LINKS: { href: string; label: string }[] = [{ href: '/metodologia', label: 'Cómo trabajamos' }, { href: '/precios', label: 'Planes' }]

export function Nav() {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className={`nav ${stuck ? 'is-stuck' : ''}`}>
      <div className="nav__inner shell">
        <a href="/" className="nav__logo" aria-label="VETA, ir al inicio">
          <img src="/img/logo-mark.webp" alt="" width={460} height={345} />
          <span className="wordmark nav__word">Veta</span>
        </a>

        <nav className="nav__links mono" aria-label="Secciones">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>

        <a href="/entrar" className="nav__entrar mono">Entrar</a>
        <a href="/analizar" className="btn nav__cta">Analiza tu moneda</a>

        <button
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-controls="nav-mobile"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="vh">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
          <span className={`nav__burger ${open ? 'is-open' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div id="nav-mobile" className={`nav__mobile ${open ? 'is-open' : ''}`} hidden={!open}>
        <nav aria-label="Secciones (móvil)">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="display" onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <a href="/analizar" className="btn" onClick={() => setOpen(false)}>Analiza tu moneda</a>
        </nav>
      </div>
    </header>
  )
}
