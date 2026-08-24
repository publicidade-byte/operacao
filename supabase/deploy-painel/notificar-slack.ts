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
  OPERACIONAL: 'Operacional',
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
    const bruto = await res.text()
    console.error('Resend recusou o envio:', bruto)
    return { enviado: false, motivo: explicarFalhaEmail(bruto, from) }
  }
  return { enviado: true }
}

/**
 * Traduz a recusa do provedor para algo acionável.
 *
 * O texto do Resend vem em JSON e em inglês. Jogado direto na tela, quem
 * opera lê um parágrafo técnico e não descobre o que fazer — e o que fazer
 * quase nunca é com ela: é configuração de domínio, feita uma vez só.
 */
function explicarFalhaEmail(bruto: string, remetente: string) {
  let msg = bruto
  try {
    msg = JSON.parse(bruto)?.message ?? bruto
  } catch {
    // resposta não-JSON: fica o texto bruto mesmo
  }

  if (/domain is not verified/i.test(msg)) {
    const dominio = msg.match(/The (\S+) domain/i)?.[1] ?? remetente.split('@').pop()
    return (
      `o domínio ${dominio} ainda não foi verificado no provedor de e-mail. ` +
      `Enquanto isso, nenhum e-mail sai para fora. Quem resolve: adicionar o ` +
      `domínio em resend.com/domains e publicar os registros de DNS que eles indicam.`
    )
  }

  if (/only send testing emails to your own email/i.test(msg)) {
    const dono = msg.match(/\(([^)]+@[^)]+)\)/)?.[1] ?? 'o e-mail dono da conta'
    return (
      `a conta de e-mail ainda está em modo de teste: só entrega em ${dono}. ` +
      `Para enviar a qualquer destinatário é preciso verificar um domínio em ` +
      `resend.com/domains e usar um remetente desse domínio.`
    )
  }

  return `o provedor recusou o envio — ${msg}`
}

/**
 * Como a solicitação se identifica: destino do calendário ou centro de custo.
 *
 * Na operação avulsa o "destino" é uma linha de fachada — mostrar o nome dela
 * e o período fictício (01/01 a 31/12) confundiria quem lê o aviso. O que
 * importa ali é de qual centro de custo veio a demanda.
 */
export function descreverDestino(
  s: {
    centro_custo?: string | null
    edicoes?: { destino?: string; hotel?: string; avulsa?: boolean } | null
  },
  { comHotel = true } = {},
) {
  const e = s.edicoes
  if (e?.avulsa) return `Outras operações — ${s.centro_custo ?? 'centro de custo não informado'}`
  if (!e?.destino) return '—'
  return comHotel && e.hotel ? `${e.destino} — ${e.hotel}` : e.destino
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

/**
 * "29/09/2026 07:50" a partir de data e hora guardadas separadamente.
 *
 * Sem `new Date`: esses campos não têm fuso, e converter foi exatamente o
 * que fazia o horário digitado voltar deslocado. Aqui é só formatação.
 */
export function dataHora(data?: string | null, hora?: string | null) {
  if (!data) return '—'
  const [a, m, d] = data.slice(0, 10).split('-')
  return `${d}/${m}/${a}${hora ? ` ${hora.slice(0, 5)}` : ''}`
}

// Manda no DM do diretor aprovador o resumo da solicitação.
// Exige usuário admin autenticado (o token vem do painel).
//
// Vai por DM, não por canal: a mensagem traz a composição de custos e é uma
// pendência pessoal do diretor. Sem `slack_user_id` cadastrado não há para
// onde mandar — nesse caso sobra o e-mail.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const porServico: [string, string, number][] = [
      ['AEREO', 'Aéreo', totalVoos],
      ['RODOVIARIO', 'Rodoviário', totalBus],
      ['HOSPEDAGEM', 'Hospedagem', totalHosp],
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
      HOSPEDAGEM: 'hospedagem',
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
