import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/sections.css'
import './styles/publico.css'
import './styles/sistema.css'
import './styles/producto.css'
import './styles/votacion.css'
import './styles/analizar.css'
import './styles/auth.css'
import './styles/admin.css'
import './styles/charts.css'
import './styles/luffy.css'
import App from './App'

/*
 * Sin <StrictMode>, a propósito: React Three Fiber crea dos renderers sobre el
 * mismo canvas con el doble montaje de desarrollo y la escena se acumula.
 * Lo que se revisa en desarrollo es lo que se despliega.
 */
createRoot(document.getElementById('root')!).render(<App />)
