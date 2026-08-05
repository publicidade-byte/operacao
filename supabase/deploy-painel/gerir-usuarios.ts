// Funcao autocontida: o modulo compartilhado foi embutido para permitir
// deploy pelo painel do Supabase, que aceita um arquivo so.

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

export const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status)

/** Cliente admin (service_role). Só existe dentro da Edge Function. */
export function admin() {
  return {
    url: Deno.env.get('SUPABASE_URL')!,
    key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }
}

export const dataBR = (iso?: string | null) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const dataHoraBR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

export const moeda = (v?: number | null) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const EQUIPE_LABEL: Record<string, string> = {
  EQUIPE_MEDICA: 'Equipe Médica',
  EQUIPE_TECNICA: 'Equipe Técnica',
  DIRETORIA: 'Diretoria',
  LOJINHA_FORMA: 'Lojinha da Forma',
  FOTIX: 'Fotix',
  COMERCIAL: 'Comercial',
  CONSELHO: 'Conselho',
  RE: 'R.E.',
  MARKETING: 'Marketing',
  MONITORIA: 'Monitoria',
  SEGURANCA: 'Segurança',
  SALVA_VIDAS: 'Salva-Vidas',
  OUTROS: 'Outros',
  DJ: 'DJ',
}

/**
 * Envia e-mail via Resend.
 *
 * Devolve se realmente saiu e, se não, por quê — quem chama precisa poder
 * avisar a operação em vez de deixar parecer que o e-mail foi entregue.
 */
export async function enviarEmail(
  para: string | string[],
  assunto: string,
  html: string,
): Promise<{ enviado: boolean; motivo?: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!key || !from) {
    const motivo = 'provedor de e-mail não configurado (RESEND_API_KEY / EMAIL_FROM)'
    console.warn(`${motivo} — não enviado:`, assunto)
    return { enviado: false, motivo }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: para, subject: assunto, html }),
  })
  if (!res.ok) {
    const motivo = `Resend recusou o envio: ${await res.text()}`
    console.error(motivo)
    return { enviado: false, motivo }
  }
  return { enviado: true }
}

export const layoutEmail = (titulo: string, corpo: string) => `
<div style="font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="border-bottom:3px solid #1f47b8;padding-bottom:12px;margin-bottom:24px">
    <span style="font-size:11px;letter-spacing:2px;color:#1f47b8;font-weight:700">FORMA 9</span>
    <h1 style="margin:6px 0 0;font-size:20px">${titulo}</h1>
  </div>
  ${corpo}
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    Mensagem automática do sistema de solicitações do Forma 9.
  </p>
</div>`

// ==================== gerir-usuarios ====================

