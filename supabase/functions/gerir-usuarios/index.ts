// Criação e administração de usuários pelo painel.
//
// Criar conta exige a Admin API do Supabase, que só funciona com a service
// key — por isso vive aqui e não no frontend. Toda chamada verifica que quem
// pediu é um GESTOR ativo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, erro, json } from '../_shared/comum.ts'

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
