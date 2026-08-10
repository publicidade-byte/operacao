import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const base =
  'w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition ' +
  'placeholder:text-neutral-400 focus:ring-4 disabled:bg-neutral-50 disabled:text-neutral-500'

const ok = 'border-neutral-300 focus:border-marca-500 focus:ring-marca-500/20'
const bad = 'border-red-400 focus:border-red-500 focus:ring-red-500/20'

export function Campo({
  label,
  erro,
  dica,
  obrigatorio = true,
  children,
}: {
  label: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-800">
        {label}
        {obrigatorio && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {dica && !erro && (
        <span className="mt-1 block text-xs text-neutral-500">{dica}</span>
      )}
      {erro && (
        <span role="alert" className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-current">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 10.5h-1.5V10h1.5v1.5zm0-2.75h-1.5v-4h1.5v4z" />
          </svg>
          {erro}
        </span>
      )}
    </label>
  )
}

export function Input({
  erro,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { erro?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={erro || undefined}
      className={`${base} ${erro ? bad : ok} ${props.className ?? ''}`}
    />
  )
}

export function Textarea({
  erro,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { erro?: boolean }) {
  return (
    <textarea
      rows={3}
      {...props}
      aria-invalid={erro || undefined}
      className={`${base} ${erro ? bad : ok} resize-y ${props.className ?? ''}`}
    />
  )
}

export function Select({
  erro,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { erro?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={erro || undefined}
      className={`${base} ${erro ? bad : ok} ${props.className ?? ''}`}
    />
  )
}

/** Grupo de opções em cartões clicáveis. Melhor que radio nativo no celular. */
export function Radios({
  valor,
  onChange,
  opcoes,
  erro,
  colunas,
}: {
  valor: string | null
  onChange: (v: string) => void
  opcoes: { value: string; label: string; descricao?: string }[]
  erro?: boolean
  colunas?: 1 | 2
}) {
  const grid = colunas === 1 ? '' : 'sm:grid-cols-2'
  return (
    <div role="radiogroup" className={`grid gap-2 ${grid}`}>
      {opcoes.map((o) => {
        const sel = valor === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(o.value)}
            className={
              'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition ' +
              (sel
                ? 'border-marca-500 bg-marca-50 ring-2 ring-marca-500/40'
                : erro
                  ? 'border-red-400 bg-white hover:border-neutral-400'
                  : 'border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50')
            }
          >
            <span
              className={
                'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ' +
                (sel ? 'border-marca-600' : 'border-neutral-400')
              }
            >
              {sel && <span className="size-2 rounded-full bg-marca-600" />}
            </span>
            <span>
              <span className={sel ? 'font-semibold text-neutral-900' : 'text-neutral-700'}>
                {o.label}
              </span>
              {o.descricao && (
                <span className="block text-xs text-neutral-500">{o.descricao}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Botao({
  variante = 'primario',
  carregando,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'perigo' | 'sucesso' | 'fantasma'
  carregando?: boolean
}) {
  const estilos = {
    // Amarelo da marca com texto preto — contraste alto e identidade forte.
    primario:
      'bg-marca-400 text-neutral-900 hover:bg-marca-300 active:bg-marca-500 ' +
      'disabled:bg-neutral-200 disabled:text-neutral-400 shadow-sm',
    secundario:
      'bg-white text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50 ' +
      'disabled:text-neutral-400',
    perigo: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-neutral-200',
    sucesso: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-neutral-200',
    fantasma: 'text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-300',
  }[variante]
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${estilos} ${props.className ?? ''}`}
    >
      {carregando && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

export function Card({
  titulo,
  descricao,
  acao,
  children,
  className = '',
}: {
  titulo?: string
  descricao?: string
  acao?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-white shadow-sm ${className}`}
    >
      {titulo && (
        <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">{titulo}</h2>
            {descricao && (
              <p className="mt-0.5 text-xs text-neutral-500">{descricao}</p>
            )}
          </div>
          {acao}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Aviso({
  tom = 'info',
  children,
}: {
  tom?: 'info' | 'destaque' | 'erro' | 'sucesso'
  children: ReactNode
}) {
  const cls = {
    info: 'bg-neutral-50 text-neutral-700 ring-neutral-200',
    destaque: 'bg-marca-50 text-neutral-800 ring-marca-300',
    erro: 'bg-red-50 text-red-800 ring-red-200',
    sucesso: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }[tom]
  return (
    <div
      role={tom === 'erro' ? 'alert' : undefined}
      className={`rounded-lg px-3.5 py-3 text-sm ring-1 ${cls}`}
    >
      {children}
    </div>
  )
}

export function Etiqueta({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  )
}

export function Vazio({
  titulo,
  children,
}: {
  titulo?: string
  children: ReactNode
}) {
  return (
    <div className="py-12 text-center">
      {titulo && <p className="text-sm font-semibold text-neutral-700">{titulo}</p>}
      <p className="mt-1 text-sm text-neutral-500">{children}</p>
    </div>
  )
}

/** Marca d'água textual usada nos cabeçalhos. */
/**
 * Cypher é o nome do PORTAL. "Forma 9" continua sendo o nome da operação —
 * por isso ele segue aparecendo nos destinos, nos e-mails e no Slack, onde
 * se fala do evento, não do sistema.
 */
export function Marca({ sub }: { sub?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="relative text-sm font-black uppercase tracking-tight text-neutral-900">
        Cypher
        <span className="absolute inset-x-0 -bottom-0.5 h-1 bg-marca-400" />
      </span>
      {sub && <span className="text-xs text-neutral-500">{sub}</span>}
    </div>
  )
}
