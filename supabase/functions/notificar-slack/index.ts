// Posta no Slack o resumo da solicitação, mencionando o diretor aprovador.
// Exige usuário admin autenticado (o token vem do painel).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  cors,
  erro,
  json,
  dataBR,
  dataHoraBR,
  moeda,
  EQUIPE_LABEL,
} from '../_shared/comum.ts'

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
      .select('*, edicoes(*), diretores(*), colaboradores(*)')
      .eq('id', solicitacao_id)
      .maybeSingle()
    if (!s) return erro('Solicitação não encontrada.', 404)

    const ids = s.colaboradores.map((c: { id: string }) => c.id)
    const [{ data: voos }, { data: rodo }, { data: hosp }, { data: carro }] =
      await Promise.all([
        sb.from('voos').select('*').in('colaborador_id', ids),
        sb.from('transporte_rodoviario').select('*').in('colaborador_id', ids),
        sb.from('hospedagem_detalhe').select('*').in('colaborador_id', ids),
        sb.from('locacao_carro').select('*').eq('solicitacao_id', s.id).maybeSingle(),
      ])

    const site = Deno.env.get('SITE_URL') ?? ''
    const mencao = s.diretores.slack_user_id
      ? `<@${s.diretores.slack_user_id}>`
      : `*${s.diretores.nome}*`

    const linhasPax = s.colaboradores
      .sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
      .map((c: { id: string; nome_completo: string }) => {
        const ida = voos?.find((v) => v.colaborador_id === c.id && v.trecho === 'IDA')
        const volta = voos?.find((v) => v.colaborador_id === c.id && v.trecho === 'VOLTA')
        const bus = rodo?.find((r) => r.colaborador_id === c.id)
        const partes: string[] = []
        if (ida)
          partes.push(
            `ida ${ida.companhia ?? ''} ${ida.numero_voo ?? ''} ${dataHoraBR(ida.partida)}`.trim(),
          )
        if (volta)
          partes.push(
            `volta ${volta.companhia ?? ''} ${volta.numero_voo ?? ''} ${dataHoraBR(volta.partida)}`.trim(),
          )
        if (bus?.horario_ida)
          partes.push(`ônibus ida ${dataHoraBR(bus.horario_ida)}`)
        return `• ${c.nome_completo}${partes.length ? ` — ${partes.join(' / ')}` : ''}`
      })
      .join('\n')

    const totalVoos = (voos ?? []).reduce((t, v) => t + Number(v.preco ?? 0), 0)
    const totalBus = (rodo ?? []).reduce((t, v) => t + Number(v.preco ?? 0), 0)
    const totalHosp = (hosp ?? []).reduce((t, h) => {
      if (!h.valor_diaria || !h.check_in || !h.check_out) return t
      const noites = Math.max(
        0,
        (new Date(h.check_out).getTime() - new Date(h.check_in).getTime()) / 86400000,
      )
      return t + Number(h.valor_diaria) * noites
    }, 0)
    const totalCarro = Number(carro?.preco ?? 0)
    const total = s.custo_total_manual ?? totalVoos + totalBus + totalHosp + totalCarro

    const transporte = !s.precisa_transporte
      ? 'não solicitado'
      : s.modal === 'AEREO'
        ? `aéreo ${s.aeroporto_saida} → ${s.aeroporto_chegada}`
        : 'rodoviário'

    const texto = [
      `:airplane: *Solicitação ${s.protocolo} aguarda sua aprovação no sistema*`,
      `${mencao}, há uma pendência para você:`,
      '',
      `*Destino:* ${s.edicoes.destino} — ${s.edicoes.hotel} (${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)})`,
      `*Equipe:* ${EQUIPE_LABEL[s.equipe] ?? s.equipe}  ·  *Pax:* ${s.colaboradores.length}`,
      `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}`,
      `*Hospedagem:* ${s.tipo_hospedagem === 'HOTEL_PAX' ? 'hotel do pax' : 'fora do hotel do pax'}`,
      `*Transporte:* ${transporte}  ·  *Locação de carro:* ${s.precisa_locacao_carro ? 'sim' : 'não'}`,
      `*Solicitante:* ${s.solicitante_nome} — ${s.solicitante_email}`,
      '',
      '*Colaboradores*',
      linhasPax,
      '',
      `*Custo total:* ${moeda(total)}`,
      `    Aéreo ${moeda(totalVoos)} · Rodoviário ${moeda(totalBus)} · Hospedagem ${moeda(totalHosp)} · Carro ${moeda(totalCarro)}`,
      '',
      `_Obs. do solicitante:_ ${s.obs_transporte}`,
      s.precisa_locacao_carro && s.obs_locacao_carro
        ? `_Obs. locação:_ ${s.obs_locacao_carro}`
        : '',
      '',
      site
        ? `:point_right: <${site}/aprovacao/${s.id}|*Abrir no sistema para aprovar ou reprovar*>`
        : '',
      '_A aprovação é feita dentro do sistema — esta mensagem é apenas um aviso._',
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
      tipo: 'SLACK_ENVIADO',
      descricao: `Mensagem de aprovação enviada no Slack para ${s.diretores.nome}`,
      payload: { ts: resultado.ts, canal },
    })

    return json({ ok: true, ts: resultado.ts })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
