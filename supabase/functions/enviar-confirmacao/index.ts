// E-mail final ao solicitante, com todos os dados da viagem.
// Por decisão de projeto, NÃO inclui preços.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  cors,
  erro,
  json,
  dataBR,
  dataHoraBR,
  enviarEmail,
  layoutEmail,
  EQUIPE_LABEL,
  AMARELO,
  descreverDestino,
} from '../_shared/comum.ts'

const secao = (titulo: string, corpo: string) => `
  <h2 style="font-size:12px;letter-spacing:1.5px;color:#171717;margin:24px 0 8px;text-transform:uppercase;border-left:3px solid ${AMARELO};padding-left:8px">${titulo}</h2>
  <div style="font-size:14px;line-height:1.6">${corpo}</div>`

/**
 * Avisa o canal da operação do desfecho.
 *
 * O e-mail vai para o solicitante, que muitas vezes nem tem Slack. Mas a
 * equipe precisa ver que a viagem fechou — e, se o e-mail não saiu, saber
 * disso na hora, para avisar por outro caminho.
 */
async function avisarCanal(texto: string) {
  const token = Deno.env.get('SLACK_BOT_TOKEN')
  const canal = Deno.env.get('SLACK_CHANNEL_ID')
  if (!token || !canal) return { enviado: false, motivo: 'Slack não configurado' }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: canal, text: texto, unfurl_links: false }),
    })
    const r = await res.json()
    return r.ok ? { enviado: true } : { enviado: false, motivo: `Slack: ${r.error}` }
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : 'falha no Slack' }
  }
}

/**
 * Manda a confirmação no Slack do próprio solicitante.
 *
 * Quem pede pelo formulário está no mesmo workspace, então dá para achar a
 * pessoa pelo e-mail que ela informou e mandar direto no privado. Isso não
 * substitui o e-mail — mas enquanto o domínio não estiver verificado no
 * provedor, é o único caminho que chega em quem pediu.
 *
 * `users.lookupByEmail` exige o escopo users:read.email no app do Slack.
 * Sem ele a resposta é `missing_scope`, e a mensagem diz isso por extenso
 * em vez de "não enviado" seco.
 */
async function dmSolicitante(email: string, texto: string) {
  const token = Deno.env.get('SLACK_BOT_TOKEN')
  if (!token) return { enviado: false, motivo: 'Slack não configurado' }

  try {
    const busca = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const achado = await busca.json()

    if (!achado.ok) {
      if (achado.error === 'users_not_found')
        return { enviado: false, motivo: `${email} não tem conta neste Slack` }
      if (achado.error === 'missing_scope')
        return {
          enviado: false,
          motivo:
            'falta o escopo users:read.email no app do Slack — sem ele não dá para achar a pessoa pelo e-mail',
        }
      return { enviado: false, motivo: `Slack: ${achado.error}` }
    }

    const envio = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: achado.user.id, text: texto, unfurl_links: false }),
    })
    const r = await envio.json()
    return r.ok
      ? { enviado: true, para: achado.user.name as string }
      : { enviado: false, motivo: `Slack recusou a mensagem: ${r.error}` }
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : 'falha no Slack' }
  }
}

