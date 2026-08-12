// Painel de consulta com senha única compartilhada.
//
// Qualquer pessoa da Forma consulta o andamento e pega os dados da viagem
// (voos, localizadores, hotel, carro) sem precisar de conta.
//
// A senha é conferida AQUI, no servidor, e não no navegador: assim o
// conteúdo só sai daqui depois de conferida. Trocar a senha é definir o
// segredo SENHA_CONSULTA nas Edge Functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, erro, json } from '../_shared/comum.ts'

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
