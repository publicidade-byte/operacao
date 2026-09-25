import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Famílias de sinal (verde = aprovado, vermelho = erro, etc.). O cinza, o
// branco e o amarelo da marca são tratados à parte, trocando as variáveis.
const FAMILIAS = [
  'emerald',
  'red',
  'amber',
  'sky',
  'fuchsia',
  'teal',
  'violet',
  'rose',
  'purple',
  'orange',
  'lime',
  'cyan',
  'blue',
]

const arquivos = []
;(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) varrer(caminho)
    else if (/\.(tsx|ts)$/.test(caminho)) arquivos.push(caminho)
  }
})('src')

const tokens = new Set()
const re = new RegExp(
  `\\b((?:(?:hover|focus|focus-visible|active|disabled|group-hover|sm|md|lg):)*)` +
    `(bg|text|ring|border|divide|accent|decoration|placeholder|outline)-` +
    `(${FAMILIAS.join('|')})-(50|100|200|300|400|500|600|700|800|900|950)(\\/\\d{1,3})?\\b`,
  'g',
)
for (const a of arquivos) {
  const texto = readFileSync(a, 'utf8')
  for (const m of texto.matchAll(re)) tokens.add(m[0])
}

// Fundo dos cartões no escuro: é sobre ele que as manchas de cor são feitas.
const SUPERFICIE = '#121214'

function valor(util, familia, shade) {
  const n = Number(shade)
  const cor = (s) => `var(--color-${familia}-${s})`
  switch (util) {
    case 'bg':
      // Mancha clara (chip) vira mancha escura da mesma cor; cor cheia
      // (botão) clareia um pouco, porque o texto nela passa a ser escuro.
      if (n <= 200) return `background-color: color-mix(in oklab, ${cor(500)} 20%, ${SUPERFICIE})`
      if (n >= 600) return `background-color: ${cor(500)}`
      return null
    case 'text':
      if (n >= 600) return `color: ${cor(300)}`
      if (n === 500) return `color: ${cor(400)}`
      return null
    case 'placeholder':
      return `color: ${cor(400)}`
    case 'ring':
      if (n >= 500) return `--tw-ring-color: ${cor(500)}`
      return `--tw-ring-color: color-mix(in oklab, ${cor(400)} 45%, transparent)`
    case 'border':
      if (n >= 500) return `border-color: ${cor(500)}`
      return `border-color: color-mix(in oklab, ${cor(400)} 45%, transparent)`
    case 'divide':
      return `border-color: color-mix(in oklab, ${cor(400)} 45%, transparent)`
    case 'accent':
      return `accent-color: ${cor(500)}`
    case 'decoration':
      return `text-decoration-color: ${cor(400)}`
    case 'outline':
      return `outline-color: ${cor(500)}`
    default:
      return null
  }
}

const PSEUDO = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  active: ':active',
  disabled: ':disabled',
}

const regras = []
for (const token of [...tokens].sort()) {
  const partes = token.split(':')
  const base = partes.pop()
  const variantes = partes
  if (variantes.some((v) => !PSEUDO[v])) continue // sm:, group-hover: ficam de fora
  const m = base.match(/^(\w+)-([a-z]+)-(\d{2,3})(\/\d{1,3})?$/)
  if (!m) continue
  const [, util, familia, shade] = m
  const decl = valor(util, familia, shade)
  if (!decl) continue
  const classe = '.' + token.replace(/([:/])/g, '\\$1')
  const sufixo = variantes.map((v) => PSEUDO[v]).join('')
  const alvo =
    util === 'divide'
      ? `${classe}${sufixo} > :not(:last-child)`
      : `${classe}${sufixo}`
  regras.push(`.escuro ${alvo} { ${decl}; }`)
}

const css = `/* ---------------------------------------------------------------------------
   MODO ESCURO DO PAINEL OPERACIONAL

   O tema claro é a referência: aqui só trocamos o valor das cores, nunca o
   significado. Cinza e branco viram uma escala escura (variáveis abaixo), e
   cada cor de sinal — verde aprovado, vermelho erro, âmbar aguardando —
   vira a mesma cor sobre fundo escuro, com o texto clareado para continuar
   legível.

   Este arquivo é GERADO por scripts/tema-escuro.mjs a partir das classes que
   o código realmente usa. Classe nova de cor: rode o script de novo.

   A classe .escuro entra no <html> só enquanto o painel operacional está
   aberto — o formulário público e a consulta continuam claros.
   --------------------------------------------------------------------------- */

.escuro {
  /* Diz ao navegador para desenhar seletor de data, rolagem e autofill
     escuros. Sem isto, o calendário do campo de data abre branco. */
  color-scheme: dark;

  /* Superfícies: branco vira a cor do cartão; a escala de cinza inverte. */
  --color-white: ${SUPERFICIE};
  --color-neutral-50: #0b0b0d;
  --color-neutral-100: #1a1a1e;
  --color-neutral-200: #26262c;
  --color-neutral-300: #3a3a42;
  /* Textos secundários ficam mais claros do que a inversão pura daria:
     no escuro, cinza médio sobre preto é o primeiro a sumir. */
  --color-neutral-400: #8f8f9a;
  --color-neutral-500: #a3a3ad;
  --color-neutral-600: #bdbdc6;
  --color-neutral-700: #d6d6dd;
  --color-neutral-800: #e8e8ed;
  --color-neutral-900: #f6f6f8;

  /* Amarelo da marca continua amarelo: é a identidade e o foco do teclado.
     Só as manchas claras (fundo de etiqueta) escurecem. */
  --color-marca-50: #221d00;
  --color-marca-100: #2c2500;
  --color-marca-200: #3b3200;
  --color-marca-700: #ffe14d;
}

/* Texto propositalmente apagado (rodapés, "—"): fica apagado, não invisível. */
.escuro .text-neutral-300 {
  color: #7e7e89;
}

/* Botão amarelo e etiquetas amarelas cheias: o texto nelas é preto no claro
   e precisa continuar preto no escuro — o cinza-900 virou quase branco. */
.escuro :is(.bg-marca-300, .bg-marca-400, .bg-marca-500, .bg-marca-600) {
  color: #14130a;
}

/* A sombra some no escuro; um contorno fino devolve o relevo dos cartões. */
.escuro :is(.shadow-sm, .shadow-lg) {
  box-shadow: 0 1px 0 0 rgb(255 255 255 / 0.06), 0 8px 24px rgb(0 0 0 / 0.45);
}

/* ---- Cores de sinal, geradas das classes em uso ---- */
${regras.join('\n')}
`

writeFileSync('src/tema-escuro.css', css)
console.log('regras:', regras.length)