const QUARTO: Record<string, string> = {
  SINGLE: 'Single',
  DUPLO: 'Duplo',
  TRIPLO: 'Triplo',
  QUADRUPLO: 'Quádruplo',
  QUINTUPLO: 'Quíntuplo',
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
      .select('*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(*), colaboradores(*)')
      .eq('id', solicitacao_id)
      .maybeSingle()
    if (!s) return erro('Solicitação não encontrada.', 404)
    // Aceita CONCLUIDA porque a operação marca a conclusão antes de disparar
    // o e-mail — e também para permitir reenvio depois.
    if (!['APROVADA', 'CONCLUIDA'].includes(s.status))
      return erro('A confirmação só pode ser enviada após a aprovação.', 409)

    const colabs = s.colaboradores.sort(
      (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem,
    )
    const ids = colabs.map((c: { id: string }) => c.id)
    const [{ data: voos }, { data: rodo }, { data: hosp }, { data: carro }] =
      await Promise.all([
        sb.from('voos').select('*').in('colaborador_id', ids),
        sb.from('transporte_rodoviario').select('*').in('colaborador_id', ids),
        sb.from('hospedagem_detalhe').select('*').in('colaborador_id', ids),
        sb.from('locacao_carro').select('*').eq('solicitacao_id', s.id).maybeSingle(),
      ])

    let corpo = `<p>Olá, ${s.solicitante_nome.split(' ')[0]}!</p>
      <p>Sua solicitação <strong style="font-family:monospace">${s.protocolo}</strong> foi
      aprovada por <strong>${s.diretores.nome}</strong>. Segue tudo confirmado:</p>`

    corpo += secao(
      'Destino',
      `<strong>${descreverDestino(s)}</strong><br>
       ${s.edicoes.avulsa ? '' : `Evento: ${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)} · `}
       Sua estadia: ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}<br>
       ${EQUIPE_LABEL[s.equipe] ?? s.equipe} · ${colabs.length} colaborador(es)`,
    )

    const linhasHosp = colabs
      .map((c: { id: string; nome_completo: string }) => {
        const h = hosp?.find((x) => x.colaborador_id === c.id)
        // Fora do hotel do pax, `hotel` é só a referência da operação — quem
        // viaja precisa do endereço onde vai realmente dormir.
        const hotel = h?.hotel_hospedagem || h?.hotel
        if (!hotel) return ''
        return `<p style="margin:0 0 10px"><strong>${c.nome_completo}</strong><br>
          ${hotel}${h.tipo_quarto ? ` · ${QUARTO[h.tipo_quarto] ?? h.tipo_quarto}` : ''}${h.alimentacao ? ` · ${h.alimentacao === 'COM_CAFE' ? 'com café' : 'sem café'}` : ''}<br>
          ${h.endereco ? `${h.endereco}<br>` : ''}
          Check-in ${dataBR(h.check_in)} · Check-out ${dataBR(h.check_out)}
          ${h.codigo_reserva ? `<br>Reserva <strong>${h.codigo_reserva}</strong>` : ''}
          ${h.dividindo_com ? `<br>Dividindo quarto com ${h.dividindo_com}` : ''}</p>`
      })
      .join('')
    if (linhasHosp)
      corpo += secao(
        'Hospedagem',
        `${s.tipo_hospedagem === 'FORA_HOTEL_PAX' ? '<em>Hospedagem fora do hotel de passageiros.</em><br><br>' : ''}${linhasHosp}`,
      )

    const linhasVoo = colabs
      .map((c: { id: string; nome_completo: string }) => {
        const meus = (voos ?? []).filter((v) => v.colaborador_id === c.id)
        if (!meus.length) return ''
        const trechos = meus
          .sort((a) => (a.trecho === 'IDA' ? -1 : 1))
          .map(
            (v) => `<tr>
              <td style="padding:3px 10px 3px 0;color:#64748b;white-space:nowrap">${v.trecho}</td>
              <td style="padding:3px 0">
                ${v.companhia ?? ''} ${v.numero_voo ?? ''} ·
                ${dataHoraBR(v.partida)} ${v.aeroporto_origem ?? ''} →
                ${dataHoraBR(v.chegada)} ${v.aeroporto_destino ?? ''}
                ${v.localizador ? `<br><span style="color:#64748b">Localizador</span> <strong style="font-family:monospace">${v.localizador}</strong>` : ''}
                ${v.bagagem_despachada === true ? '<br><span style="color:#64748b">Bagagem despachada incluída</span>' : ''}
              </td></tr>`,
          )
          .join('')
        return `<p style="margin:0 0 4px"><strong>${c.nome_completo}</strong></p>
          <table style="border-collapse:collapse;margin:0 0 14px">${trechos}</table>`
      })
      .join('')
    if (linhasVoo) corpo += secao('Voos', linhasVoo)

    const linhasBus = colabs
      .map((c: { id: string; nome_completo: string }) => {
        const r = rodo?.find((x) => x.colaborador_id === c.id)
        if (!r?.empresa && !r?.horario_ida) return ''
        return `<p style="margin:0 0 10px"><strong>${c.nome_completo}</strong><br>
          ${r.empresa ?? ''}<br>
          Ida: ${dataHoraBR(r.horario_ida)}${r.local_embarque_ida ? ` — ${r.local_embarque_ida}` : ''}<br>
          Volta: ${dataHoraBR(r.horario_volta)}${r.local_embarque_volta ? ` — ${r.local_embarque_volta}` : ''}</p>`
      })
      .join('')
    if (linhasBus) corpo += secao('Transporte rodoviário', linhasBus)

    if (carro?.locadora) {
      const condutor = colabs.find(
        (c: { id: string }) => c.id === carro.condutor_colaborador_id,
      )
      corpo += secao(
        'Locação de carro',
        `${carro.locadora}${carro.categoria ? ` · ${carro.categoria}` : ''}<br>
         Retirada ${dataHoraBR(carro.retirada_em)}${carro.retirada_local ? ` — ${carro.retirada_local}` : ''}<br>
         Devolução ${dataHoraBR(carro.devolucao_em)}${carro.devolucao_local ? ` — ${carro.devolucao_local}` : ''}
         ${condutor ? `<br>Condutor: ${condutor.nome_completo}` : ''}`,
      )
    }

    if (s.obs_transporte && s.precisa_transporte)
      corpo += secao('Observações', s.obs_transporte.replace(/\n/g, '<br>'))

    corpo += `<p style="margin-top:24px">Dúvidas? Responda este e-mail ou fale com a equipe operacional.</p>`

    // Versões de uma linha para o Slack — o e-mail já leva o detalhe todo.
    const resumoVoos = (voos ?? [])
      .map(
        (v) =>
          `${v.trecho === 'IDA' ? 'ida' : 'volta'} ${dataHoraBR(v.partida)}` +
          `${v.companhia ? ` ${v.companhia}` : ''}${v.numero_voo ? ` ${v.numero_voo}` : ''}` +
          `${v.localizador ? ` (loc. ${v.localizador})` : ''}`,
      )
      .join(' · ')

    const resumoHosp = [
      ...new Set(
        (hosp ?? [])
          .map((h) => h.hotel_hospedagem || h.hotel)
          .filter((x): x is string => !!x),
      ),
    ].join(' · ')

    const resumoCarro = carro?.locadora
      ? `${carro.locadora}${carro.retirada_em ? ` · retirada ${dataHoraBR(carro.retirada_em)}` : ''}`
      : ''

    // Três canais, todos em paralelo e independentes: e-mail e Slack para
    // quem pediu, e o canal da operação para a equipe. Um falhar não impede
    // os outros — e é justamente por isso que existe mais de um.
    const site = Deno.env.get('SITE_URL') ?? ''

    // Resumo curto para o Slack de quem pediu. O e-mail leva tudo; aqui vai
    // o essencial e o link, que é o que se olha no celular.
    const resumoSolicitante = [
      `:white_check_mark: *Sua viagem está confirmada — ${s.protocolo}*`,
      '',
      `*Destino:* ${descreverDestino(s)}`,
      `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}`,
      `*Pessoas:* ${colabs.map((c: { nome_completo: string }) => c.nome_completo).join(', ')}`,
      resumoVoos ? `*Voos:* ${resumoVoos}` : '',
      resumoHosp ? `*Hospedagem:* ${resumoHosp}` : '',
      resumoCarro ? `*Carro:* ${resumoCarro}` : '',
      '',
      site
        ? `:mag: <${site}/s/${s.token_acompanhamento}|Ver todos os detalhes>`
        : '',
      `Dúvidas? Fale com a equipe operacional.`,
    ]
      .filter(Boolean)
      .join('\n')

    const [envio, dm, aviso] = await Promise.all([
      enviarEmail(
        s.solicitante_email,
        `[${s.protocolo}] Sua viagem para ${descreverDestino(s, { comHotel: false })} está confirmada`,
        layoutEmail('Viagem confirmada', corpo),
      ),
      dmSolicitante(s.solicitante_email, resumoSolicitante),
      avisarCanal(
        [
          `:white_check_mark: *${s.protocolo} confirmada*`,
          '',
          `*Destino:* ${descreverDestino(s)}`,
          `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)} · ${colabs.length} pax`,
          `*Solicitante:* ${s.solicitante_nome} — ${s.solicitante_email}`,
          site ? `:link: <${site}/admin/solicitacoes/${s.id}|Ver no painel>` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    ])

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: s.id,
      tipo: 'CONFIRMACAO',
      descricao: [
        envio.enviado
          ? `E-mail enviado para ${s.solicitante_email}`
          : `E-mail NÃO enviado para ${s.solicitante_email}: ${envio.motivo}`,
        dm.enviado
          ? `Slack do solicitante avisado (@${(dm as { para?: string }).para ?? '?'})`
          : `Slack do solicitante NÃO avisado: ${dm.motivo}`,
        aviso.enviado ? 'Canal da operação avisado' : `Canal NÃO avisado: ${aviso.motivo}`,
      ].join(' · '),
    })

    // Só é falha quando o solicitante NÃO foi avisado por nenhum caminho.
    // Se o e-mail não saiu mas o Slack dele chegou, a informação chegou —
    // dizer "erro" aqui faria a operação correr atrás à toa.
    const limpar = (m?: string) => (m ?? '').replace(/\.\s*$/, '')
    if (!envio.enviado && !dm.enviado)
      return erro(
        `A viagem está confirmada no sistema, mas ${s.solicitante_nome} não foi avisado. ` +
          `E-mail: ${limpar(envio.motivo)}. Slack: ${limpar(dm.motivo)}. ` +
          `Avise ${s.solicitante_email} por outro canal.`,
        502,
      )

    return json({
      ok: true,
      destinatario: s.solicitante_email,
      email: envio.enviado ? 'enviado' : envio.motivo,
      slack_solicitante: dm.enviado
        ? `enviado para @${(dm as { para?: string }).para ?? s.solicitante_email}`
        : dm.motivo,
      canal_operacao: aviso.enviado ? 'avisado' : aviso.motivo,
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
