// Avisa a operação no Slack quando o diretor REPROVA ou manda REFAZER.
//
// Existe porque a decisão negativa não chegava a ninguém: ficava no painel
// esperando alguém abrir. Um aéreo da DJ Bruu foi reprovado por prazo de
// emissão vencido e ficou uma semana parado — ninguém soube.
//
// Aprovação não passa por aqui: ela já segue o fluxo normal e não exige
// que alguém largue o que está fazendo. O que precisa de gente é o "não".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status)

const dataBR = (iso?: string | null) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
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

    const { data: s } = await sb
      .from('solicitacoes')
      .select(
        'id, protocolo, status, servicos, data_entrada, data_saida, solicitante_nome, ' +
          'edicoes!solicitacoes_edicao_id_fkey(destino, hotel), diretores(nome), colaboradores(id)',
      )
      .eq('id', solicitacao_id)
      .maybeSingle()
    if (!s) return erro('Solicitação não encontrada.', 404)

    if (!['REPROVADA', 'REFAZER'].includes(s.status))
      return json({ ok: true, aviso: `Status ${s.status} não dispara aviso.` })

    // A última decisão é a que vale: é dela que sai o motivo.
    const { data: decisao } = await sb
      .from('aprovacoes')
      .select('decisao, aprovado, observacao, decidido_em, escopo')
      .eq('solicitacao_id', s.id)
      .order('decidido_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    const motivo = decisao?.observacao?.trim() || 'sem motivo registrado'
    const refazer = s.status === 'REFAZER'

    // Quem recebe: quem assumiu a solicitação. Sem ninguém assumido, os
    // gestores — alguém tem de pegar isto, e "todo mundo" não pega.
    const [{ data: assumidos }, { data: equipe }] = await Promise.all([
      sb.from('solicitacao_responsaveis').select('admin_id').eq('solicitacao_id', s.id),
      sb
        .from('admin_users')
        .select('id, nome, slack_user_id, areas, role')
        .eq('ativo', true)
        .eq('notificar', true),
    ])

    const ids = new Set((assumidos ?? []).map((r) => r.admin_id))
    const destinatarios = (equipe ?? []).filter((u) =>
      ids.size ? ids.has(u.id) : !u.areas || u.areas.length === 0,
    )
    const mencoes = destinatarios
      .map((u) => (u.slack_user_id ? `<@${u.slack_user_id}>` : `*${u.nome}*`))
      .join(' ')

    const site = Deno.env.get('SITE_URL') ?? ''
    const destino = [s.edicoes?.destino, s.edicoes?.hotel].filter(Boolean).join(' — ')

    const texto = [
      refazer
        ? `:arrows_counterclockwise: *${s.protocolo} voltou para refazer*`
        : `:x: *${s.protocolo} foi reprovada*`,
      mencoes,
      '',
      `*Motivo:* ${motivo}`,
      '',
      `*Destino:* ${destino || '—'}`,
      `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}`,
      `*Decidiu:* ${s.diretores?.nome ?? '—'}`,
      decisao?.escopo?.length ? `*Sobre:* ${decisao.escopo.join(', ')}` : null,
      `*Solicitante:* ${s.solicitante_nome}`,
      '',
      refazer
        ? 'Corrija o que o diretor apontou e reenvie para aprovação.'
        : 'Se for o caso de refazer, ajuste e reenvie para aprovação.',
      site ? `:link: <${site}/admin/solicitacoes/${s.id}|Abrir a solicitação no painel>` : null,
    ]
      .filter((l): l is string => l !== null)
      .join('\n')

    const token = Deno.env.get('SLACK_BOT_TOKEN')
    const canal = Deno.env.get('SLACK_CHANNEL_ID')
    if (!token || !canal) return erro('SLACK_BOT_TOKEN / SLACK_CHANNEL_ID ausentes.', 500)

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: canal, text: texto, unfurl_links: false }),
    })
    const r = await res.json()

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: s.id,
      tipo: 'AVISO_OPERACAO',
      descricao: r.ok
        ? `Operação avisada no Slack: ${refazer ? 'refazer' : 'reprovada'} — ${motivo}`
        : `Falha ao avisar a operação no Slack: ${r.error}`,
      payload: { decisao: decisao?.decisao ?? s.status, motivo },
    })

    if (!r.ok) return erro(`Slack recusou: ${r.error}`, 502)
    return json({ ok: true, avisados: destinatarios.length })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
