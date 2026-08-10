import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ---------------------------------------------------------------------------
// BASE DO SITE
//
// Depende de ONDE o site é servido, não do código:
//
//   Domínio próprio (cypher.matrixforma.com.br) → o site vive na raiz, então
//                              BASE é '/'. É onde ele está, por isso é o padrão.
//
//   GitHub Pages sem domínio → https://publicidade-byte.github.io/operacao/
//                              ali o site viveria dentro de /operacao/, e BASE
//                              precisaria ser '/operacao/'. Só vale para
//                              publicar num fork sem domínio.
//
// Por isso vem de variável de ambiente: o mesmo commit publica nos dois
// lugares sem precisar de edição.
//
// O roteamento se ajusta sozinho — o BrowserRouter usa import.meta.env.BASE_URL
// como basename.
// ---------------------------------------------------------------------------
const BASE = process.env.VITE_BASE ?? '/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: BASE,
})
