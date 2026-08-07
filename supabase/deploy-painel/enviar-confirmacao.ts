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

// Amarelo da marca (--color-marca-400) sobre preto. O layout usava azul,
// que não é da paleta — branco, cinza, preto e amarelo.
export const AMARELO = '#ffd21a'

export const layoutEmail = (titulo: string, corpo: string) => `
<div style="font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="border-bottom:3px solid ${AMARELO};padding-bottom:12px;margin-bottom:24px">
    <span style="font-size:11px;letter-spacing:2px;color:#171717;font-weight:700;background:${AMARELO};padding:2px 6px">FORMA 9</span>
    <h1 style="margin:10px 0 0;font-size:20px;color:#171717">${titulo}</h1>
  </div>
  ${corpo}
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    Mensagem automática do sistema de solicitações do Forma 9.
  </p>
</div>`

// E-mail final ao solicitante, com todos os dados da viagem.
// Por decisão de projeto, NÃO inclui preços.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
      `<strong>${s.edicoes.destino}</strong> — ${s.edicoes.hotel}<br>
       Evento: ${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)} ·
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

    // Os dois canais saem juntos e um não depende do outro: e-mail para o
    // solicitante, Slack para a equipe. Se um falhar, o outro já foi.
    const site = Deno.env.get('SITE_URL') ?? ''
    const [envio, aviso] = await Promise.all([
      enviarEmail(
        s.solicitante_email,
        `[${s.protocolo}] Sua viagem para ${s.edicoes.destino} está confirmada`,
        layoutEmail('Viagem confirmada', corpo),
      ),
      avisarCanal(
        [
          `:white_check_mark: *${s.protocolo} confirmada*`,
          '',
          `*Destino:* ${s.edicoes.destino} — ${s.edicoes.hotel}`,
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
        aviso.enviado ? 'Slack avisado' : `Slack NÃO avisado: ${aviso.motivo}`,
      ].join(' · '),
    })

    // Não damos ok silencioso quando o e-mail não saiu: quem precisa dos
    // dados é o solicitante, e o Slack não chega nele.
    if (!envio.enviado)
      return erro(
        `A viagem está confirmada no sistema, mas o e-mail não foi enviado: ${envio.motivo}. Avise ${s.solicitante_email} por outro canal.`,
        502,
      )

    return json({
      ok: true,
      destinatario: s.solicitante_email,
      slack: aviso.enviado ? 'avisado' : aviso.motivo,
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
