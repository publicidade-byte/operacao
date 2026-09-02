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

/** Cliente Supabase com service role — o tipo exato não interessa aqui. */
type Banco = ReturnType<typeof createClient>

/**
 * Descobre o usuário do Slack de quem pediu.
 *
 * Duas fontes, nesta ordem:
 *
 * 1. `slack_pessoas`, o mapa explícito de e-mail para usuário. É a fonte
 *    confiável e é o que faz o aviso funcionar hoje, sem depender de escopo
 *    nenhum. Também é o único jeito de atender quem usa e-mail diferente no
 *    Slack e no formulário.
 * 2. `users.lookupByEmail`, que exige o escopo `users:read.email`. Quando ele
 *    responde, o id é gravado no mapa — cada pessoa é procurada uma vez só e
 *    o mapa se completa sozinho.
 *
 * Não há terceira tentativa por nome: dois "Rafael" no workspace e a
 * confirmação de viagem de um vai para a caixa do outro. Melhor não enviar e
 * dizer por quê.
 */
async function acharNoSlack(sb: Banco, token: string, email: string) {
  const chave = email.trim().toLowerCase()

  const { data: mapeado } = await sb
    .from('slack_pessoas')
    .select('slack_user_id, nome')
    .eq('email', chave)
    .maybeSingle()
  if (mapeado?.slack_user_id)
    return { id: mapeado.slack_user_id as string, nome: (mapeado.nome as string) ?? chave }

  const busca = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(chave)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const achado = await busca.json()

  if (!achado.ok) {
    if (achado.error === 'users_not_found')
      return { motivo: `${email} não tem conta neste Slack` }
    if (achado.error === 'missing_scope')
      return {
        motivo:
          `${email} não está no mapa slack_pessoas, e o app do Slack não tem o escopo ` +
          `users:read.email para procurar sozinho — cadastre a pessoa no mapa`,
      }
    return { motivo: `Slack: ${achado.error}` }
  }

  // Grava o que descobriu. Se falhar, o aviso vai do mesmo jeito — cache
  // perdido custa uma chamada a mais, não a mensagem.
  await sb
    .from('slack_pessoas')
    .upsert(
      {
        email: chave,
        slack_user_id: achado.user.id,
        nome: achado.user.real_name ?? achado.user.name,
        origem: 'LOOKUP',
      },
      { onConflict: 'email' },
    )
    .then(undefined, () => {})

  return { id: achado.user.id as string, nome: (achado.user.real_name ?? achado.user.name) as string }
}

/**
 * Manda a confirmação no Slack do próprio solicitante.
 *
 * Quem pede pelo formulário está no mesmo workspace, então dá para mandar
 * direto no privado. Isso não substitui o e-mail — mas enquanto o domínio não
 * estiver verificado no provedor, é o caminho que de fato chega em quem pediu.
 */
