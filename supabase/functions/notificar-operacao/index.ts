// Avisa a equipe operacional no Slack quando chega uma solicitação nova.
//
// Diferente do aviso ao diretor, aqui a mensagem é só de ciência: "chegou
// isto, é da sua área". Não pede decisão.
//
// Quem recebe: gestores (areas vazio) recebem tudo. Os demais recebem só
// quando a solicitação toca uma das suas áreas:
//   AEREO · RODOVIARIO · VAN · CARRO · HOSP_PAX · HOSP_FORA

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  cors,
  erro,
  json,
  dataBR,
  EQUIPE_LABEL,
  enviarEmail,
  layoutEmail,
  descreverDestino,
} from '../_shared/comum.ts'

/** Uma linha rótulo/valor no corpo do e-mail. */
const linhaEmail = (rotulo: string, valor: string) =>
  `<p style="margin:0 0 6px;font-size:14px"><span style="color:#64748b">${rotulo}:</span> ${valor}</p>`

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

    // Sem retorno antecipado aqui: o Slack pode estar fora e o e-mail sair
    // assim mesmo. A decisão de falhar fica no fim, quando se sabe o
    // resultado dos dois canais.
    const token = Deno.env.get('SLACK_BOT_TOKEN')
    const canal = Deno.env.get('SLACK_CHANNEL_ID')

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
          .select('nome, email, slack_user_id, areas')
          .eq('ativo', true)
          // Logins administrativos (o super admin) têm acesso ao painel mas
          // não são pessoas da operação — não devem ser avisados.
          .eq('notificar', true),
        sb.from('notificacao_extra').select('nome, slack_user_id, areas').eq('ativo', true),
      ])

    // Sem a equipe não há a quem avisar. Falhar alto é melhor que postar uma
    // mensagem sem destinatário e a operação achar que foi avisada.
    if (erroEquipe) return erro(`Não foi possível ler a equipe: ${erroEquipe.message}`, 500)

    // A lista extra é opcional, mas se a leitura falhar alguém deixa de ser
    // avisado — e isso não pode sumir num `?? []`.
    if (erroExtras) console.error('notificacao_extra:', erroExtras.message)

    const candidatos = [...(equipe ?? []), ...(extras ?? [])]
    const elegiveis = candidatos.filter((u) => {
      const todas = !u.areas || u.areas.length === 0 // gestor: recebe tudo
      return todas || u.areas.some((a: string) => areas.has(a))
    })

    // A mesma pessoa pode estar nas duas tabelas — foi o que aconteceu com a
    // Carol, que ganhou login depois de já estar na lista extra. Sem isto ela
    // aparecia duas vezes na mensagem: uma como menção, outra como texto.
    // O Slack é a identidade real aqui; quem não tem, cai no nome.
    const vistos = new Set<string>()
    const destinatarios = elegiveis.filter((u) => {
      const chave = u.slack_user_id || `nome:${u.nome}`
      if (vistos.has(chave)) return false
      vistos.add(chave)
      return true
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
      `*Destino:* ${descreverDestino(s)}` +
        (s.edicoes.avulsa
          ? ''
          : ` · ${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)}`),
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

    // Os dois canais em paralelo. Um não segura o outro: se o Slack estiver
    // fora do ar, o e-mail ainda sai — e vice-versa.
    const emails = destinatarios
      .map((u) => (u as { email?: string }).email)
      .filter((e): e is string => !!e)

    const [slack, email] = await Promise.all([
      (async () => {
        if (!token || !canal)
          return { enviado: false, motivo: 'SLACK_BOT_TOKEN / SLACK_CHANNEL_ID ausentes' }
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({ channel: canal, text: texto, unfurl_links: false }),
        })
        const r = await res.json()
        return r.ok
          ? { enviado: true, ts: r.ts as string }
          : { enviado: false, motivo: `Slack recusou: ${r.error}` }
      })(),
      emails.length === 0
        ? Promise.resolve({ enviado: false, motivo: 'nenhum responsável com e-mail' })
        : enviarEmail(
            emails,
            `[${s.protocolo}] Nova solicitação — ${descreverDestino(s, { comHotel: false })}`,
            layoutEmail(
              'Nova solicitação',
              `<p>Chegou uma solicitação da sua área.</p>
               ${linhaEmail('Protocolo', s.protocolo)}
               ${linhaEmail('Destino', descreverDestino(s))}
               ${linhaEmail('Estadia', `${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}`)}
               ${linhaEmail('Equipe / Pax', `${equipeTexto} · ${s.colaboradores.length} pax`)}
               ${linhaEmail('Solicitado', servicos.map((v) => ROTULO[v] ?? v).join(' · '))}
               ${linhaEmail('Solicitante', `${s.solicitante_nome} — ${s.solicitante_email}`)}
               ${site ? `<p style="margin-top:20px"><a href="${site}/admin/solicitacoes/${s.id}">Abrir a solicitação no painel</a></p>` : ''}`,
            ),
          ),
    ])

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: s.id,
      tipo: 'AVISO_OPERACAO',
      descricao:
        `Operação avisada (${destinatarios.map((u) => u.nome).join(', ')}) — ` +
        `Slack: ${slack.enviado ? 'ok' : (slack as { motivo: string }).motivo} · ` +
        `E-mail: ${email.enviado ? 'ok' : email.motivo}`,
      payload: {
        ts: (slack as { ts?: string }).ts ?? null,
        areas: [...areas],
        sem_slack: semSlack,
        emails,
        lista_extra_indisponivel: erroExtras?.message ?? null,
      },
    })

    // Só é falha se NENHUM canal saiu — aí ninguém foi avisado de verdade.
    if (!slack.enviado && !email.enviado)
      return erro(
        `Ninguém foi avisado. Slack: ${(slack as { motivo: string }).motivo}. E-mail: ${email.motivo}.`,
        502,
      )

    return json({
      ok: true,
      avisados: destinatarios.map((u) => u.nome),
      slack: slack.enviado ? 'ok' : (slack as { motivo: string }).motivo,
      email: email.enviado ? `enviado para ${emails.length}` : email.motivo,
      sem_slack: semSlack,
      // Quem sumiu da lista precisa aparecer para quem chamou.
      lista_extra_indisponivel: erroExtras?.message ?? null,
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
