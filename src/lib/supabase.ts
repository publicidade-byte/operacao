import { createClient } from '@supabase/supabase-js'

// Projeto de produção. Estes dois valores são PÚBLICOS por definição: a
// publishable key é feita para ficar no JavaScript do navegador — quem protege
// os dados é a Row Level Security do banco, não o sigilo da chave.
// Por isso ficam versionados: o build funciona sem configuração extra.
// A secret key (sb_secret_...) NUNCA entra aqui — ela vive só nos secrets das
// Edge Functions.
const URL_PADRAO = 'https://tvszasxlyyeibhafofsa.supabase.co'
const CHAVE_PADRAO = 'sb_publishable_oi_66nZssxrGSX1-nGNDmw_vdq4X4qK'

// O .env local sobrescreve, útil para apontar para um projeto de homologação.
const url = import.meta.env.VITE_SUPABASE_URL || URL_PADRAO
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || CHAVE_PADRAO

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Chama uma Edge Function. Erros voltam como Error com a mensagem do servidor. */
export async function invocar<T>(nome: string, body: unknown): Promise<T> {
  const res = await fetch(`${url}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.erro ?? `Falha na requisição (${res.status})`)
  return json as T
}

/**
 * Igual à `invocar`, mas manda o token do usuário logado em vez da chave
 * pública. Necessário quando a função precisa saber QUEM está chamando —
 * é assim que `gerir-usuarios` confirma que quem pediu é gestor.
 */
export async function invocarComoUsuario<T>(nome: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre novamente.')

  const res = await fetch(`${url}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.erro ?? `Falha na requisição (${res.status})`)
  return json as T
}
