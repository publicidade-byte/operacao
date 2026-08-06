import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ---------------------------------------------------------------------------
// BASE DO SITE
//
// Depende de ONDE o site é servido, não do código:
//
//   GitHub Pages sem domínio → https://publicidade-byte.github.io/operacao/
//                              o site vive dentro de /operacao/, então BASE
//                              precisa ser '/operacao/'.
//
//   Cloudflare Pages, Netlify, Vercel ou domínio próprio → o site vive na
//                              raiz, então BASE é '/'.
//
// Por isso vem de variável de ambiente: o mesmo commit publica nos dois
// lugares sem precisar de edição. O padrão continua sendo o Pages, para não
// mudar o que já está no ar.
//
// O roteamento se ajusta sozinho — o BrowserRouter usa import.meta.env.BASE_URL
// como basename.
// ---------------------------------------------------------------------------
const BASE = process.env.VITE_BASE ?? '/operacao/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: BASE,
})
