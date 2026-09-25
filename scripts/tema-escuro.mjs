import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Gera o modo escuro do painel a partir das classes que o código usa.
 *
 * A régua aqui é sobriedade: no escuro, cor saturada sobre preto puro
 * brilha e o painel vira brinquedo. Então o fundo é cinza levemente azulado
 * (não preto), as manchas de cor são discretas e o texto colorido é
 * dessaturado — a cor serve para separar, não para chamar atenção.
 */

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

/** Fundo do cartão: é sobre ele que as manchas de cor são calculadas. */
const SUPERFICIE = '#161a21'
/** Texto claro de referência, usado para dessaturar as cores de texto. */
const TINTA_CLARA = '#e7ebf2'

function valor(util, familia, shade) {
  const n = Number(shade)
  const cor = (s) => `var(--color-${familia}-${s})`
  switch (util) {
    case 'bg':
      // Etiqueta: mancha discreta, quase um cinza colorido. 12% é o ponto em
      // que a cor se distingue sem virar néon.
      if (n <= 200) return `background-color: color-mix(in oklab, ${cor(500)} 12%, ${SUPERFICIE})`
      // Cor cheia (botão, etiqueta sólida): escurece um pouco, porque no
      // escuro a mesma cor do tema claro salta e o texto branco enfraquece.
      if (n >= 600) return `background-color: color-mix(in oklab, ${cor(700)} 82%, #000)`
      return null
    case 'text':
      // Texto colorido puxado para o claro: mantém a família reconhecível,
      // sem o brilho de cor saturada sobre fundo escuro.
      if (n >= 600) return `color: color-mix(in oklab, ${cor(300)} 45%, ${TINTA_CLARA})`
      if (n === 500) return `color: color-mix(in oklab, ${cor(400)} 55%, ${TINTA_CLARA})`
      return null
    case 'placeholder':
      return `color: ${cor(400)}`
    case 'ring':
      // Contorno: presença de fio, não de moldura colorida.
      if (n >= 500) return `--tw-ring-color: color-mix(in oklab, ${cor(500)} 55%, transparent)`
      return `--tw-ring-color: color-mix(in oklab, ${cor(400)} 26%, transparent)`
    case 'border':
      if (n >= 500) return `border-color: color-mix(in oklab, ${cor(500)} 55%, transparent)`
      return `border-color: color-mix(in oklab, ${cor(400)} 26%, transparent)`
    case 'divide':
      return `border-color: color-mix(in oklab, ${cor(400)} 26%, transparent)`
    case 'accent':
      return `accent-color: ${cor(500)}`
    case 'decoration':
      return `text-decoration-color: color-mix(in oklab, ${cor(400)} 60%, transparent)`
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
const fundosCheios = new Set()
for (const token of [...tokens].sort()) {
  const partes = token.split(':')
  const base = partes.pop()
  const variantes = partes
  if (variantes.some((v) => !PSEUDO[v])) continue // sm:, group-hover: ficam de fora
  const m = base.match(/^(\w+)-([a-z]+)-(\d{2,3})(\/\d{1,3})?$/)
  if (!m) continue
  const [, util, familia, shade] = m
  if (util === 'bg' && Number(shade) >= 600 && !variantes.length) {
    fundosCheios.add('.' + base)
  }
  const decl = valor(util, familia, shade)
  if (!decl) continue
  const classe = '.' + token.replace(/([:/])/g, '\\$1')
  const sufixo = variantes.map((v) => PSEUDO[v]).join('')
  const alvo =
    util === 'divide' ? `${classe}${sufixo} > :not(:last-child)` : `${classe}${sufixo}`
  regras.push(`.escuro ${alvo} { ${decl}; }`)
}

const css = `/* ---------------------------------------------------------------------------
   MODO ESCURO DO PAINEL OPERACIONAL

   Sobriedade é a régua. No escuro, cor saturada sobre preto puro brilha e o
   painel fica com cara de brinquedo — então o fundo é cinza levemente
   azulado, as etiquetas são manchas discretas e o texto colorido é
   dessaturado. A cor continua servindo para separar (verde aprovado,
   vermelho erro, âmbar aguardando), nunca para decorar.

   Este arquivo é GERADO por scripts/tema-escuro.mjs a partir das classes que
   o código realmente usa. Classe de cor nova: rode o script de novo.

   A classe .escuro entra no <html> só enquanto o painel operacional está
   aberto — o formulário público e a consulta continuam claros.
   --------------------------------------------------------------------------- */

.escuro {
  /* Diz ao navegador para desenhar seletor de data, rolagem e autofill
     escuros. Sem isto, o calendário do campo de data abre branco. */
  color-scheme: dark;

  /* Superfícies: cinza azulado, nunca preto. Preto puro endurece o contraste
     e faz qualquer cor em cima dele vibrar. */
  --color-white: ${SUPERFICIE};
  --color-neutral-50: #0f1218;
  --color-neutral-100: #1b1f27;
  --color-neutral-200: #252a34;
  --color-neutral-300: #333945;
  /* Textos: mais claros do que a inversão pura daria. No escuro, cinza médio
     sobre fundo escuro é a primeira coisa a sumir. */
  --color-neutral-400: #8e96a5;
  --color-neutral-500: #9ea6b5;
  --color-neutral-600: #b7bfcc;
  --color-neutral-700: #ced5e0;
  --color-neutral-800: #e0e5ee;
  --color-neutral-900: #eff2f7;

  /* Amarelo da marca continua amarelo — é a identidade e o foco do teclado —
     mas um tom abaixo, porque no escuro o amarelo claro estoura. */
  --color-marca-50: #21200f;
  --color-marca-100: #2a2812;
  --color-marca-200: #3a3618;
  --color-marca-300: #e8c53f;
  --color-marca-400: #dbb62f;
  --color-marca-500: #c9a521;
  --color-marca-600: #ab8b16;
  --color-marca-700: #f0d46a;
}

/* Texto propositalmente apagado (rodapés, "—"): fica apagado, não invisível. */
.escuro .text-neutral-300 {
  color: #7e8697;
}

/* Botão e etiqueta amarelos cheios: o texto neles é preto no tema claro e
   precisa continuar preto — o cinza-900 virou quase branco. */
.escuro :is(.bg-marca-300, .bg-marca-400, .bg-marca-500, .bg-marca-600) {
  color: #14130a;
}

/* Fundo de cor cheia: o texto branco do tema claro viraria tinta escura,
   porque o branco virou superfície. Aqui ele volta a ser claro. */
.escuro :is(${[...fundosCheios].sort().join(', ')}) {
  color: ${TINTA_CLARA};
}

/* Cinza-900 e cinza-800 como FUNDO (a etiqueta "Concluída", o hover do botão)
   viravam um bloco branco no meio do painel: a coisa mais clara da tela para
   dizer a mais banal. Vira ardósia, com o texto claro por cima. */
.escuro :is(.bg-neutral-900, .bg-neutral-800, .hover\\:bg-neutral-900:hover) {
  background-color: #2c333f;
  color: ${TINTA_CLARA};
}
.escuro .ring-neutral-900 {
  --tw-ring-color: #3c4453;
}

/* Sombra não aparece no escuro; o relevo do cartão vira um fio de luz. */
.escuro :is(.shadow-sm, .shadow-lg) {
  box-shadow:
    inset 0 1px 0 0 rgb(255 255 255 / 0.04),
    0 1px 2px rgb(0 0 0 / 0.4);
}

/* ---- Cores de sinal, geradas das classes em uso ---- */
${regras.join('\n')}
`

writeFileSync('src/tema-escuro.css', css)
console.log('regras:', regras.length, '· fundos cheios:', [...fundosCheios].join(' '))
