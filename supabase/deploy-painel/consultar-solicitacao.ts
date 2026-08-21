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

// Acompanhamento público por token. Devolve versão reduzida:
// SEM CPF, SEM data de nascimento, SEM preços.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { token } = await req.json()
    if (!token || typeof token !== 'string' || token.length < 20)
      return erro('Link inválido.', 400)

    const { data: s } = await sb
      .from('solicitacoes')
      .select('*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(nome), colaboradores(id, nome_completo, ordem, aprovacao, aprovacao_obs)')
      .eq('token_acompanhamento', token)
      // Excluida nao abre nem pelo link de acompanhamento.
      .is('excluida_em', null)
      .maybeSingle()

    if (!s) return erro('Solicitação não encontrada.', 404)

    const todos = (s.colaboradores ?? []).sort(
      (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem,
    )
    // Quem o diretor reprovou não viaja. Deixar o nome na lista de quem vai
    // faria a pessoa se programar para uma viagem que não existe.
    const colaboradores = todos.filter(
      (c: { aprovacao: boolean | null }) => c.aprovacao !== false,
    )
    const reprovados = todos.filter(
      (c: { aprovacao: boolean | null }) => c.aprovacao === false,
    )

    const base = {
      protocolo: s.protocolo,
      status: s.status,
      destino: s.edicoes.destino,
      hotel: s.edicoes.hotel,
      evento_inicio: s.edicoes.data_inicio,
      evento_fim: s.edicoes.data_fim,
      data_entrada: s.data_entrada,
      data_saida: s.data_saida,
      equipe: s.equipe,
      equipe_outro: s.equipe_outro,
      tipo_hospedagem: s.tipo_hospedagem,
      precisa_transporte: s.precisa_transporte,
      modal: s.modal,
      aeroporto_saida: s.aeroporto_saida,
      aeroporto_chegada: s.aeroporto_chegada,
      precisa_locacao_carro: s.precisa_locacao_carro,
      diretor: s.diretores.nome,
      colaboradores: colaboradores.map((c: { nome_completo: string }) => ({
        nome_completo: c.nome_completo,
      })),
      nao_aprovados: reprovados.map(
        (c: { nome_completo: string; aprovacao_obs: string | null }) => ({
          nome_completo: c.nome_completo,
          motivo: c.aprovacao_obs,
        }),
      ),
    }

    // Dados de viagem só depois de concluída.
    if (s.status !== 'CONCLUIDA') return json(base)

    const ids = colaboradores.map((c: { id: string }) => c.id)
    const [v, r, h] = await Promise.all([
      sb
        .from('voos')
        .select(
          'colaborador_id, trecho, companhia, numero_voo, partida, chegada, aeroporto_origem, aeroporto_destino, localizador',
        )
        .in('colaborador_id', ids),
      sb
        .from('transporte_rodoviario')
        .select('colaborador_id, empresa, horario_ida, horario_volta')
        .in('colaborador_id', ids),
      sb
        .from('hospedagem_detalhe')
        .select(
          'colaborador_id, hotel, hotel_hospedagem, check_in, check_out, codigo_reserva',
        )
        .in('colaborador_id', ids),
    ])

    const viagem = colaboradores.map((c: { id: string; nome_completo: string }) => ({
      colaborador: c.nome_completo,
      voos: (v.data ?? [])
        .filter((x) => x.colaborador_id === c.id)
        .sort((a) => (a.trecho === 'IDA' ? -1 : 1)),
      rodoviario: (r.data ?? []).find((x) => x.colaborador_id === c.id) ?? null,
      hospedagem: (h.data ?? []).find((x) => x.colaborador_id === c.id) ?? null,
    }))

    return json({ ...base, viagem })
  } catch (e) {
    console.error(e)
    return erro('Erro ao consultar.', 500)
  }
})
