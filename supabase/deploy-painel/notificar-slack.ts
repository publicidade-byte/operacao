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
      `Olá, ${primeiroNome}! Há uma pendência para você:`,
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
