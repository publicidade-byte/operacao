// Acompanhamento público por token. Devolve versão reduzida:
// SEM CPF, SEM data de nascimento, SEM preços.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, erro, json } from '../_shared/comum.ts'

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
