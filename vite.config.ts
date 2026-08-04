import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ---------------------------------------------------------------------------
// BASE DO SITE
//
// Hoje, sem domínio próprio, o GitHub Pages publica em:
//   https://publicidade-byte.github.io/operacao/
// por isso a base é '/operacao/'.
//
// QUANDO O DOMÍNIO FOR CONFIGURADO: troque a linha abaixo por
//   const BASE = '/'
// e faça um novo push. O roteamento se ajusta sozinho (o BrowserRouter usa
// import.meta.env.BASE_URL como basename).
// ---------------------------------------------------------------------------
const BASE = '/operacao/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: BASE,
})
