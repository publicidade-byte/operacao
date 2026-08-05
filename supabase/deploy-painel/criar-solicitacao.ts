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

/** Envia e-mail via Resend. Se a chave não estiver configurada, apenas loga. */
export async function enviarEmail(para: string | string[], assunto: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!key || !from) {
    console.warn('RESEND_API_KEY/EMAIL_FROM ausentes — e-mail não enviado:', assunto)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: para, subject: assunto, html }),
  })
  if (!res.ok) console.error('Falha ao enviar e-mail:', await res.text())
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

// ==================== criar-solicitacao ====================

// Recebe o formulário público, valida no servidor e grava com service_role.
// O anon key nunca consegue inserir direto nas tabelas (RLS bloqueia).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const MAX_COLABORADORES = 50
const LIMITE_POR_IP_HORA = 5

function cpfValido(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  for (let t = 9; t < 11; t++) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += parseInt(cpf[i]) * (t + 1 - i)
    if (((soma * 10) % 11) % 10 !== parseInt(cpf[t])) return false
  }
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const b = await req.json()

    // ---- honeypot -----------------------------------------------------
    if (b.website) return json({ protocolo: 'F9-0000-0000', token: 'x' }) // finge sucesso

    // ---- rate limit por IP --------------------------------------------
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido'
    const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await sb
      .from('eventos_solicitacao')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'CRIADA')
      .gte('created_at', umaHoraAtras)
      .filter('payload->>ip', 'eq', ip)
    if ((count ?? 0) >= LIMITE_POR_IP_HORA)
      return erro('Muitas solicitações em pouco tempo. Tente novamente mais tarde.', 429)

    // ---- validação ----------------------------------------------------
    const obrig = [
      'equipe',
      'diretor_id',
      'solicitante_nome',
      'solicitante_email',
      'solicitante_whatsapp',
      'data_entrada',
      'data_saida',
      'tipo_hospedagem',
      'obs_transporte',
    ]
    for (const c of obrig) if (!b[c]) return erro(`Campo obrigatório ausente: ${c}`)

    const SERVICOS_OK = ['AEREO', 'RODOVIARIO', 'VAN', 'CARRO', 'HOSPEDAGEM']
    const servicos: string[] = Array.isArray(b.servicos)
      ? [...new Set(b.servicos.filter((s: string) => SERVICOS_OK.includes(s)))]
      : []
    if (servicos.length === 0) return erro('Selecione ao menos um serviço.')

    const temTransporte = servicos.some((s) =>
      ['AEREO', 'RODOVIARIO', 'VAN'].includes(s),
    )
    if (b.data_saida <= b.data_entrada)
      return erro('A data de saída precisa ser posterior à de entrada.')
    if (!EQUIPE_LABEL[b.equipe]) return erro('Equipe inválida.')
    if (b.equipe === 'OUTROS' && !String(b.equipe_outro ?? '').trim())
      return erro('Informe qual é a área quando escolher "Outros".')
    if (servicos.includes('AEREO') && (!b.aeroporto_saida || !b.aeroporto_chegada))
      return erro('Informe os aeroportos de saída e chegada.')

    if (servicos.includes('VAN')) {
      const n = Number(b.van_qtd_passageiros)
      if (
        !String(b.van_local_saida ?? '').trim() ||
        !String(b.van_horario_saida ?? '').trim() ||
        !String(b.van_destino ?? '').trim() ||
        !Number.isInteger(n) ||
        n < 1 ||
        n > 60
      )
        return erro('Preencha os dados da van: saída, horário, destino e passageiros.')
    }

    if (servicos.includes('CARRO')) {
      if (String(b.carro_condutor_nome ?? '').trim().split(/\s+/).length < 2)
        return erro('Informe o nome completo do condutor.')
      if (!cpfValido(String(b.carro_condutor_cpf ?? '')))
        return erro('CPF do condutor inválido.')
      if (!['MANUAL', 'AUTOMATICO'].includes(b.carro_transmissao))
        return erro('Selecione o câmbio do carro (manual ou automático).')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.solicitante_email))
      return erro('E-mail do solicitante inválido.')
    if (!/^\d{10,11}$/.test(b.solicitante_whatsapp)) return erro('WhatsApp inválido.')

    const colabs = Array.isArray(b.colaboradores) ? b.colaboradores : []
    if (colabs.length === 0) return erro('Inclua ao menos um colaborador.')
    if (colabs.length > MAX_COLABORADORES)
      return erro(`Máximo de ${MAX_COLABORADORES} colaboradores por solicitação.`)

    const cpfsVistos = new Set<string>()
    for (const c of colabs) {
      if (!c.nome_completo || c.nome_completo.trim().split(/\s+/).length < 2)
        return erro(`Nome completo inválido: "${c.nome_completo ?? ''}"`)
      if (!cpfValido(String(c.cpf ?? '')))
        return erro(`CPF inválido para ${c.nome_completo}.`)
      if (cpfsVistos.has(c.cpf))
        return erro(`CPF repetido nesta solicitação: ${c.nome_completo}.`)
      cpfsVistos.add(c.cpf)
      if (!c.data_nascimento) return erro(`Data de nascimento ausente: ${c.nome_completo}.`)
    }

    // Uma solicitação pode cobrir várias operações do MESMO destino.
    const edicaoIds: string[] = Array.isArray(b.edicao_ids)
      ? [...new Set(b.edicao_ids.filter(Boolean))]
      : b.edicao_id
        ? [b.edicao_id]
        : []
    if (edicaoIds.length === 0) return erro('Selecione ao menos uma data da operação.')
    if (edicaoIds.length > 20)
      return erro('Máximo de 20 operações por solicitação.')

    const { data: edicoes } = await sb
      .from('edicoes')
      .select('*')
      .in('id', edicaoIds)
      .eq('ativa', true)
      .order('data_inicio')
    if (!edicoes || edicoes.length !== edicaoIds.length)
      return erro('Alguma das datas selecionadas é inválida ou está inativa.')

    const destinos = new Set(edicoes.map((e) => e.destino))
    if (destinos.size > 1)
      return erro('Todas as datas precisam ser do mesmo destino.')

    // A operação mais antiga vira a "principal": alimenta destino, hotel e
    // as listagens. As demais ficam em solicitacao_edicoes.
    const edicao = edicoes[0]

    const { data: diretor } = await sb
      .from('diretores')
      .select('*')
      .eq('id', b.diretor_id)
      .eq('ativo', true)
      .maybeSingle()
    if (!diretor) return erro('Diretor aprovador inválido.')

    // ---- gravação ------------------------------------------------------
    const token = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')

    const { data: sol, error: e1 } = await sb
      .from('solicitacoes')
      .insert({
        token_acompanhamento: token,
        edicao_id: edicao.id,
        equipe: b.equipe,
        equipe_outro:
          b.equipe === 'OUTROS' ? String(b.equipe_outro).trim().slice(0, 60) : null,
        diretor_id: b.diretor_id,
        solicitante_nome: b.solicitante_nome,
        solicitante_email: b.solicitante_email,
        solicitante_whatsapp: b.solicitante_whatsapp,
        data_entrada: b.data_entrada,
        data_saida: b.data_saida,
        tipo_hospedagem: b.tipo_hospedagem,
        servicos,
        // `precisa_transporte` e `modal` seguem preenchidos por compatibilidade
        // com o que já existia; a fonte de verdade agora é `servicos`.
        precisa_transporte: temTransporte,
        modal: servicos.includes('AEREO')
          ? 'AEREO'
          : servicos.includes('VAN')
            ? 'VAN'
            : servicos.includes('RODOVIARIO')
              ? 'RODOVIARIO'
              : null,
        aeroporto_saida: servicos.includes('AEREO') ? b.aeroporto_saida : null,
        aeroporto_chegada: servicos.includes('AEREO') ? b.aeroporto_chegada : null,
        precisa_bagagem: servicos.includes('AEREO')
          ? b.precisa_bagagem === true
          : null,
        obs_transporte: b.obs_transporte,
        van_local_saida: servicos.includes('VAN') ? b.van_local_saida : null,
        van_horario_saida: servicos.includes('VAN') ? b.van_horario_saida : null,
        van_destino: servicos.includes('VAN') ? b.van_destino : null,
        van_qtd_passageiros: servicos.includes('VAN')
          ? Number(b.van_qtd_passageiros)
          : null,
        precisa_locacao_carro: servicos.includes('CARRO'),
        obs_locacao_carro: b.obs_locacao_carro ?? null,
        carro_condutor_nome: servicos.includes('CARRO') ? b.carro_condutor_nome : null,
        carro_condutor_cpf: servicos.includes('CARRO') ? b.carro_condutor_cpf : null,
        carro_transmissao: servicos.includes('CARRO') ? b.carro_transmissao : null,
      })
      .select('id, protocolo')
      .single()
    if (e1) throw new Error(e1.message)

    const { error: e0 } = await sb
      .from('solicitacao_edicoes')
      .insert(edicoes.map((e) => ({ solicitacao_id: sol.id, edicao_id: e.id })))
    if (e0) {
      await sb.from('solicitacoes').delete().eq('id', sol.id)
      throw new Error(e0.message)
    }

    const { error: e2 } = await sb.from('colaboradores').insert(
      colabs.map((c: Record<string, unknown>, i: number) => ({
        solicitacao_id: sol.id,
        nome_completo: String(c.nome_completo).trim(),
        cpf: c.cpf,
        data_nascimento: c.data_nascimento,
        ordem: (c.ordem as number) ?? i + 1,
      })),
    )
    if (e2) {
      await sb.from('solicitacoes').delete().eq('id', sol.id)
      throw new Error(e2.message)
    }

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: sol.id,
      tipo: 'CRIADA',
      descricao: `Solicitação criada por ${b.solicitante_nome}`,
      payload: { ip, pax: colabs.length },
    })

    // ---- e-mails --------------------------------------------------------
    const site = Deno.env.get('SITE_URL') ?? ''
    const linkAcomp = `${site}/s/${token}`

    await enviarEmail(
      b.solicitante_email,
      `[${sol.protocolo}] Recebemos sua solicitação — ${edicao.destino}`,
      layoutEmail(
        'Solicitação recebida',
        `<p>Olá, ${b.solicitante_nome.split(' ')[0]}!</p>
         <p>Sua solicitação foi registrada sob o protocolo
            <strong style="font-family:monospace">${sol.protocolo}</strong>.</p>
         <table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0">
           <tr><td style="padding:6px 0;color:#64748b;width:150px">Destino</td><td>${edicao.destino} — ${edicao.hotel}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">${edicoes.length > 1 ? 'Operações' : 'Operação'}</td><td>${edicoes
             .map((e) => `${dataBR(e.data_inicio)} a ${dataBR(e.data_fim)}`)
             .join('<br>')}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Estadia</td><td>${dataBR(b.data_entrada)} a ${dataBR(b.data_saida)}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Equipe</td><td>${EQUIPE_LABEL[b.equipe]}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Colaboradores</td><td>${colabs.length}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Diretor aprovador</td><td>${diretor.nome}</td></tr>
         </table>
         <p>A equipe operacional vai preencher os dados da viagem e encaminhar para aprovação.
            Você receberá a confirmação final por este e-mail.</p>
         ${site ? `<p><a href="${linkAcomp}" style="background:#1f47b8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Acompanhar solicitação</a></p>` : ''}`,
      ),
    )

    const emailOperacao = Deno.env.get('EMAIL_OPERACAO')
    if (emailOperacao) {
      await enviarEmail(
        emailOperacao,
        `Nova solicitação ${sol.protocolo} — ${edicao.destino} (${colabs.length} pax)`,
        layoutEmail(
          'Nova solicitação recebida',
          `<p><strong>${sol.protocolo}</strong> · ${edicao.destino} — ${edicao.hotel}</p>
           <p>${EQUIPE_LABEL[b.equipe]} · ${colabs.length} pax · ${dataBR(b.data_entrada)} a ${dataBR(b.data_saida)}<br>
              Solicitante: ${b.solicitante_nome} (${b.solicitante_email})<br>
              Aprovador: ${diretor.nome}</p>
           ${site ? `<p><a href="${site}/admin/solicitacoes/${sol.id}">Abrir no painel</a></p>` : ''}`,
        ),
      )
    }

    return json({ protocolo: sol.protocolo, token })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
