// Exportação somente leitura das solicitações, para integração externa.
//
// Existe para o painel de escalas da F9 se atualizar sozinho, sem ninguém
// digitar nada e sem precisar da senha compartilhada da consulta. Nada aqui
// escreve: só lê e devolve.
//
// A chave de API vive num secret (ESCALAS_EXPORT_KEY) e é conferida AQUI, no
// servidor. O service_role nunca sai desta função.
//
// LGPD: a resposta é montada campo a campo, nunca com `select *`. CPF, data de
// nascimento, e-mail, WhatsApp, token de acompanhamento, preços e observações
// internas não entram — e não entram porque não são lidos do banco, não porque
// alguém lembrou de escondê-los depois.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })

const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status)

/** Teto de segurança: integração que pede tudo não derruba o banco. */
const TETO = 2000

/**
 * Compara sem entregar o tamanho nem a posição do primeiro caractere errado.
 *
 * Comparar com `===` responde mais rápido quanto mais cedo diverge, e isso,
 * repetido, vaza a chave. Aqui todo palpite custa o mesmo.
 */
function mesmaChave(a: string, b: string) {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

/** Lista separada por vírgula, em maiúsculas, sem vazios. */
const lista = (v: string | null) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)

const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A mais recente entre várias datas ISO. */
function maisRecente(...datas: (string | null | undefined)[]) {
  return datas.filter(Boolean).sort().pop() ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET') return erro('Use GET.', 405)

  // ---- chave de API ---------------------------------------------------
  const esperada = Deno.env.get('ESCALAS_EXPORT_KEY') ?? ''
  if (!esperada) {
    // Sem secret configurado, responder dados seria abrir a porta sozinho.
    console.error('ESCALAS_EXPORT_KEY não configurada')
    return erro('Exportação indisponível: chave não configurada no servidor.', 503)
  }
  const recebida = req.headers.get('x-api-key') ?? ''
  if (!mesmaChave(recebida, esperada))
    return erro('Chave de API ausente ou inválida.', 401)

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const url = new URL(req.url)
    const equipes = lista(url.searchParams.get('equipe'))
    const status = lista(url.searchParams.get('status'))
    const solicitante = semAcento((url.searchParams.get('solicitante') ?? '').trim())
    const desdeTexto = url.searchParams.get('atualizado_desde')
    let desde: string | null = null
    if (desdeTexto) {
      const d = new Date(desdeTexto)
      if (Number.isNaN(d.getTime()))
        return erro('atualizado_desde precisa ser uma data ISO, ex.: 2026-09-01T00:00:00Z.')
      desde = d.toISOString()
    }

    // ---- solicitações ---------------------------------------------------
    // Campo a campo: é o que garante que dado sensível não vaze por descuido.
    let q = sb
      .from('solicitacoes')
      .select(
        'id, protocolo, status, equipe, equipe_outro, solicitante_nome, data_entrada, ' +
          'data_saida, modal, servicos, created_at, updated_at, ' +
          'edicoes!solicitacoes_edicao_id_fkey(destino, hotel), ' +
          'colaboradores(id, nome_completo, aprovacao, ordem)',
      )
      // A lixeira não é dado da operação: quem foi excluído não entra.
      .is('excluida_em', null)
      .order('created_at', { ascending: false })
      .limit(TETO)

    if (equipes.length) q = q.in('equipe', equipes)
    if (status.length) q = q.in('status', status)

    const { data: sols, error: eSol } = await q
    if (eSol) throw new Error(eSol.message)

    type Colab = { id: string; nome_completo: string; aprovacao: boolean | null; ordem: number }
    type Sol = {
      id: string
      protocolo: string
      status: string
      equipe: string
      equipe_outro: string | null
      solicitante_nome: string
      data_entrada: string
      data_saida: string
      modal: string | null
      servicos: string[] | null
      created_at: string
      updated_at: string
      edicoes: { destino: string; hotel: string } | null
      colaboradores: Colab[] | null
    }

    let linhas = (sols ?? []) as unknown as Sol[]

    // Nome do solicitante: sem acento e sem caixa, como as pessoas digitam.
    if (solicitante)
      linhas = linhas.filter((s) => semAcento(s.solicitante_nome ?? '').includes(solicitante))

    if (!linhas.length)
      return json({ gerado_em: new Date().toISOString(), total: 0, solicitacoes: [] })

    const idsSol = linhas.map((s) => s.id)
    const idsColab = linhas.flatMap((s) => (s.colaboradores ?? []).map((c) => c.id))

    // ---- dados relacionados ---------------------------------------------
    /**
     * Busca em lotes.
     *
     * `in(campo, [...])` vira query string, e com centenas de ids a URL passa
     * do tamanho aceito: a consulta falha e volta vazia. Foi exatamente isso
     * que deixou voo e rodoviário vazios em TODAS as pessoas — a lista inteira
     * de colaboradores ia de uma vez. Em lotes, cada URL é curta.
     *
     * E o erro agora sobe: falha silenciosa que vira lista vazia é pior do que
     * falha, porque a integração acha que a pessoa não tem voo.
     */
    const LOTE = 100
    async function emLotes<T>(tabela: string, colunas: string, campo: string, ids: string[]) {
      const unicos = [...new Set(ids)]
      const saida: T[] = []
      for (let i = 0; i < unicos.length; i += LOTE) {
        const { data, error } = await sb
          .from(tabela)
          .select(colunas)
          .in(campo, unicos.slice(i, i + LOTE))
        if (error) throw new Error(`${tabela}: ${error.message}`)
        saida.push(...((data ?? []) as T[]))
      }
      return saida
    }

    const [voos, rodo, van, carro, pedidos] = await Promise.all([
      emLotes<{ colaborador_id: string }>(
        'voos',
        'colaborador_id, trecho, companhia, numero_voo, aeroporto_origem, aeroporto_destino, ' +
          'partida_data, partida_hora, chegada_data, chegada_hora, localizador, updated_at',
        'colaborador_id',
        idsColab,
      ),
      emLotes<{ colaborador_id: string }>(
        'transporte_rodoviario',
        'colaborador_id, empresa, numero_onibus, apresentacao_data, apresentacao_hora, ' +
          'ida_data, ida_hora, local_embarque_ida, volta_data, volta_hora, ' +
          'local_embarque_volta, observacoes, updated_at',
        'colaborador_id',
        idsColab,
      ),
      emLotes<{ solicitacao_id: string }>(
        'locacao_van',
        'solicitacao_id, empresa, motorista, local_saida, saida_data, saida_hora, ' +
          'local_chegada, chegada_data, chegada_hora, qtd_passageiros, updated_at',
        'solicitacao_id',
        idsSol,
      ),
      emLotes<{ solicitacao_id: string }>(
        'locacao_carro',
        'solicitacao_id, condutor_colaborador_id, locadora, categoria, retirada_local, ' +
          'retirada_data, retirada_hora, devolucao_local, devolucao_data, devolucao_hora, ' +
          'codigo_reserva, observacoes, updated_at',
        'solicitacao_id',
        idsSol,
      ),
      emLotes<{ solicitacao_id: string }>(
        'solicitacao_carros',
        'solicitacao_id, condutor_nome, tipo_carro, transmissao, local_retirada, ' +
          'retirada_data, retirada_hora, devolucao_data, devolucao_hora, ordem',
        'solicitacao_id',
        idsSol,
      ),
    ])

    const porColaborador = <T extends { colaborador_id: string }>(dados: T[] | null) => {
      const m = new Map<string, T[]>()
      for (const x of dados ?? []) m.set(x.colaborador_id, [...(m.get(x.colaborador_id) ?? []), x])
      return m
    }
    const porSolicitacao = <T extends { solicitacao_id: string }>(dados: T[] | null) => {
      const m = new Map<string, T[]>()
      for (const x of dados ?? []) m.set(x.solicitacao_id, [...(m.get(x.solicitacao_id) ?? []), x])
      return m
    }

    const voosDe = porColaborador(voos)
    const rodoDe = porColaborador(rodo)
    const vanDe = porSolicitacao(van)
    const carroDe = porSolicitacao(carro)
    const pedidosDe = porSolicitacao(pedidos)

    // Quem dirige: a locação guarda o id do colaborador, e a integração
    // precisa do nome — é por ele que a escala identifica o condutor.
    const nomeDoColaborador = new Map(
      linhas.flatMap((x) => (x.colaboradores ?? []).map((c) => [c.id, c.nome_completo])),
    )

    const semChaves = <T extends Record<string, unknown>>(x: T, fora: string[]) => {
      const r: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(x)) if (!fora.includes(k)) r[k] = v
      return r
    }

    const saida = linhas.map((s) => {
      const pessoas = [...(s.colaboradores ?? [])].sort((a, b) => a.ordem - b.ordem)
      const meusVoos = pessoas.flatMap((c) => voosDe.get(c.id) ?? [])
      const meusRodo = pessoas.flatMap((c) => rodoDe.get(c.id) ?? [])
      const minhaVan = (vanDe.get(s.id) ?? [])[0] ?? null
      const meusCarros = carroDe.get(s.id) ?? []

      // Mudou o voo, o rodoviário, a van ou o carro: a solicitação mudou. É o
      // que a integração precisa para pedir só o que andou desde a última vez.
      const atualizado_em = maisRecente(
        s.updated_at,
        ...meusVoos.map((v) => (v as { updated_at?: string }).updated_at),
        ...meusRodo.map((r) => (r as { updated_at?: string }).updated_at),
        (minhaVan as { updated_at?: string } | null)?.updated_at,
        ...meusCarros.map((c) => (c as { updated_at?: string }).updated_at),
      )

      // Nome do condutor no lugar do id: o id não diz nada para quem lê a
      // escala, e o CPF do condutor não sai daqui.
      const carrosLimpos = meusCarros.map((c) => {
        const bruto = c as Record<string, unknown>
        return {
          condutor_nome:
            nomeDoColaborador.get(String(bruto.condutor_colaborador_id ?? '')) ?? null,
          ...semChaves(bruto, ['solicitacao_id', 'condutor_colaborador_id', 'updated_at']),
        }
      })

      return {
        protocolo: s.protocolo,
        status: s.status,
        equipe: s.equipe,
        equipe_outro: s.equipe_outro,
        solicitante_nome: s.solicitante_nome,
        destino: s.edicoes?.destino ?? null,
        hotel: s.edicoes?.hotel ?? null,
        data_entrada: s.data_entrada,
        data_saida: s.data_saida,
        modal: s.modal,
        servicos: (s.servicos ?? []).map((x) => x.toLowerCase()),
        criado_em: s.created_at,
        atualizado_em,
        pessoas: pessoas.map((c) => ({
          id: c.id,
          nome_completo: c.nome_completo,
          aprovacao: c.aprovacao,
          voos: (voosDe.get(c.id) ?? []).map((v) =>
            semChaves(v as Record<string, unknown>, ['colaborador_id', 'updated_at']),
          ),
          rodoviario: (rodoDe.get(c.id) ?? []).map((r) =>
            semChaves(r as Record<string, unknown>, ['colaborador_id', 'updated_at']),
          ),
        })),
        van: minhaVan
          ? semChaves(minhaVan as Record<string, unknown>, ['solicitacao_id', 'updated_at'])
          : null,
        // `carro` é a primeira locação, como a integração espera; `carros`
        // traz todas, porque hoje há uma locação por condutor.
        carro: carrosLimpos[0] ?? null,
        carros: carrosLimpos,
        carros_pedidos: (pedidosDe.get(s.id) ?? []).map((p) =>
          semChaves(p as Record<string, unknown>, ['solicitacao_id', 'ordem']),
        ),
      }
    })

    const filtrada = desde
      ? saida.filter((x) => (x.atualizado_em ?? x.criado_em) >= desde!)
      : saida

    return json({
      gerado_em: new Date().toISOString(),
      total: filtrada.length,
      solicitacoes: filtrada,
    })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
