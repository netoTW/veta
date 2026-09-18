import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Todo /api va al servidor de Node (auth, contenido, admin). Misma origen para el navegador.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
})
