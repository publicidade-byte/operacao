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
  enviarEmail,
  layoutEmail,
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

    const { data: s } = await sb
      .from('solicitacoes')
      .select('*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(*), colaboradores(*)')
      .eq('id', solicitacao_id)
      .maybeSingle()
    if (!s) return erro('Solicitação não encontrada.', 404)

    const ids = s.colaboradores.map((c: { id: string }) => c.id)
    const [{ data: voos }, { data: rodo }, { data: hosp }, { data: carro }, { data: van }] =
      await Promise.all([
        sb.from('voos').select('*').in('colaborador_id', ids),
        sb.from('transporte_rodoviario').select('*').in('colaborador_id', ids),
        sb.from('hospedagem_detalhe').select('*').in('colaborador_id', ids),
        sb.from('locacao_carro').select('*').eq('solicitacao_id', s.id).maybeSingle(),
        sb.from('locacao_van').select('*').eq('solicitacao_id', s.id).maybeSingle(),
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
    const totalVan = Number(van?.preco ?? 0)
    const total =
      s.custo_total_manual ?? totalVoos + totalBus + totalHosp + totalCarro + totalVan

    const transporte = !s.precisa_transporte
      ? 'não solicitado'
      : s.modal === 'AEREO'
        ? `aéreo ${s.aeroporto_saida} → ${s.aeroporto_chegada}`
        : s.modal === 'VAN'
          ? `van de ${s.van_local_saida} para ${s.van_destino} (${s.van_qtd_passageiros} pax)`
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

    // ---- Canal 1: e-mail para o diretor ---------------------------------
    const link = site ? `${site}/aprovacao/${s.id}` : ''
    let emailEnviado = false
    let motivoEmail = 'diretor sem e-mail cadastrado'

    if (s.diretores.email) {
      if (!Deno.env.get('RESEND_API_KEY') || !Deno.env.get('EMAIL_FROM')) {
        motivoEmail = 'provedor de e-mail não configurado (RESEND_API_KEY / EMAIL_FROM)'
      } else {
        const envio = await enviarEmail(
          s.diretores.email,
          `[${s.protocolo}] Aprovação pendente — ${s.edicoes.destino} · ${moeda(total)}`,
          layoutEmail(
            'Solicitação aguardando sua aprovação',
            `<p>Olá, ${s.diretores.nome.split(' ')[0]}!</p>
             <p>A operação preparou a solicitação
                <strong style="font-family:monospace">${s.protocolo}</strong> e ela está
                aguardando sua decisão no sistema.</p>
             <table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0">
               <tr><td style="padding:6px 0;color:#64748b;width:150px">Destino</td><td>${s.edicoes.destino} — ${s.edicoes.hotel}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Equipe</td><td>${EQUIPE_LABEL[s.equipe] ?? s.equipe} · ${s.colaboradores.length} pax</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Estadia</td><td>${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Transporte</td><td>${transporte}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Solicitante</td><td>${s.solicitante_nome}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b"><strong>Custo total</strong></td><td><strong>${moeda(total)}</strong></td></tr>
             </table>
             ${link ? `<p><a href="${link}" style="background:#f5c400;color:#111;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Aprovar ou reprovar no sistema</a></p>` : ''}
             <p style="color:#64748b;font-size:13px">A decisão é registrada com seu nome, data e hora.</p>`,
          ),
        )
        emailEnviado = envio.enviado
        if (!envio.enviado) motivoEmail = envio.motivo ?? 'falha no envio'
      }
    }

    // ---- Canal 2: aviso no Slack ----------------------------------------
    let slackTs: string | null = null
    let motivoSlack = 'Slack não configurado (SLACK_BOT_TOKEN / SLACK_CHANNEL_ID)'

    if (token && canal) {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ channel: canal, text: texto, unfurl_links: false }),
      })
      const resultado = await res.json()
      if (resultado.ok) slackTs = resultado.ts
      else motivoSlack = `Slack recusou a mensagem: ${resultado.error}`
    }

    // Se nenhum canal funcionou, o operacional precisa saber — senão ele
    // acha que avisou o diretor e a solicitação fica parada.
    if (!emailEnviado && !slackTs)
      return erro(
        `Não foi possível avisar ${s.diretores.nome}. E-mail: ${motivoEmail}. Slack: ${motivoSlack}.`,
        502,
      )

    const canais = [emailEnviado ? 'e-mail' : null, slackTs ? 'Slack' : null]
      .filter(Boolean)
      .join(' e ')

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: s.id,
      tipo: 'AVISO_APROVADOR',
      descricao: `${s.diretores.nome} avisado por ${canais}`,
      payload: { ts: slackTs, canal, email: emailEnviado ? s.diretores.email : null },
    })

    return json({ ok: true, canais, ts: slackTs })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