// Criação e administração de usuários pelo painel.
//
// Criar conta exige a Admin API do Supabase, que só funciona com a service
// key — por isso vive aqui e não no frontend. Toda chamada verifica que quem
// pediu é um GESTOR ativo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const NIVEIS = ['OPERACIONAL', 'GESTOR', 'DIRETORIA'] as const
type Nivel = (typeof NIVEIS)[number]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!

  const sb = createClient(url, service)

  try {
    // ---- quem está chamando? ------------------------------------------
    const auth = req.headers.get('Authorization') ?? ''
    const jwt = auth.replace(/^Bearer\s+/i, '')
    if (!jwt) return erro('Não autenticado.', 401)

    const comoUsuario = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData } = await comoUsuario.auth.getUser()
    const autorId = userData?.user?.id
    if (!autorId) return erro('Sessão inválida.', 401)

    const { data: autor } = await sb
      .from('admin_users')
      .select('id, nome, email, role, ativo, super_admin')
      .eq('id', autorId)
      .maybeSingle()

    if (!autor?.ativo || autor.role !== 'GESTOR')
      return erro('Apenas gestores podem administrar usuários.', 403)

    const b = await req.json()
    const acao = String(b.acao ?? '')

    // ================= CRIAR =================
    if (acao === 'criar') {
      const nome = String(b.nome ?? '').trim()
      const email = String(b.email ?? '').trim().toLowerCase()
      const senha = String(b.senha ?? '')
      const nivel = String(b.nivel ?? '') as Nivel

      if (nome.split(/\s+/).length < 2) return erro('Informe o nome completo.')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro('E-mail inválido.')
      if (senha.length < 8) return erro('A senha precisa ter ao menos 8 caracteres.')
      if (!NIVEIS.includes(nivel)) return erro('Nível de permissão inválido.')

      // Já existe conta com este e-mail?
      const { data: existentes } = await sb.auth.admin.listUsers({ perPage: 1000 })
      if (existentes?.users?.some((u) => u.email?.toLowerCase() === email))
        return erro('Já existe um usuário com este e-mail.')

      const { data: criado, error: eCriar } = await sb.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      })
      if (eCriar || !criado?.user) return erro(eCriar?.message ?? 'Falha ao criar conta.')

      const novoId = criado.user.id

      if (nivel === 'DIRETORIA') {
        // Vincula a um diretor existente ou cria um novo registro.
        if (b.diretor_id) {
          const { error } = await sb
            .from('diretores')
            .update({ user_id: novoId, email, ativo: true })
            .eq('id', b.diretor_id)
          if (error) {
            await sb.auth.admin.deleteUser(novoId)
            return erro(error.message)
          }
        } else {
          const { error } = await sb
            .from('diretores')
            .insert({ nome, email, user_id: novoId, ativo: true })
          if (error) {
            await sb.auth.admin.deleteUser(novoId)
            return erro(error.message)
          }
        }
      } else {
        const { error } = await sb
          .from('admin_users')
          .insert({ id: novoId, nome, email, role: nivel, ativo: true })
        if (error) {
          await sb.auth.admin.deleteUser(novoId)
          return erro(error.message)
        }
      }

      return json({ ok: true, id: novoId })
    }

    // ================= ATIVAR / DESATIVAR =================
    if (acao === 'ativar' || acao === 'desativar') {
      const ativo = acao === 'ativar'
      const alvo = String(b.id ?? '')
      const diretorId = b.diretor_id ? String(b.diretor_id) : null

      if (diretorId) {
        const { error } = await sb
          .from('diretores')
          .update({ ativo })
          .eq('id', diretorId)
        if (error) return erro(error.message)
        return json({ ok: true })
      }

      const { data: destino } = await sb
        .from('admin_users')
        .select('super_admin')
        .eq('id', alvo)
        .maybeSingle()
      if (!destino) return erro('Usuário não encontrado.', 404)
      if (destino.super_admin)
        return erro('A conta de super admin não pode ser desativada.', 403)
      if (alvo === autorId && !ativo)
        return erro('Você não pode desativar a própria conta.', 400)

      const { error } = await sb.from('admin_users').update({ ativo }).eq('id', alvo)
      if (error) return erro(error.message)
      return json({ ok: true })
    }

    // ================= TROCAR NÍVEL (só operacional/gestor) =================
    if (acao === 'nivel') {
      const alvo = String(b.id ?? '')
      const nivel = String(b.nivel ?? '')
      if (!['OPERACIONAL', 'GESTOR'].includes(nivel))
        return erro('Nível inválido para conta operacional.')

      const { data: destino } = await sb
        .from('admin_users')
        .select('super_admin')
        .eq('id', alvo)
        .maybeSingle()
      if (!destino) return erro('Usuário não encontrado.', 404)
      if (destino.super_admin)
        return erro('O nível do super admin não pode ser alterado.', 403)

      const { error } = await sb.from('admin_users').update({ role: nivel }).eq('id', alvo)
      if (error) return erro(error.message)
      return json({ ok: true })
    }

    // ================= REDEFINIR SENHA =================
    if (acao === 'senha') {
      const alvo = String(b.id ?? '')
      const senha = String(b.senha ?? '')
      if (senha.length < 8) return erro('A senha precisa ter ao menos 8 caracteres.')

      const { error } = await sb.auth.admin.updateUserById(alvo, { password: senha })
      if (error) return erro(error.message)
      return json({ ok: true })
    }

    // ================= E-MAIL DO DIRETOR =================
    // Vale para diretor sem login: sem e-mail cadastrado ele não recebe o
    // aviso de aprovação, mesmo com tudo o mais configurado.
    if (acao === 'email') {
      const diretorId = String(b.diretor_id ?? '')
      const email = String(b.email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro('E-mail inválido.')
      const { error } = await sb.from('diretores').update({ email }).eq('id', diretorId)
      if (error) return erro(error.message)
      return json({ ok: true })
    }

    // ================= SLACK ID DO DIRETOR =================
    if (acao === 'slack') {
      const diretorId = String(b.diretor_id ?? '')
      const slack = String(b.slack_user_id ?? '').trim() || null
      const { error } = await sb
        .from('diretores')
        .update({ slack_user_id: slack })
        .eq('id', diretorId)
      if (error) return erro(error.message)
      return json({ ok: true })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
