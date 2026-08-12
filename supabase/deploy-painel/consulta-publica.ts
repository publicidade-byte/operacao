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

// Painel de consulta com senha única compartilhada.
//
// Qualquer pessoa da Forma consulta o andamento e pega os dados da viagem
// (voos, localizadores, hotel, carro) sem precisar de conta.
//
// A senha é conferida AQUI, no servidor, e não no navegador: assim o
// conteúdo só sai daqui depois de conferida. Trocar a senha é definir o
// segredo SENHA_CONSULTA nas Edge Functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SENHA_PADRAO = 'FORMA123'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { senha, solicitacao_id } = await req.json()
    const esperada = Deno.env.get('SENHA_CONSULTA') ?? SENHA_PADRAO
    if (String(senha ?? '') !== esperada) return erro('Senha incorreta.', 401)

    // ---- lista resumida -------------------------------------------------
    if (!solicitacao_id) {
      const { data } = await sb
        .from('solicitacoes')
        .select(
          'id, protocolo, status, servicos, equipe, equipe_outro, data_entrada, data_saida, solicitante_nome, created_at, edicoes!solicitacoes_edicao_id_fkey(destino, hotel, data_inicio, data_fim), colaboradores(id)',
        )
        // A lixeira nao aparece na consulta publica.
        .is('excluida_em', null)
        .order('created_at', { ascending: false })

      return json({
        solicitacoes: (data ?? []).map((s) => ({
          id: s.id,
          protocolo: s.protocolo,
          status: s.status,
          servicos: s.servicos,
          equipe: s.equipe,
          equipe_outro: s.equipe_outro,
          data_entrada: s.data_entrada,
          data_saida: s.data_saida,
          solicitante_nome: s.solicitante_nome,
          destino: s.edicoes?.destino,
          hotel: s.edicoes?.hotel,
          evento_inicio: s.edicoes?.data_inicio,
          evento_fim: s.edicoes?.data_fim,
          qtd_pax: s.colaboradores?.length ?? 0,
        })),
      })
    }

    // ---- detalhe completo -----------------------------------------------
    const { data: s } = await sb
      .from('solicitacoes')
      .select(
        '*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(nome), colaboradores(*)',
      )
      .eq('id', solicitacao_id)
      .maybeSingle()
    if (!s) return erro('Solicitação não encontrada.', 404)

    const colabs = (s.colaboradores ?? []).sort(
      (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem,
    )
    const ids = colabs.map((c: { id: string }) => c.id)

    const [voos, rodo, hosp, carro, van, carrosPedidos, ops] = await Promise.all([
      sb.from('voos').select('*').in('colaborador_id', ids),
      sb.from('transporte_rodoviario').select('*').in('colaborador_id', ids),
      sb.from('hospedagem_detalhe').select('*').in('colaborador_id', ids),
      sb.from('locacao_carro').select('*').eq('solicitacao_id', s.id).maybeSingle(),
      sb.from('locacao_van').select('*').eq('solicitacao_id', s.id).maybeSingle(),
      sb.from('solicitacao_carros').select('*').eq('solicitacao_id', s.id).order('ordem'),
      sb
        .from('solicitacao_edicoes')
        .select('edicoes(codigo, data_inicio, data_fim)')
        .eq('solicitacao_id', s.id),
    ])

    return json({
      solicitacao: {
        ...s,
        destino: s.edicoes?.destino,
        hotel: s.edicoes?.hotel,
        diretor: s.diretores?.nome,
        colaboradores: colabs,
        operacoes: (ops.data ?? [])
          .map((o: { edicoes: unknown }) => o.edicoes)
          .filter(Boolean),
      },
      voos: voos.data ?? [],
      rodoviario: rodo.data ?? [],
      hospedagem: hosp.data ?? [],
      carro: carro.data ?? null,
      van: van.data ?? null,
      carros_pedidos: carrosPedidos.data ?? [],
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
