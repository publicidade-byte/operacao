// Manda no DM do diretor aprovador o resumo da solicitação.
// Exige usuário admin autenticado (o token vem do painel).
//
// Vai por DM, não por canal: a mensagem traz a composição de custos e é uma
// pendência pessoal do diretor. Sem `slack_user_id` cadastrado não há para
// onde mandar — nesse caso sobra o e-mail.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  cors,
  erro,
  json,
  dataBR,
  dataHoraBR,
  dataHora,
  moeda,
  enviarEmail,
  layoutEmail,
  EQUIPE_LABEL,
  descreverDestino,
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
    // Num DM a menção é redundante — o próprio canal já é do diretor.
    const dmDiretor: string | null = s.diretores.slack_user_id ?? null
    const primeiroNome = s.diretores.nome.split(' ')[0]

    const linhasPax = s.colaboradores
      .sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
      .map((c: { id: string; nome_completo: string }) => {
        const ida = voos?.find((v) => v.colaborador_id === c.id && v.trecho === 'IDA')
        const volta = voos?.find((v) => v.colaborador_id === c.id && v.trecho === 'VOLTA')
        const bus = rodo?.find((r) => r.colaborador_id === c.id)
        const partes: string[] = []
        // As colunas `partida`/`horario_ida` são as antigas timestamptz, que
        // deslocavam a hora e pararam de ser preenchidas quando data e hora
        // foram separadas. Quem ainda lia delas mostrava horário vazio para
        // o diretor — que é o único lugar onde ninguém ia reclamar.
        if (ida)
          partes.push(
            `ida ${ida.companhia ?? ''} ${ida.numero_voo ?? ''} ${dataHora(ida.partida_data, ida.partida_hora)}`.trim(),
          )
        if (volta)
          partes.push(
            `volta ${volta.companhia ?? ''} ${volta.numero_voo ?? ''} ${dataHora(volta.partida_data, volta.partida_hora)}`.trim(),
          )
        if (bus?.ida_data)
          partes.push(`ônibus ida ${dataHora(bus.ida_data, bus.ida_hora)}`)
        return `• ${c.nome_completo}${partes.length ? ` — ${partes.join(' / ')}` : ''}`
      })
      .join('\n')

    const totalVoos = (voos ?? []).reduce((t, v) => t + Number(v.preco ?? 0), 0)
    const totalBus = (rodo ?? []).reduce((t, v) => t + Number(v.preco ?? 0), 0)
    // A operação lança o valor fechado da hospedagem; não há mais diária
    // para multiplicar por noites.
    const totalHosp = (hosp ?? []).reduce((t, h) => t + Number(h.valor_total ?? 0), 0)
    const totalCarro = Number(carro?.preco ?? 0)
    const totalVan = Number(van?.preco ?? 0)

    /**
     * O que esta rodada está pedindo para o diretor decidir.
     *
     * Numa aprovação parcial ele precisa ver SÓ o escopo: mandar o custo da
     * viagem inteira quando o pedido é "aprove a passagem" faria ele aprovar,
     * na prática, um número que ninguém fechou ainda.
     */
    const escopo: string[] = s.escopo_aprovacao?.length ? s.escopo_aprovacao : s.servicos
    const parcial = escopo.length < (s.servicos?.length ?? 0)
    const noEscopo = (sv: string) => escopo.includes(sv)

    // As duas hospedagens são serviços separados e podem ser aprovadas em
    // rodadas diferentes — por isso cada uma soma o seu.
    const somaHosp = (tipo: string) =>
      (hosp ?? [])
        .filter((h) => (h.tipo ?? 'HOTEL_PAX') === tipo)
        .reduce((t, h) => t + Number(h.valor_total ?? 0), 0)

    const porServico: [string, string, number][] = [
      ['AEREO', 'Aéreo', totalVoos],
      ['RODOVIARIO', 'Rodoviário', totalBus],
      ['HOSPEDAGEM', 'Hospedagem op.', somaHosp('HOTEL_PAX')],
      ['HOSPEDAGEM_FORA', 'Hospedagem fora', somaHosp('FORA_HOTEL_PAX')],
      ['CARRO', 'Carro', totalCarro],
      ['VAN', 'Van/ônibus', totalVan],
    ]
    const linhasCusto = porServico
      .filter(([sv]) => noEscopo(sv))
      .map(([, nome, v]) => `${nome} ${moeda(v)}`)
      .join(' · ')

    // O total manual é o valor fechado da solicitação inteira; numa rodada
    // parcial ele não responde à pergunta que está sendo feita.
    const total = parcial
      ? porServico.filter(([sv]) => noEscopo(sv)).reduce((t, [, , v]) => t + v, 0)
      : (s.custo_total_manual ?? totalVoos + totalBus + totalHosp + totalCarro + totalVan)

    const ROTULO: Record<string, string> = {
      AEREO: 'aéreo',
      RODOVIARIO: 'rodoviário',
      HOSPEDAGEM: 'hospedagem no hotel da operação',
      HOSPEDAGEM_FORA: 'hospedagem fora do hotel do pax',
      CARRO: 'locação de carro',
      VAN: 'van/ônibus',
    }
    const escopoTexto = escopo.map((x) => ROTULO[x] ?? x).join(', ')

    /**
     * O prazo de emissão mais apertado da solicitação.
     *
     * Vai no topo da mensagem porque é a única informação aqui cuja
     * consequência é o tempo passar: sem ela, adiar a decisão parece de
     * graça — e não é, a reserva cai e a operação refaz com tarifa nova.
     */
    const prazos = (voos ?? [])
      .filter((v) => v.emissao_prazo_data)
      .sort((a, b) => String(a.emissao_prazo_data).localeCompare(String(b.emissao_prazo_data)))
    const prazo = prazos[0] ?? null
    const diasAteEmitir = prazo
      ? Math.ceil(
          (new Date(`${prazo.emissao_prazo_data}T12:00:00`).getTime() - Date.now()) /
            86_400_000,
        )
      : null
    const linhaPrazo = prazo
      ? `:hourglass_flowing_sand: *Prazo de emissão: ${dataHora(prazo.emissao_prazo_data, prazo.emissao_prazo_hora)}*` +
        (diasAteEmitir === null
          ? ''
          : diasAteEmitir < 0
            ? ' — já venceu, a tarifa provavelmente caiu.'
            : diasAteEmitir === 0
              ? ' — é hoje. Depois disso a reserva cai.'
              : diasAteEmitir === 1
                ? ' — é amanhã. Depois disso a reserva cai.'
                : ` — faltam ${diasAteEmitir} dias. Depois disso a reserva cai.`)
      : null

    const transporte = !s.precisa_transporte
      ? 'não solicitado'
      : s.modal === 'AEREO'
        ? `aéreo ${s.aeroporto_saida} → ${s.aeroporto_chegada}`
        : s.modal === 'VAN'
          ? `van/ônibus de ${s.van_local_saida} para ${s.van_destino} (${s.van_qtd_passageiros} pax)`
          : 'rodoviário'

    const texto = [
      parcial
        ? `:airplane: *${s.protocolo} — aprovação parcial: ${escopoTexto}*`
        : `:airplane: *Solicitação ${s.protocolo} aguarda sua aprovação no sistema*`,
      parcial
        ? `Olá, ${primeiroNome}! A operação está pedindo sua decisão *apenas sobre ${escopoTexto}* — ` +
          `o restante desta solicitação ainda está sendo cotado e virá depois.`
        : `Olá, ${primeiroNome}! Há uma pendência para você:`,
      '',
      linhaPrazo,
      linhaPrazo ? '' : null,
      `*Destino:* ${descreverDestino(s)}` +
        (s.edicoes.avulsa
          ? ''
          : ` (${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)})`),
      `*Equipe:* ${EQUIPE_LABEL[s.equipe] ?? s.equipe}  ·  *Pax:* ${s.colaboradores.length}`,
      `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}`,
      `*Hospedagem:* ${s.tipo_hospedagem === 'HOTEL_PAX' ? 'hotel do pax' : 'fora do hotel do pax'}`,
      `*Transporte:* ${transporte}  ·  *Locação de carro:* ${s.precisa_locacao_carro ? 'sim' : 'não'}`,
      `*Solicitante:* ${s.solicitante_nome} — ${s.solicitante_email}`,
      '',
      '*Colaboradores*',
      linhasPax,
      '',
      parcial ? `*Custo de ${escopoTexto}:* ${moeda(total)}` : `*Custo total:* ${moeda(total)}`,
      `    ${linhasCusto}`,
      '',
      `_Obs. do solicitante:_ ${s.obs_transporte}`,
      s.precisa_locacao_carro && s.obs_locacao_carro
        ? `_Obs. locação:_ ${s.obs_locacao_carro}`
        : null,
      '',
      site
        ? `:point_right: <${site}/aprovacao/${s.id}|*Abrir no sistema para aprovar ou reprovar*>`
        : null,
      '_A aprovação é feita dentro do sistema — esta mensagem é apenas um aviso._',
    ]
      // Só as linhas ausentes saem. `filter(Boolean)` comeria também as
      // strings vazias, que aqui são os espaçamentos entre os blocos.
      .filter((l): l is string => l !== null)
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
          parcial
            ? `[${s.protocolo}] Aprovação de ${escopoTexto} — ${descreverDestino(s, { comHotel: false })} · ${moeda(total)}`
            : `[${s.protocolo}] Aprovação pendente — ${descreverDestino(s, { comHotel: false })} · ${moeda(total)}`,
          layoutEmail(
            parcial
              ? `Aprovação parcial: ${escopoTexto}`
              : 'Solicitação aguardando sua aprovação',
            `<p>Olá, ${s.diretores.nome.split(' ')[0]}!</p>
             ${
               parcial
                 ? `<p>A operação está pedindo sua decisão <strong>apenas sobre ${escopoTexto}</strong>
                    da solicitação <strong style="font-family:monospace">${s.protocolo}</strong>.
                    O restante ainda está sendo cotado e virá em outra aprovação.</p>`
                 : `<p>A operação preparou a solicitação
                    <strong style="font-family:monospace">${s.protocolo}</strong> e ela está
                    aguardando sua decisão no sistema.</p>`
             }
             <table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0">
               <tr><td style="padding:6px 0;color:#64748b;width:150px">Destino</td><td>${descreverDestino(s)}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Equipe</td><td>${EQUIPE_LABEL[s.equipe] ?? s.equipe} · ${s.colaboradores.length} pax</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Estadia</td><td>${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Transporte</td><td>${transporte}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Solicitante</td><td>${s.solicitante_nome}</td></tr>
               <tr><td style="padding:6px 0;color:#64748b"><strong>${parcial ? `Custo de ${escopoTexto}` : 'Custo total'}</strong></td><td><strong>${moeda(total)}</strong></td></tr>
               <tr><td style="padding:6px 0;color:#64748b">Composição</td><td>${linhasCusto}</td></tr>
               ${
                 prazo
                   ? `<tr><td style="padding:6px 0;color:#64748b"><strong>Prazo de emissão</strong></td>
                        <td><strong style="color:#b45309">${dataHora(prazo.emissao_prazo_data, prazo.emissao_prazo_hora)}</strong>
                        ${diasAteEmitir !== null && diasAteEmitir < 0 ? ' — já venceu' : ' — depois disso a reserva cai'}</td></tr>`
                   : ''
               }
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
    let motivoSlack = !token
      ? 'SLACK_BOT_TOKEN não configurado'
      : `${s.diretores.nome} não tem slack_user_id cadastrado`

    if (token && dmDiretor) {
      // `channel` com um user id faz o Slack abrir/usar o DM com essa pessoa.
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ channel: dmDiretor, text: texto, unfurl_links: false }),
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
      payload: {
        ts: slackTs,
        dm: slackTs ? dmDiretor : null,
        email: emailEnviado ? s.diretores.email : null,
      },
    })

    return json({ ok: true, canais, ts: slackTs })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
