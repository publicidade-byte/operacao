/** Utilidades de máscara, validação e formatação — pt-BR. */

export const soDigitos = (v: string) => v.replace(/\D/g, '')

export function mascaraCpf(v: string) {
  const d = soDigitos(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** Valida CPF por dígito verificador. */
export function cpfValido(v: string) {
  const cpf = soDigitos(v)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false
  for (let t = 9; t < 11; t++) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += parseInt(cpf[i]) * (t + 1 - i)
    let dig = ((soma * 10) % 11) % 10
    if (dig !== parseInt(cpf[t])) return false
  }
  return true
}

/** Mascara para exibição no painel: ***.456.789-** */
export function cpfMascarado(cpf: string) {
  const d = soDigitos(cpf)
  if (d.length !== 11) return cpf
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

export function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export const telefoneValido = (v: string) => {
  const d = soDigitos(v)
  return d.length === 10 || d.length === 11
}

export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/** '2026-10-05' -> '05/10/2026' (sem cair na armadilha de fuso do Date) */
export function dataBR(iso?: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** '2026-10-05' -> '05/10' */
export function dataCurta(iso?: string | null) {
  if (!iso) return '—'
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

export function dataHoraBR(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Para preencher <input type="datetime-local"> a partir de um timestamptz. */
export function paraInputDateTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

export const moeda = (v?: number | string | null) =>
  v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function idade(nascimento: string) {
  const [a, m, d] = nascimento.slice(0, 10).split('-').map(Number)
  const hoje = new Date()
  let anos = hoje.getFullYear() - a
  const passou =
    hoje.getMonth() + 1 > m || (hoje.getMonth() + 1 === m && hoje.getDate() >= d)
  if (!passou) anos--
  return anos
}
