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
} from '../_shared/comum.ts'

const secao = (titulo: string, corpo: string) => `
  <h2 style="font-size:12px;letter-spacing:1.5px;color:#1f47b8;margin:24px 0 8px;text-transform:uppercase">${titulo}</h2>
  <div style="font-size:14px;line-height:1.6">${corpo}</div>`

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
    if (s.status !== 'APROVADA')
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
      `<strong>${s.edicoes.destino}</strong> — ${s.edicoes.hotel}<br>
       Evento: ${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)} ·
       Sua estadia: ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}<br>
       ${EQUIPE_LABEL[s.equipe] ?? s.equipe} · ${colabs.length} colaborador(es)`,
    )

    const linhasHosp = colabs
      .map((c: { id: string; nome_completo: string }) => {
        const h = hosp?.find((x) => x.colaborador_id === c.id)
        if (!h?.hotel) return ''
        return `<p style="margin:0 0 10px"><strong>${c.nome_completo}</strong><br>
          ${h.hotel}${h.tipo_quarto ? ` · ${h.tipo_quarto}` : ''}<br>
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

    const envio = await enviarEmail(
      s.solicitante_email,
      `[${s.protocolo}] Sua viagem para ${s.edicoes.destino} está confirmada`,
      layoutEmail('Viagem confirmada', corpo),
    )

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: s.id,
      tipo: 'EMAIL_CONFIRMACAO',
      descricao: envio.enviado
        ? `Confirmação enviada para ${s.solicitante_email}`
        : `Confirmação NÃO enviada para ${s.solicitante_email}: ${envio.motivo}`,
    })

    // Não damos ok silencioso quando o e-mail não saiu: a operação
    // precisa saber para avisar o solicitante por outro caminho.
    if (!envio.enviado)
      return erro(
        `A viagem está confirmada no sistema, mas o e-mail não foi enviado: ${envio.motivo}. Avise ${s.solicitante_email} por outro canal.`,
        502,
      )

    return json({ ok: true, destinatario: s.solicitante_email })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
