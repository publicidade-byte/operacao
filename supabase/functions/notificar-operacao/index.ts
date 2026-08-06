// Avisa a equipe operacional no Slack quando chega uma solicitação nova.
//
// Diferente do aviso ao diretor, aqui a mensagem é só de ciência: "chegou
// isto, é da sua área". Não pede decisão.
//
// Quem recebe: gestores (areas vazio) recebem tudo. Os demais recebem só
// quando a solicitação toca uma das suas áreas:
//   AEREO · RODOVIARIO · VAN · CARRO · HOSP_PAX · HOSP_FORA

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, erro, json, dataBR, EQUIPE_LABEL } from '../_shared/comum.ts'

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

    // Quem recebe: usuários do sistema + pessoas cadastradas só para
    // notificação (têm Slack mas não têm login, como a Carol).
    const [{ data: equipe, error: erroEquipe }, { data: extras, error: erroExtras }] =
      await Promise.all([
        sb
          .from('admin_users')
          .select('nome, slack_user_id, areas')
          .eq('ativo', true),
        sb.from('notificacao_extra').select('nome, slack_user_id, areas').eq('ativo', true),
      ])

    // Sem a equipe não há a quem avisar. Falhar alto é melhor que postar uma
    // mensagem sem destinatário e a operação achar que foi avisada.
    if (erroEquipe) return erro(`Não foi possível ler a equipe: ${erroEquipe.message}`, 500)

    // A lista extra é opcional, mas se a leitura falhar alguém deixa de ser
    // avisado — e isso não pode sumir num `?? []`.
    if (erroExtras) console.error('notificacao_extra:', erroExtras.message)

    const candidatos = [...(equipe ?? []), ...(extras ?? [])]
    const destinatarios = candidatos.filter((u) => {
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
      site ? `:link: <${site}/admin/solicitacoes/${s.id}|Abrir a solicitação no painel>` : null,
    ]
      // Só as linhas ausentes saem. `filter(Boolean)` comeria também as
      // strings vazias, que aqui são os espaçamentos entre os blocos.
      .filter((l): l is string => l !== null)
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
      payload: {
        ts: resultado.ts,
        areas: [...areas],
        sem_slack: semSlack,
        lista_extra_indisponivel: erroExtras?.message ?? null,
      },
    })

    return json({
      ok: true,
      avisados: destinatarios.map((u) => u.nome),
      sem_slack: semSlack,
      // Quem sumiu da lista precisa aparecer para quem chamou.
      lista_extra_indisponivel: erroExtras?.message ?? null,
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