async function dmSolicitante(sb: Banco, email: string, texto: string) {
  const token = Deno.env.get('SLACK_BOT_TOKEN')
  if (!token) return { enviado: false, motivo: 'Slack não configurado' }

  try {
    const pessoa = await acharNoSlack(sb, token, email)
    if (!pessoa.id) return { enviado: false, motivo: pessoa.motivo }

    const envio = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: pessoa.id, text: texto, unfurl_links: false }),
    })
    const r = await envio.json()
    return r.ok
      ? { enviado: true, para: pessoa.nome }
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

    // Quem o diretor reprovou individualmente NÃO entra na confirmação.
    // Mandar o voo de alguém que foi barrado seria pior do que não mandar
    // nada: a pessoa se programaria para viajar.
    const todos = s.colaboradores.sort(
      (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem,
    )
    const reprovados = todos.filter((c: { aprovacao: boolean | null }) => c.aprovacao === false)
    const colabs = todos.filter((c: { aprovacao: boolean | null }) => c.aprovacao !== false)

    if (colabs.length === 0 && todos.length > 0)
      return erro(
        'Todos os passageiros foram reprovados pelo diretor — não há o que confirmar.',
        409,
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

    // O solicitante precisa saber de quem foi barrado — senão ele conta com
    // uma pessoa que não vai, e descobre no aeroporto.
    if (reprovados.length > 0)
      corpo += secao(
        'Não aprovados',
        `<p style="margin:0">Estas pessoas <strong>não foram aprovadas</strong> por
          ${s.diretores.nome} e não fazem parte desta viagem:</p>
         <ul style="margin:8px 0 0;padding-left:18px">
           ${reprovados
             .map(
               (c: { nome_completo: string; aprovacao_obs: string | null }) =>
                 `<li>${c.nome_completo}${c.aprovacao_obs ? ` — ${c.aprovacao_obs}` : ''}</li>`,
             )
             .join('')}
         </ul>`,
      )

    // Uma pessoa pode ter DUAS hospedagens: o hotel da operação e um hotel
    // fora, para chegar antes ou sair depois. Mostrar só a primeira faria a
    // pessoa aparecer no aeroporto sem saber onde dorme na véspera.
    const ROTULO_HOSP: Record<string, string> = {
      HOTEL_PAX: 'Hotel da operação',
      FORA_HOTEL_PAX: 'Fora do hotel dos passageiros',
    }
    const linhasHosp = colabs
      .map((c: { id: string; nome_completo: string }) => {
        const minhas = (hosp ?? []).filter((x) => x.colaborador_id === c.id)
        const blocos = minhas
          .sort((a, b) => String(a.tipo ?? '').localeCompare(String(b.tipo ?? '')))
          .map((h) => {
            // Fora do hotel do pax, `hotel` é só a referência da operação —
            // quem viaja precisa do endereço onde vai realmente dormir.
            const hotel = h.hotel_hospedagem || h.hotel
            if (!hotel) return ''
            return `<p style="margin:0 0 10px">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">${ROTULO_HOSP[h.tipo ?? 'HOTEL_PAX'] ?? ''}</span><br>
              ${hotel}${h.tipo_quarto ? ` · ${QUARTO[h.tipo_quarto] ?? h.tipo_quarto}` : ''}${h.alimentacao ? ` · ${h.alimentacao === 'COM_CAFE' ? 'com café' : 'sem café'}` : ''}<br>
              ${h.endereco ? `${h.endereco}<br>` : ''}
              Check-in ${dataBR(h.check_in)} · Check-out ${dataBR(h.check_out)}
              ${h.codigo_reserva ? `<br>Reserva <strong>${h.codigo_reserva}</strong>` : ''}
              ${h.dividindo_com ? `<br>Dividindo quarto com ${h.dividindo_com}` : ''}</p>`
          })
          .join('')
        if (!blocos) return ''
        return `<p style="margin:0 0 4px"><strong>${c.nome_completo}</strong></p>${blocos}`
      })
      .join('')
    if (linhasHosp) corpo += secao('Hospedagem', linhasHosp)

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
                ${dataHora(v.partida_data, v.partida_hora)} ${v.aeroporto_origem ?? ''} →
                ${dataHora(v.chegada_data, v.chegada_hora)} ${v.aeroporto_destino ?? ''}
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
          Ida: ${dataHora(r.ida_data, r.ida_hora)}${r.local_embarque_ida ? ` — ${r.local_embarque_ida}` : ''}<br>
          Volta: ${dataHora(r.volta_data, r.volta_hora)}${r.local_embarque_volta ? ` — ${r.local_embarque_volta}` : ''}</p>`
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
         Retirada ${dataHora(carro.retirada_data, carro.retirada_hora)}${carro.retirada_local ? ` — ${carro.retirada_local}` : ''}<br>
         Devolução ${dataHora(carro.devolucao_data, carro.devolucao_hora)}${carro.devolucao_local ? ` — ${carro.devolucao_local}` : ''}
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
          `${v.trecho === 'IDA' ? 'ida' : 'volta'} ${dataHora(v.partida_data, v.partida_hora)}` +
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
      ? `${carro.locadora}${carro.retirada_data ? ` · retirada ${dataHora(carro.retirada_data, carro.retirada_hora)}` : ''}`
      : ''

    // Três canais, todos em paralelo e independentes: e-mail e Slack para
    // quem pediu, e o canal da operação para a equipe. Um falhar não impede
    // os outros — e é justamente por isso que existe mais de um.
    const site = Deno.env.get('SITE_URL') ?? ''

    // Resumo curto para o Slack de quem pediu. O e-mail leva tudo; aqui vai
    // o essencial e o link, que é o que se olha no celular.
    // Dois links, porque servem a momentos diferentes. O `/s/<token>` abre
    // direto nesta solicitação e não pede senha — é o que se clica na hora.
    // O `/consulta` é o portal com todas as solicitações, e pede a senha
    // compartilhada da equipe; vale guardar para depois.
    const resumoSolicitante = [
      `:white_check_mark: *Solicitação ${s.protocolo} concluída*`,
      '',
      `Olá, ${s.solicitante_nome.split(' ')[0]}! A operação finalizou o que você pediu.`,
      '',
      `*Destino:* ${descreverDestino(s)}`,
      `*Estadia:* ${dataBR(s.data_entrada)} a ${dataBR(s.data_saida)}`,
      `*Pessoas:* ${colabs.map((c: { nome_completo: string }) => c.nome_completo).join(', ')}`,
      resumoVoos ? `*Voos:* ${resumoVoos}` : '',
      resumoHosp ? `*Hospedagem:* ${resumoHosp}` : '',
      resumoCarro ? `*Carro:* ${resumoCarro}` : '',
      reprovados.length
        ? `:warning: *Não aprovados:* ${reprovados.map((c: { nome_completo: string }) => c.nome_completo).join(', ')}`
        : '',
      '',
      site ? `:mag: <${site}/s/${s.token_acompanhamento}|Ver esta solicitação>` : '',
      site ? `:desktop_computer: Portal de consulta: ${site}/consulta` : '',
      '',
      `Os detalhes completos também foram para o seu e-mail. Dúvidas? Fale com a equipe operacional.`,
    ]
      .filter(Boolean)
      .join('\n')

    const [envio, dm, aviso] = await Promise.all([
      enviarEmail(
        s.solicitante_email,
        `[${s.protocolo}] Sua viagem para ${descreverDestino(s, { comHotel: false })} está confirmada`,
        layoutEmail('Viagem confirmada', corpo),
      ),
      dmSolicitante(sb, s.solicitante_email, resumoSolicitante),
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
