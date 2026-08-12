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

// Avisa a equipe operacional no Slack quando chega uma solicitação nova.
//
// Diferente do aviso ao diretor, aqui a mensagem é só de ciência: "chegou
// isto, é da sua área". Não pede decisão.
//
// Quem recebe: gestores (areas vazio) recebem tudo. Os demais recebem só
// quando a solicitação toca uma das suas áreas:
//   AEREO · RODOVIARIO · VAN · CARRO · HOSP_PAX · HOSP_FORA

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
/** Uma linha rótulo/valor no corpo do e-mail. */
const linhaEmail = (rotulo: string, valor: string) =>
  `<p style="margin:0 0 6px;font-size:14px"><span style="color:#64748b">${rotulo}:</span> ${valor}</p>`

const ROTULO: Record<string, string> = {
  AEREO: 'aéreo',
  RODOVIARIO: 'rodoviário',
  VAN: 'van ou ônibus',
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
