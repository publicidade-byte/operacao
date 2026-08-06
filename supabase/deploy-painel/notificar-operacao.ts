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

// ==================== notificar-operacao ====================

// Avisa a equipe operacional no Slack quando chega uma solicitação nova.
//
// Diferente do aviso ao diretor, aqui a mensagem é só de ciência: "chegou
// isto, é da sua área". Não pede decisão.
//
// Quem recebe: gestores (areas vazio) recebem tudo. Os demais recebem só
// quando a solicitação toca uma das suas áreas:
//   AEREO · RODOVIARIO · VAN · CARRO · HOSP_PAX · HOSP_FORA

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const ROTULO: Record<string, string> = {
  AEREO: 'aéreo',
  RODOVIARIO: 'rodoviário',
  VAN: 'van',
  CARRO: 'aluguel de carro',
  HOSPEDAGEM: 'hospedagem',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { solicitacao_id } = await req.json()
    if (!solicitacao_id) return erro('solicitacao_id ausente.')

    const token = Deno.env.get('SLACK_BOT_TOKEN')
    const canal = Deno.env.get('SLACK_CHANNEL_ID')
    if (!token || !canal)
      return erro('Slack não configurado (SLACK_BOT_TOKEN / SLACK_CHANNEL_ID).', 500)

    const { data: s } = await sb
      .from('solicitacoes')
      .select(
        '*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(nome), colaboradores(id)',
      )
      .eq('id', solicitacao_id)
      .maybeSingle()
    if (!s) return erro('Solicitação não encontrada.', 404)

    const servicos: string[] = s.servicos ?? []

    // As "áreas" tocadas por esta solicitação. Hospedagem se divide entre
    // hotel do pax e fora dele — são responsáveis diferentes.
    const areas = new Set<string>()
    for (const sv of servicos) {
      if (sv === 'HOSPEDAGEM')
        areas.add(s.tipo_hospedagem === 'HOTEL_PAX' ? 'HOSP_PAX' : 'HOSP_FORA')
      else areas.add(sv)
    }

    const { data: equipe } = await sb
      .from('admin_users')
      .select('nome, slack_user_id, areas, role, super_admin')
      .eq('ativo', true)

    const destinatarios = (equipe ?? []).filter((u) => {
      const todas = !u.areas || u.areas.length === 0 // gestor: recebe tudo
      return todas || u.areas.some((a: string) => areas.has(a))
    })

    if (destinatarios.length === 0)
      return json({ ok: true, aviso: 'Nenhum responsável para estas áreas.' })

    const mencoes = destinatarios
      .map((u) => (u.slack_user_id ? `<@${u.slack_user_id}>` : `*${u.nome}*`))
      .join(' ')

    const semSlack = destinatarios.filter((u) => !u.slack_user_id).map((u) => u.nome)
    const site = Deno.env.get('SITE_URL') ?? ''

    const equipeTexto =
      (EQUIPE_LABEL[s.equipe] ?? s.equipe) +
      (s.equipe === 'OUTROS' && s.equipe_outro ? ` (${s.equipe_outro})` : '')

    const texto = [
      `:inbox_tray: *Nova solicitação ${s.protocolo}*`,
      mencoes,
      '',
      `*Destino / Data:* ${s.edicoes.destino} — ${s.edicoes.hotel} · ${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)}`,
      `*Equipe / Pax:* ${equipeTexto} · ${s.colaboradores.length} pax`,
      `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)} (${s.tipo_hospedagem === 'HOTEL_PAX' ? 'hotel do pax' : 'fora do hotel do pax'})`,
      `*Solicitado:* ${servicos.map((v) => ROTULO[v] ?? v).join(' · ')}`,
      `*Solicitante:* ${s.solicitante_nome} — ${s.solicitante_email}`,
      '',
      site ? `:link: <${site}/admin/solicitacoes/${s.id}|Abrir a solicitação no painel>` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: canal, text: texto, unfurl_links: false }),
    })
    const resultado = await res.json()
    if (!resultado.ok) return erro(`Slack recusou a mensagem: ${resultado.error}`, 502)

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: s.id,
      tipo: 'AVISO_OPERACAO',
      descricao: `Operação avisada no Slack: ${destinatarios.map((u) => u.nome).join(', ')}`,
      payload: { ts: resultado.ts, areas: [...areas], sem_slack: semSlack },
    })

    return json({
      ok: true,
      avisados: destinatarios.map((u) => u.nome),
      sem_slack: semSlack,
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
