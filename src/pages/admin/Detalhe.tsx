import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, invocar } from '../../lib/supabase'
import { useAdmin } from './AdminLayout'
import type {
  Aprovacao,
  Colaborador,
  Diretor,
  Edicao,
  Evento,
  HospedagemDetalhe,
  LocacaoCarro,
  LocacaoVan,
  Rodoviario,
  Solicitacao,
  Status,
  Voo,
} from '../../lib/types'
import {
  STATUS_CLASS,
  STATUS_LABEL,
  aeroportoLabel,
  TIPOS_CARRO,
  TIPOS_QUARTO,
  ALIMENTACAO,
  alimentacaoLabel,
  corServico,
  servicoCurto,
  tipoQuartoLabel,
  veiculosTexto,
  equipeLabel,
  nomeDestino,
} from '../../lib/constants'
import {
  cpfMascarado,
  dataBR,
  dataHoraBR,
  mascaraCpf,
  mascaraTelefone,
  moeda,
} from '../../lib/format'
import { Aviso, Botao, Campo, Card, Etiqueta, Input, Select, Textarea } from '../../components/ui'

type Cheia = Solicitacao & {
  edicoes: Edicao
  diretores: Diretor
  colaboradores: Colaborador[]
}

/** Uma reserva de carro como o solicitante pediu — sem preço nem locadora. */
type CarroPedido = {
  id: string
  condutor_nome: string
  condutor_cpf: string
  condutor_nascimento: string | null
  transmissao: string | null
  tipo_carro: string | null
  local_retirada: string | null
  retirada_data: string | null
  retirada_hora: string | null
  devolucao_data: string | null
  devolucao_hora: string | null
  ordem: number
}

/**
 * Data e hora em campos separados.
 *
 * Eram um `datetime-local` só, gravado em coluna com fuso — e o horário
 * digitado voltava deslocado, porque o texto do input não carrega fuso e o
 * banco o lia como UTC. Hora de voo é hora de relógio no aeroporto: guardar
 * como instante universal cria uma conversão que não deveria existir.
 *
 * Aqui não há conversão nenhuma: o que se digita é o que se grava.
 */
function DataHora<T extends Record<string, unknown>>({
  rotulo,
  valor,
  campoData,
  campoHora,
  editavel,
  onChange,
}: {
  rotulo: string
  valor: T
  campoData: keyof T
  campoHora: keyof T
  editavel: boolean
  onChange: (v: T) => void
}) {
  const texto = (k: keyof T) => {
    const v = valor[k]
    // O Postgres devolve "07:50:00"; o input de hora só aceita "07:50".
    return typeof v === 'string' ? v.slice(0, k === campoHora ? 5 : 10) : ''
  }
  return (
    <>
      <Campo label={`${rotulo} — data`} obrigatorio={false}>
        <Input
          type="date"
          disabled={!editavel}
          value={texto(campoData)}
          onChange={(e) => onChange({ ...valor, [campoData]: e.target.value || null })}
        />
      </Campo>
      <Campo label={`${rotulo} — horário`} obrigatorio={false}>
        <Input
          type="time"
          disabled={!editavel}
          value={texto(campoHora)}
          onChange={(e) => onChange({ ...valor, [campoHora]: e.target.value || null })}
        />
      </Campo>
    </>
  )
}

/** O que a `enviar-confirmacao` devolve: um resultado por canal. */
type Confirmacao = {
  destinatario?: string
  email?: string
  slack_solicitante?: string
  canal_operacao?: string
}

/**
 * Diz por onde o solicitante foi avisado — e por onde não foi.
 *
 * Sem isto, a tela dizia "confirmação enviada" mesmo quando só um dos
 * canais tinha funcionado, e a operação não sabia se precisava correr
 * atrás por fora.
 */
function resumoEnvio(r: Confirmacao, email: string) {
  const ok: string[] = []
  const falhou: string[] = []
  ;(r.email === 'enviado' ? ok : falhou).push(`e-mail (${email})`)
  ;(r.slack_solicitante?.startsWith('enviado') ? ok : falhou).push('Slack')

  const partes = [`${r.destinatario ?? email} avisado por ${ok.join(' e ')}.`]
  if (falhou.length)
    partes.push(
      `Não saiu por ${falhou.join(' e ')}: ${
        falhou[0].startsWith('e-mail') ? r.email : r.slack_solicitante
      }`,
    )
  return partes.join(' ')
}

/** "14:00:00" → "14h00". Vazio vira string vazia, não "—" solto na frase. */
const hora = (h?: string | null) => (h ? ` ${h.slice(0, 5).replace(':', 'h')}` : '')

const ABAS = ['Solicitação', 'Operacional', 'Aprovação', 'Histórico'] as const

export default function Detalhe() {
  const { id } = useParams()
  const admin = useAdmin()
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Solicitação')
  const [s, setS] = useState<Cheia | null>(null)
  const [voos, setVoos] = useState<Record<string, Partial<Voo>>>({})
  const [rodo, setRodo] = useState<Record<string, Partial<Rodoviario>>>({})
  const [hosp, setHosp] = useState<Record<string, Partial<HospedagemDetalhe>>>({})
  /** Endereço por hotel, para preencher o bloco de hospedagem sozinho. */
  const [hoteis, setHoteis] = useState<Map<string, string>>(new Map())
  const [carros, setCarros] = useState<Record<string, Partial<LocacaoCarro>>>({})
  const [van, setVan] = useState<Partial<LocacaoVan>>({})
  const [carrosPedidos, setCarrosPedidos] = useState<CarroPedido[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([])
  const [operacoes, setOperacoes] = useState<Edicao[]>([])
  const [equipe, setEquipe] = useState<{ id: string; nome: string; role: string }[]>([])
  const [responsaveis, setResponsaveis] = useState<string[]>([])
  const [cpfsVisiveis, setCpfsVisiveis] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(*), colaboradores(*)')
      .eq('id', id)
      .single()
    if (!data) return
    const sol = data as Cheia
    sol.colaboradores.sort((a, b) => a.ordem - b.ordem)
    setS(sol)

    const ids = sol.colaboradores.map((c) => c.id)
    const [v, r, h, l, vn, ev, ap, sc, ht] = await Promise.all([
      supabase.from('voos').select('*').in('colaborador_id', ids),
      supabase.from('transporte_rodoviario').select('*').in('colaborador_id', ids),
      supabase.from('hospedagem_detalhe').select('*').in('colaborador_id', ids),
      supabase.from('locacao_carro').select('*').eq('solicitacao_id', id),
      supabase.from('locacao_van').select('*').eq('solicitacao_id', id).maybeSingle(),
      supabase
        .from('eventos_solicitacao')
        .select('*')
        .eq('solicitacao_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('aprovacoes')
        .select('*')
        .eq('solicitacao_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('solicitacao_carros')
        .select('*')
        .eq('solicitacao_id', id)
        .order('ordem'),
      supabase.from('hoteis').select('chave, endereco'),
    ])

    const reservas = (sc.data ?? []) as CarroPedido[]
    setCarrosPedidos(reservas)

    // Catálogo de endereços por nome de hotel. Fica num Map porque a mesma
    // consulta serve para os N colaboradores da solicitação.
    const enderecos = new Map(
      ((ht.data ?? []) as { chave: string; endereco: string }[]).map((x) => [
        x.chave,
        x.endereco,
      ]),
    )
    setHoteis(enderecos)


    // Operações cobertas por esta solicitação (pode ser mais de uma).
    const { data: ops } = await supabase
      .from('solicitacao_edicoes')
      .select('edicoes(*)')
      .eq('solicitacao_id', id)
    setOperacoes(
      ((ops ?? []) as unknown as { edicoes: Edicao }[])
        .map((o) => o.edicoes)
        .filter(Boolean)
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
    )
    const mv: Record<string, Partial<Voo>> = {}
    ;(v.data ?? []).forEach((x: Voo) => (mv[`${x.colaborador_id}:${x.trecho}`] = x))
    // Voo ainda não preenchido já chega com a data que o solicitante pediu.
    // A operação completa a hora e o resto — não redigita o dia.
    // Só o trecho que foi pedido: quem pediu só ida não ganha uma volta.
    const trechos: ('IDA' | 'VOLTA')[] =
      sol.tipo_voo === 'IDA' ? ['IDA'] : sol.tipo_voo === 'VOLTA' ? ['VOLTA'] : ['IDA', 'VOLTA']
    sol.colaboradores.forEach((c) => {
      for (const t of trechos) {
        const chave = `${c.id}:${t}`
        if (mv[chave]) continue
        const dia = t === 'IDA' ? sol.voo_data_ida : sol.voo_data_volta
        // A DATA vem do que o solicitante pediu; a HORA fica em branco,
        // porque é a operação que descobre isso ao fechar o voo. Antes vinha
        // 00:00 e parecia um horário já definido.
        mv[chave] = {
          colaborador_id: c.id,
          trecho: t,
          aeroporto_origem: t === 'IDA' ? sol.aeroporto_saida : sol.aeroporto_saida_volta,
          aeroporto_destino: t === 'IDA' ? sol.aeroporto_chegada : sol.aeroporto_chegada_volta,
          partida_data: dia,
          chegada_data: dia,
        }
      }
    })
    setVoos(mv)

    const mr: Record<string, Partial<Rodoviario>> = {}
    ;(r.data ?? []).forEach((x: Rodoviario) => (mr[x.colaborador_id] = x))
    // Mesma ideia no rodoviário: o dia vem da estadia pedida.
    sol.colaboradores.forEach((c) => {
      if (!mr[c.id])
        mr[c.id] = {
          colaborador_id: c.id,
          ida_data: sol.data_entrada,
          volta_data: sol.data_saida,
        }
    })
    setRodo(mr)
    // A chave passa a ser pessoa + tipo: quem pede as duas hospedagens tem
    // duas estadias, com hotéis, datas e reservas diferentes.
    const mh: Record<string, Partial<HospedagemDetalhe>> = {}
    ;(h.data ?? []).forEach(
      (x: HospedagemDetalhe) => (mh[`${x.colaborador_id}:${x.tipo ?? 'HOTEL_PAX'}`] = x),
    )
    // Colaborador ainda sem hospedagem cadastrada já vem com as datas que o
    // solicitante pediu — a operação só confirma ou ajusta, não redigita.
    // Fora do hotel do pax, o tipo de quarto e a alimentação também vêm do
    // pedido — a operação confirma, não redigita.
    const tiposPedidos = tiposHospedagem(sol)
    sol.colaboradores.forEach((c) => {
      tiposPedidos.forEach((tipo) => {
        const chave = `${c.id}:${tipo}`
        const fora = tipo === 'FORA_HOTEL_PAX'
        if (!mh[chave])
          mh[chave] = {
            colaborador_id: c.id,
            tipo,
            // O hotel da operação só serve de padrão para a estadia da
            // operação. Na de fora, quem escolhe o hotel é quem reserva.
            hotel: fora ? null : (sol.edicoes?.hotel ?? null),
            check_in: sol.data_entrada,
            check_out: sol.data_saida,
            ...(fora
              ? {
                  tipo_quarto: sol.hosp_tipo_quarto,
                  alimentacao: sol.hosp_alimentacao,
                }
              : {}),
          }
        // O endereço vem do catálogo, mas só onde ainda está vazio: quem já
        // digitou alguma coisa aqui sabia o que estava fazendo, e sobrescrever
        // seria trocar o dado bom pelo genérico.
        const linha = mh[chave]
        if (!linha.endereco?.trim()) {
          const nome = linha.hotel_hospedagem?.trim() || linha.hotel?.trim()
          const achado = nome ? enderecos.get(chaveHotel(nome)) : undefined
          if (achado) linha.endereco = achado
        }
      })
    })
    setHosp(mh)

    // Carro: uma locação por condutor pedido. Antes era uma só para a
    // solicitação inteira, então quatro condutores dividiam uma locadora, uma
    // diária e um preço — e o custo saía errado por construção.
    //
    // As datas vêm do que o solicitante pediu para AQUELE carro: ele diz
    // quando pega e devolve, e cada condutor pode ter período diferente.
    const mc: Record<string, Partial<LocacaoCarro>> = {}
    ;(l.data ?? []).forEach((x: LocacaoCarro) => {
      if (x.pedido_id) mc[x.pedido_id] = x
    })
    reservas.forEach((r) => {
      if (!mc[r.id])
        mc[r.id] = {
          pedido_id: r.id,
          retirada_data: r.retirada_data ?? sol.data_entrada,
          retirada_hora: r.retirada_hora ?? null,
          devolucao_data: r.devolucao_data ?? sol.data_saida,
          devolucao_hora: r.devolucao_hora ?? null,
          retirada_local: r.local_retirada ?? null,
          categoria: r.tipo_carro ?? null,
        }
    })
    setCarros(mc)
    // A van chega com a data e a hora que o solicitante informou — antes só
    // vinha o dia da estadia, e a hora ficava zerada para alguém perguntar.
    setVan(
      (vn.data as LocacaoVan) ?? {
        saida_data: sol.van_data_saida ?? sol.data_entrada,
        saida_hora: sol.van_hora_saida,
        chegada_data: sol.van_retorno_data ?? sol.data_saida,
        chegada_hora: sol.van_retorno_hora,
        local_saida: sol.van_local_saida,
        local_chegada: sol.van_destino,
        qtd_passageiros: sol.van_qtd_passageiros,
      },
    )

    const [eq, rp] = await Promise.all([
      supabase.from('v_equipe').select('id, nome, role'),
      supabase.from('solicitacao_responsaveis').select('admin_id').eq('solicitacao_id', id),
    ])
    setEquipe((eq.data ?? []) as { id: string; nome: string; role: string }[])
    setResponsaveis(((rp.data ?? []) as { admin_id: string }[]).map((r) => r.admin_id))
    setEventos((ev.data ?? []) as Evento[])
    setAprovacoes((ap.data ?? []) as Aprovacao[])
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function registrarEvento(tipo: string, descricao: string, payload?: unknown) {
    await supabase.from('eventos_solicitacao').insert({
      solicitacao_id: id,
      tipo,
      autor_id: admin?.id ?? null,
      autor_nome: admin?.nome ?? null,
      descricao,
      payload: payload ?? null,
    })
  }

  /**
   * Abre uma rodada de aprovação e avisa o diretor.
   *
   * `escopo` vazio significa a solicitação inteira. Com uma lista, só aqueles
   * serviços vão para o martelo — é o caso de mandar o aéreo emitir enquanto
   * a locadora ainda não devolveu a cotação do carro.
   *
   * A ordem importa: primeiro o banco, depois o aviso. Se o Slack falhar, a
   * solicitação já está na área do diretor e ele resolve; se fosse ao
   * contrário, o aviso chegaria para algo que não está lá.
   */
  async function enviarAprovacao(escopo?: string[]) {
    if (!s) return
    setSalvando(true)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('enviar_para_aprovacao', {
        p_solicitacao: s.id,
        p_escopo: escopo?.length ? escopo : null,
      })
      if (error) throw new Error(error.message)

      const oque = escopo?.length
        ? escopo.map(servicoCurto).join(', ')
        : 'a solicitação completa'
      try {
        const r = await invocar<{ canais?: string }>('notificar-slack', {
          solicitacao_id: s.id,
        })
        setMsg({
          tom: 'sucesso',
          texto: `Enviado para ${s.diretores.nome} (${oque}) e avisado por ${r.canais ?? 'Slack'}.`,
        })
      } catch (e) {
        setMsg({
          tom: 'erro',
          texto:
            `Enviado — ${oque} já aparece para ${s.diretores.nome} aprovar. ` +
            `Mas o aviso automático não saiu: ${e instanceof Error ? e.message : 'falha'} ` +
            '— avise por outro canal enquanto isso.',
        })
      }
      carregar()
    } catch (e) {
      setMsg({ tom: 'erro', texto: e instanceof Error ? e.message : 'Falha ao enviar' })
    } finally {
      setSalvando(false)
    }
  }

  /**
   * Muda o status e, quando o novo status é CONCLUIDA, avisa o solicitante.
   *
   * O aviso mora aqui, e não no botão, de propósito: concluir é concluir por
   * qualquer caminho, e quem pediu tem que ficar sabendo em todos eles. Havia
   * um botão "Concluir sem avisar" que deixava a pessoa no escuro justamente
   * no momento em que ela mais precisa da informação.
   */
  async function mudarStatus(novo: Status, descricao: string) {
    const { error } = await supabase
      .from('solicitacoes')
      .update({ status: novo, responsavel_id: admin?.id ?? null })
      .eq('id', id)
    if (error) return setMsg({ tom: 'erro', texto: error.message })
    await registrarEvento('STATUS', descricao, { status: novo })

    if (novo === 'CONCLUIDA') {
      try {
        const r = await invocar<Confirmacao>('enviar-confirmacao', {
          solicitacao_id: id,
        })
        setMsg({ tom: 'sucesso', texto: resumoEnvio(r, s?.solicitante_email ?? '') })
      } catch (e) {
        // A conclusão vale de qualquer forma — o que falhou foi o aviso. Dizer
        // isso por extenso é o que faz alguém correr atrás por outro canal.
        setMsg({
          tom: 'erro',
          texto:
            `Solicitação concluída, mas o aviso ao solicitante não saiu: ` +
            `${e instanceof Error ? e.message : 'falha'} — avise ${s?.solicitante_email ?? 'quem pediu'} por outro canal.`,
        })
      }
    } else {
      setMsg({ tom: 'sucesso', texto: descricao })
    }
    carregar()
  }

  async function salvarOperacional() {
    if (!s) return
    setSalvando(true)
    setMsg(null)
    try {
      const upVoos = Object.entries(voos)
        .filter(([, v]) => v && Object.keys(v).length > 0)
        .map(([k, v]) => {
          const [colaborador_id, trecho] = k.split(':')
          const { id: _ignorado, ...resto } = v as Voo
          return { ...limpar(resto), colaborador_id, trecho }
        })
      if (upVoos.length)
        await erro(
          supabase.from('voos').upsert(upVoos, { onConflict: 'colaborador_id,trecho' }),
        )

      const upRodo = Object.entries(rodo)
        .filter(([, v]) => v && Object.keys(v).length > 0)
        .map(([colaborador_id, v]) => {
          const { id: _i, ...resto } = v as Rodoviario
          return { ...limpar(resto), colaborador_id }
        })
      if (upRodo.length)
        await erro(
          supabase
            .from('transporte_rodoviario')
            .upsert(upRodo, { onConflict: 'colaborador_id' }),
        )

      const upHosp = Object.entries(hosp)
        .filter(([, v]) => v && Object.keys(v).length > 0)
        .map(([chave, v]) => {
          const [colaborador_id, tipo] = chave.split(':')
          const { id: _i, ...resto } = v as HospedagemDetalhe
          return { ...limpar(resto), colaborador_id, tipo }
        })
      if (upHosp.length)
        await erro(
          supabase
            .from('hospedagem_detalhe')
            .upsert(upHosp, { onConflict: 'colaborador_id,tipo' }),
        )

      const upCarros = Object.entries(carros)
        .filter(([, v]) => v && Object.keys(v).length > 0)
        .map(([pedido_id, v]) => {
          const { id: _i, ...resto } = v as LocacaoCarro
          return { ...limpar(resto), pedido_id, solicitacao_id: s.id }
        })
      if (tem(s, 'CARRO') && upCarros.length)
        await erro(
          supabase.from('locacao_carro').upsert(upCarros, { onConflict: 'pedido_id' }),
        )

      if (tem(s, 'VAN') && Object.keys(van).length) {
        const { id: _i, ...resto } = van as LocacaoVan
        await erro(
          supabase
            .from('locacao_van')
            .upsert({ ...limpar(resto), solicitacao_id: s.id }, {
              onConflict: 'solicitacao_id',
            }),
        )
      }

      // Recalcula o custo total no banco. Se a RPC falhar, `custo` viria
      // null e apagaria o total que já estava lá — por isso o erro sobe em
      // vez de ser gravado.
      const { data: custo, error: eCusto } = await supabase.rpc('recalcular_custo', {
        p_solicitacao: s.id,
      })
      if (eCusto) throw new Error(`Não consegui recalcular o custo: ${eCusto.message}`)
      await erro(
        supabase.from('solicitacoes').update({ custo_total: custo ?? 0 }).eq('id', s.id),
      )

      await registrarEvento('EDICAO', 'Dados operacionais atualizados')
      if (s.status === 'RECEBIDA')
        await supabase
          .from('solicitacoes')
          .update({ status: 'EM_PREENCHIMENTO', responsavel_id: admin?.id ?? null })
          .eq('id', s.id)

      setMsg({ tom: 'sucesso', texto: 'Dados salvos.' })
      carregar()
    } catch (e) {
      setMsg({ tom: 'erro', texto: e instanceof Error ? e.message : 'Erro ao salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  /** Atribui ou remove alguém da operação. Grava na hora, sem botão salvar. */
  async function alternarResponsavel(adminId: string) {
    const marcado = responsaveis.includes(adminId)
    setResponsaveis((r) => (marcado ? r.filter((x) => x !== adminId) : [...r, adminId]))

    const nome = equipe.find((u) => u.id === adminId)?.nome ?? 'alguém'
    const { error } = marcado
      ? await supabase
          .from('solicitacao_responsaveis')
          .delete()
          .eq('solicitacao_id', id)
          .eq('admin_id', adminId)
      : await supabase
          .from('solicitacao_responsaveis')
          .insert({ solicitacao_id: id, admin_id: adminId })

    if (error) {
      setMsg({ tom: 'erro', texto: error.message })
      carregar()
      return
    }
    registrarEvento(
      'RESPONSAVEL',
      marcado ? `${nome} saiu dos responsáveis` : `${nome} assumiu esta solicitação`,
    )
  }

  function revelarCpf(cid: string) {
    setCpfsVisiveis((p) => new Set(p).add(cid))
    registrarEvento('CPF_REVELADO', 'CPF visualizado no painel', { colaborador_id: cid })
  }

  if (!s)
    return <p className="py-16 text-center text-sm text-neutral-500">Carregando…</p>

  /**
   * O que a operação pode editar.
   *
   * Aprovada e concluída deixaram de ser trancas: passagem tem prazo de
   * emissão, e quando a reserva cai porque a aprovação demorou, quem refaz é
   * o time de emissão inteiro — não só o super admin. Esperar por uma pessoa
   * só era o gargalo.
   *
   * Duas coisas seguram a corda no lugar da tranca: a tela avisa em vermelho
   * que aquilo já foi decidido, e o banco marca a solicitação como alterada
   * até que ela volte para o diretor.
   *
   * CANCELADA continua fechada para todos menos o super admin. Cancelada não
   * é "esperando ajuste", é encerrada — reabrir é decisão, não correção.
   */
  const cancelada = s.status === 'CANCELADA'
  const decidida = ['APROVADA', 'CONCLUIDA'].includes(s.status)
  const emAprovacao = s.status === 'AGUARDANDO_APROVACAO'
  // Sem exceção: qualquer pessoa da operação edita qualquer solicitação, em
  // qualquer status. As travas por status ficavam no caminho justamente quando
  // havia pressa — reserva que caiu, data errada indo para a locadora.
  const podeEditar = true
  /** Está mexendo em algo que o diretor já decidiu — merece aviso na tela. */
  const editandoTravada = podeEditar && (decidida || emAprovacao || cancelada)
  const custo = s.custo_total_manual ?? s.custo_total

  /**
   * Quanto já está lançado em cada serviço, pelo que está na tela agora.
   *
   * Serve para o botão de aprovação parcial dizer o que está mandando para o
   * diretor. Um serviço em R$ 0,00 quase sempre significa "ainda não cotado" —
   * que é exatamente o que não se deve mandar aprovar.
   */
  const soma = (ns: (number | null | undefined)[]) =>
    ns.reduce<number>((t, n) => t + Number(n ?? 0), 0)

  /** Soma só as hospedagens de um tipo — as duas são serviços separados. */
  const somaHosp = (tipo: string) =>
    soma(
      Object.entries(hosp)
        .filter(([chave]) => chave.endsWith(`:${tipo}`))
        .map(([, h]) => h.valor_total),
    )

  const totalPorServico: Record<string, number> = {
    AEREO: soma(Object.values(voos).map((v) => v.preco)),
    RODOVIARIO: soma(Object.values(rodo).map((r) => r.preco)),
    HOSPEDAGEM: somaHosp('HOTEL_PAX'),
    HOSPEDAGEM_FORA: somaHosp('FORA_HOTEL_PAX'),
    // Uma locação por condutor: somar só a primeira esconderia as outras.
    CARRO: soma(Object.values(carros).map((c) => c.preco)),
    VAN: Number(van.preco ?? 0),
  }

  const aprovados = s.servicos_aprovados ?? []
  const aguardando = s.status === 'AGUARDANDO_APROVACAO'
  /**
   * Escopo da rodada aberta. Solicitações enviadas antes da aprovação parcial
   * não têm escopo gravado — e naquele tempo enviar era sempre enviar tudo.
   * Sem este `??`, elas apareceriam com todos os serviços "fora da rodada".
   */
  const emRodada = s.escopo_aprovacao ?? (aguardando ? s.servicos : [])
  /** Faltam serviços para o diretor bater o martelo. */
  const pendentes = s.servicos.filter((x) => !aprovados.includes(x))
  /**
   * Depois de aprovada, abrir rodada nova é privilégio do super admin — a
   * mesma pessoa que pode editar. O banco também barra; aqui é só para não
   * mostrar um botão que vai dar erro.
   */
  /**
   * Serviço já aprovado não se edita — vale a mesma regra da solicitação
   * inteira, só que na granularidade que a aprovação parcial criou. Sem isto,
   * aprovar o aéreo e depois mexer nele passaria por cima do diretor.
   */
  /**
   * Serviço já aprovado também abre para a operação — é nele que a tarifa
   * vencida precisa ser trocada. O que não pode é a troca valer sem novo
   * martelo, e disso cuida a marca de alteração + o reenvio.
   */
  const podeEditarServico = (_sv: string) => podeEditar

  /** Reenviar deixou de ser exclusivo do super admin. */
  const podeEnviar = !aguardando && !cancelada

  return (
    <div className="space-y-4">
      <Link to="/admin" className="text-xs text-neutral-500 hover:underline">
        ← Voltar para a lista
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-lg font-bold text-neutral-900">{s.protocolo}</h1>
            <Etiqueta className={STATUS_CLASS[s.status]}>{STATUS_LABEL[s.status]}</Etiqueta>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {s.edicoes.avulsa ? nomeDestino(s) : `${s.edicoes.destino} — ${s.edicoes.hotel}`} ·{' '}
            {dataBR(s.data_entrada)} a{' '}
            {dataBR(s.data_saida)} · {s.colaboradores.length} pax ·{' '}
            {equipeLabel(s.equipe, s.equipe_outro)}
            {operacoes.length > 1 && (
              <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-semibold text-white">
                {operacoes.length} operações
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Custo total</p>
          <p className="text-lg font-bold text-neutral-800">{moeda(custo)}</p>
        </div>
      </header>

      {/* Ações de fluxo */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {s.status === 'RECEBIDA' && (
            <Botao onClick={() => mudarStatus('EM_PREENCHIMENTO', 'Solicitação assumida pela operação')}>
              Assumir solicitação
            </Botao>
          )}
          {podeEnviar && (
            <Botao onClick={() => enviarAprovacao()} carregando={salvando}>
              Enviar tudo para aprovação ({s.diretores.nome})
            </Botao>
          )}
          {s.status === 'AGUARDANDO_APROVACAO' && (
            <>
              <Botao
                variante="secundario"
                carregando={salvando}
                onClick={async () => {
                  setSalvando(true)
                  try {
                    await invocar('notificar-slack', { solicitacao_id: s.id })
                    await registrarEvento(
                      'SLACK_REENVIO',
                      `Aviso reenviado no Slack para ${s.diretores.nome}`,
                    )
                    setMsg({ tom: 'sucesso', texto: 'Aviso reenviado no Slack.' })
                    carregar()
                  } catch (e) {
                    setMsg({
                      tom: 'erro',
                      texto: e instanceof Error ? e.message : 'Falha no Slack',
                    })
                  } finally {
                    setSalvando(false)
                  }
                }}
              >
                Reenviar aviso no Slack
              </Botao>
              <Botao
                variante="secundario"
                onClick={() =>
                  mudarStatus('EM_PREENCHIMENTO', 'Reaberta para ajustes pela operação')
                }
              >
                Reabrir para edição
              </Botao>
            </>
          )}
          {s.status === 'APROVADA' && (
            <Botao
              onClick={async () => {
                setSalvando(true)
                // O aviso ao solicitante vive dentro de `mudarStatus`, para
                // valer em qualquer caminho que leve a CONCLUIDA.
                await mudarStatus('CONCLUIDA', 'Solicitação concluída')
                setSalvando(false)
              }}
              carregando={salvando}
            >
              Concluir e avisar o solicitante
            </Botao>
          )}
          {s.status === 'CONCLUIDA' && (
            <Botao
              variante="secundario"
              carregando={salvando}
              onClick={async () => {
                setSalvando(true)
                try {
                  const r = await invocar<Confirmacao>('enviar-confirmacao', {
                    solicitacao_id: s.id,
                  })
                  setMsg({ tom: 'sucesso', texto: resumoEnvio(r, s.solicitante_email) })
                } catch (e) {
                  setMsg({
                    tom: 'erro',
                    texto: e instanceof Error ? e.message : 'Falha ao avisar o solicitante',
                  })
                } finally {
                  setSalvando(false)
                }
              }}
            >
              Reenviar confirmação ao solicitante
            </Botao>
          )}
          {s.status === 'REPROVADA' && (
            <Botao
              variante="secundario"
              onClick={() => mudarStatus('EM_PREENCHIMENTO', 'Reaberta após reprovação')}
            >
              Reabrir para ajustes
            </Botao>
          )}
          {!['CONCLUIDA', 'CANCELADA'].includes(s.status) && (
            <Botao
              variante="perigo"
              onClick={() => {
                const motivo = prompt('Motivo do cancelamento:')
                if (motivo) mudarStatus('CANCELADA', `Cancelada: ${motivo}`)
              }}
            >
              Cancelar
            </Botao>
          )}
        </div>
        {!podeEditar && s.status === 'AGUARDANDO_APROVACAO' && (
          <p className="mt-3 text-xs text-neutral-700">
            Solicitação travada durante a aprovação. Para alterar, reabra para edição.
          </p>
        )}
      </Card>

      {/* Aprovação serviço a serviço.
          Existe porque nem tudo fica pronto ao mesmo tempo: o aéreo costuma ter
          preço antes do carro, e a emissão não pode esperar a locadora. Só
          aparece quando há mais de um serviço — com um só, o botão de cima já
          é a mesma coisa. */}
      {s.servicos.length > 1 && (
        <Card
          titulo="Aprovação por serviço"
          descricao={
            aguardando
              ? `Aguardando ${s.diretores.nome} decidir sobre ${emRodada.map(servicoCurto).join(', ') || 'a solicitação'}.`
              : 'Mande para o diretor só o que já está cotado. O resto continua editável e vai numa próxima rodada.'
          }
        >
          <div className="space-y-2">
            {s.servicos.map((sv) => {
              const jaAprovado = aprovados.includes(sv)
              const naRodada = aguardando && emRodada.includes(sv)
              const valor = totalPorServico[sv] ?? 0
              return (
                <div
                  key={sv}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <Etiqueta className={corServico(sv)}>{servicoCurto(sv)}</Etiqueta>
                    <span className="text-sm text-neutral-700">{moeda(valor)}</span>
                    {valor === 0 && !jaAprovado && (
                      <span className="text-xs text-amber-700">sem valor lançado</span>
                    )}
                  </div>
                  {jaAprovado ? (
                    <span className="text-xs font-semibold text-emerald-700">
                      ✓ aprovado por {s.diretores.nome.split(' ')[0]}
                    </span>
                  ) : naRodada ? (
                    <span className="text-xs font-semibold text-amber-700">
                      aguardando decisão
                    </span>
                  ) : aguardando ? (
                    <span className="text-xs text-neutral-500">
                      fora da rodada em curso
                    </span>
                  ) : podeEnviar ? (
                    <Botao
                      variante="secundario"
                      carregando={salvando}
                      onClick={() => enviarAprovacao([sv])}
                    >
                      Enviar {servicoCurto(sv).toLowerCase()} para aprovação
                    </Botao>
                  ) : null}
                </div>
              )
            })}
          </div>

          {aprovados.length > 0 && pendentes.length > 0 && !aguardando && (
            <p className="mt-3 text-xs text-neutral-600">
              Falta aprovar: <strong>{pendentes.map(servicoCurto).join(', ')}</strong>. A
              solicitação só fica <strong>Aprovada</strong> quando o diretor decidir sobre
              todos os serviços.
            </p>
          )}
        </Card>
      )}

      {/* Quem da operação está cuidando. Mais de uma pessoa é o normal:
          uma cuida do aéreo, outra do hotel, outra do transfer. */}
      <Card
        titulo="Responsáveis da operação"
        descricao="Marque quem está preenchendo esta solicitação."
      >
        <div className="flex flex-wrap gap-2">
          {equipe.map((u) => {
            const marcado = responsaveis.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={marcado}
                onClick={() => alternarResponsavel(u.id)}
                className={
                  'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ' +
                  (marcado
                    ? 'bg-marca-400 text-neutral-900 ring-marca-500'
                    : 'bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-50')
                }
              >
                {marcado ? '✓ ' : ''}
                {u.nome}
              </button>
            )
          })}
          {equipe.length === 0 && (
            <span className="text-sm text-neutral-500">Carregando equipe…</span>
          )}
        </div>
      </Card>

      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}

      {/* Abas */}
      <div className="flex gap-1 border-b border-neutral-200">
        {ABAS.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={
              'border-b-2 px-3.5 py-2 text-sm font-medium transition ' +
              (aba === a
                ? 'border-marca-500 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700')
            }
          >
            {a}
          </button>
        ))}
      </div>

      {/* ---------- ABA SOLICITAÇÃO ---------- */}
      {aba === 'Solicitação' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card titulo="Pedido">
            <dl className="divide-y divide-neutral-100 text-sm">
              <L t="Destino">
                {s.edicoes.avulsa ? (
                  <>
                    Outras operações
                    <br />
                    <span className="font-medium text-neutral-800">
                      Centro de custo: {s.centro_custo ?? '—'}
                    </span>
                  </>
                ) : (
                  `${s.edicoes.destino} — ${s.edicoes.hotel}`
                )}
              </L>
              <L
                t={
                  operacoes.length > 1
                    ? `Operações (${operacoes.length})`
                    : 'Datas da operação'
                }
              >
                {operacoes.length > 0 ? (
                  <ul className="space-y-0.5">
                    {operacoes.map((o) => (
                      <li key={o.id}>
                        {dataBR(o.data_inicio)} a {dataBR(o.data_fim)}
                        <span className="ml-1.5 text-xs text-neutral-500">
                          {o.codigo}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  `${dataBR(s.edicoes.data_inicio)} a ${dataBR(s.edicoes.data_fim)}`
                )}
              </L>
              <L t="Estadia solicitada">
                {dataBR(s.data_entrada)} a {dataBR(s.data_saida)}
              </L>
              <L t="Serviços pedidos">
                <div className="flex flex-wrap gap-1">
                  {(s.servicos ?? []).map((sv) => (
                    <span
                      key={sv}
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${corServico(sv)}`}
                    >
                      {sv}
                    </span>
                  ))}
                </div>
              </L>
              <L t="Tipo de hospedagem">
                {s.tipo_hospedagem === 'HOTEL_PAX' ? 'Hotel do pax' : 'Fora do hotel do pax'}
                {s.tipo_hospedagem === 'FORA_HOTEL_PAX' && (
                  <>
                    <br />
                    {s.hosp_externa_operacao
                      ? 'A operação precisa reservar'
                      : 'Já resolvido pelo solicitante'}
                    {s.hosp_qtd_quartos && (
                      <span className="mt-1 block font-medium text-neutral-800">
                        {s.hosp_qtd_quartos} quarto{s.hosp_qtd_quartos === 1 ? '' : 's'}{' '}
                        {tipoQuartoLabel(s.hosp_tipo_quarto).toLowerCase()} ·{' '}
                        {alimentacaoLabel(s.hosp_alimentacao).toLowerCase()}
                      </span>
                    )}
                    {s.hosp_externa_obs && (
                      <span className="mt-1 block whitespace-pre-wrap text-neutral-600">
                        {s.hosp_externa_obs}
                      </span>
                    )}
                  </>
                )}
              </L>
              <L t="Equipe">{equipeLabel(s.equipe, s.equipe_outro)}</L>
              <L t="Transporte">
                {[
                  tem(s, 'AEREO') && 'Aéreo',
                  tem(s, 'RODOVIARIO') && 'Rodoviário',
                  tem(s, 'VAN') && 'Van',
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Não solicitado'}
              </L>
              {tem(s, 'AEREO') && (
                <>
                  <L t="Aeroporto saída">{aeroportoLabel(s.aeroporto_saida)}</L>
                  <L t="Aeroporto chegada">{aeroportoLabel(s.aeroporto_chegada)}</L>
                  <L t="Bagagem despachada">
                    {s.precisa_bagagem === null
                      ? '—'
                      : s.precisa_bagagem
                        ? 'Sim'
                        : 'Não, só bagagem de mão'}
                  </L>
                </>
              )}
              <L t="Obs. transporte">
                <span className="whitespace-pre-wrap">{s.obs_transporte}</span>
              </L>
              {tem(s, 'VAN') && (
                <L t="Van ou ônibus solicitado">
                  <span className="font-medium text-neutral-800">
                    {veiculosTexto(s.van_qtd_veiculos, s.van_tipo_veiculo)} ·{' '}
                    {s.van_qtd_passageiros
                      ? `${s.van_qtd_passageiros} passageiro(s)`
                      : 'passageiros a definir'}
                  </span>
                  <br />
                  Ida: {dataBR(s.van_data_saida ?? undefined)}
                  {hora(s.van_hora_saida)} · saída de {s.van_local_saida}
                  <br />
                  Destino: {s.van_destino}
                  <br />
                  Retorno: {dataBR(s.van_retorno_data ?? undefined)}
                  {hora(s.van_retorno_hora)} · de {s.van_retorno_local} para{' '}
                  {s.van_retorno_destino}
                </L>
              )}
              <L t="Locação de carro">
                {tem(s, 'CARRO') ? (
                  <>
                    Condutor: {s.carro_condutor_nome} ·{' '}
                    <span className="font-mono">
                      {s.carro_condutor_cpf ? mascaraCpf(s.carro_condutor_cpf) : '—'}
                    </span>
                    <br />
                    Câmbio:{' '}
                    {s.carro_transmissao === 'AUTOMATICO' ? 'Automático' : 'Manual'}
                    <br />
                    <span className="whitespace-pre-wrap text-neutral-600">
                      {s.obs_locacao_carro ?? ''}
                    </span>
                  </>
                ) : (
                  'Não'
                )}
              </L>
            </dl>
          </Card>

          <div className="space-y-4">
            <Card titulo="Solicitante">
              <dl className="divide-y divide-neutral-100 text-sm">
                <L t="Nome">{s.solicitante_nome}</L>
                <L t="E-mail">
                  <a href={`mailto:${s.solicitante_email}`} className="text-neutral-700 hover:underline">
                    {s.solicitante_email}
                  </a>
                </L>
                <L t="WhatsApp">
                  <a
                    href={`https://wa.me/55${s.solicitante_whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-700 hover:underline"
                  >
                    {mascaraTelefone(s.solicitante_whatsapp)}
                  </a>
                </L>
                <L t="Diretor aprovador">{s.diretores.nome}</L>
                <L t="Enviada em">{dataHoraBR(s.created_at)}</L>
              </dl>
            </Card>

            <Card titulo={`Colaboradores (${s.colaboradores.length})`}>
              <ul className="divide-y divide-neutral-100 text-sm">
                {s.colaboradores.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="font-medium text-neutral-800">{c.nome_completo}</p>
                      <p className="text-xs text-neutral-500">
                        Nasc. {dataBR(c.data_nascimento)} · CPF{' '}
                        <span className="font-mono">
                          {cpfsVisiveis.has(c.id) ? mascaraCpf(c.cpf) : cpfMascarado(c.cpf)}
                        </span>
                      </p>
                    </div>
                    {!cpfsVisiveis.has(c.id) && (
                      <button
                        onClick={() => revelarCpf(c.id)}
                        className="shrink-0 text-xs font-medium text-neutral-700 hover:underline"
                      >
                        revelar CPF
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-neutral-400">
                Toda visualização de CPF fica registrada no histórico.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ---------- ABA OPERACIONAL ---------- */}
      {aba === 'Operacional' && (
        <div className="space-y-4">
          {editandoTravada && (
            <Aviso tom="destaque">
              Esta solicitação está <strong>{STATUS_LABEL[s.status].toLowerCase()}</strong>.
              Você pode editar — é assim que se refaz uma reserva que caiu por prazo
              de emissão — mas <strong>o que mudar aqui não está aprovado</strong>:{' '}
              {s.diretores.nome} decidiu sobre os valores anteriores. Depois de salvar,
              reenvie para aprovação.
            </Aviso>
          )}
          {/* A marca vem do banco, posta por trigger em qualquer tabela que a
              operação salve. Ela some sozinha quando a solicitação volta para
              o diretor — enquanto estiver aqui, há alteração sem martelo. */}
          {s.alterada_apos_aprovacao && (
            <Aviso tom="erro">
              <strong>Alterada depois de aprovada.</strong> Os dados desta solicitação
              mudaram depois da decisão de {s.diretores.nome}. Reenvie para aprovação —
              total ou só do serviço que você mexeu — para o novo valor valer.
            </Aviso>
          )}
          {/* Reserva por quarto: a solicitação pode ter chegado sem ninguém
              na lista. Os blocos por pessoa somem, então o que a operação
              precisa para reservar tem que aparecer aqui. */}
          {s.hosp_qtd_quartos != null && (
            <Card titulo="Hospedagem a reservar">
              <dl className="divide-y divide-neutral-100 text-sm">
                <L t="Quartos">
                  <span className="text-base font-bold text-neutral-900">
                    {s.hosp_qtd_quartos}
                  </span>{' '}
                  {tipoQuartoLabel(s.hosp_tipo_quarto).toLowerCase()}
                </L>
                <L t="Alimentação">{alimentacaoLabel(s.hosp_alimentacao)}</L>
                <L t="Período">
                  {dataBR(s.data_entrada)} a {dataBR(s.data_saida)}
                </L>
                {s.hosp_externa_obs && (
                  <L t="Observações">
                    <span className="whitespace-pre-wrap">{s.hosp_externa_obs}</span>
                  </L>
                )}
              </dl>
            </Card>
          )}

          {s.colaboradores.length === 0 && (
            <Card>
              <p className="text-sm text-neutral-700">
                Esta solicitação chegou <strong>sem a lista de passageiros</strong> — é o
                combinado quando a operação reserva fora do hotel do pax, porque a
                empresa de ônibus manda os dados depois.
              </p>
              <p className="mt-1.5 text-sm text-neutral-600">
                Reserve pelos dados acima. Quando a lista chegar, os nomes entram aqui.
              </p>
            </Card>
          )}

          {s.colaboradores.map((c, idx) => (
            <Card
              key={c.id}
              titulo={
                // O aviso vai no título de propósito: quem está preenchendo
                // voo trabalha card a card e não olha a aba de aprovação.
                c.aprovacao === false
                  ? `${idx + 1}. ${c.nome_completo} — REPROVADO pelo diretor`
                  : `${idx + 1}. ${c.nome_completo}`
              }
              acao={
                idx === 0 && s.colaboradores.length > 1 ? (
                  <button
                    className="text-xs font-medium text-neutral-700 hover:underline"
                    onClick={() => replicar(c.id)}
                  >
                    Replicar para todos
                  </button>
                ) : undefined
              }
            >
              <div className="space-y-5">
                {tem(s, 'AEREO') && (
                  <>
                    <BlocoVoo
                      titulo="Voo de ida"
                      valor={voos[`${c.id}:IDA`] ?? {}}
                      editavel={podeEditarServico('AEREO')}
                      onChange={(v) => setVoos((p) => ({ ...p, [`${c.id}:IDA`]: v }))}
                    />
                    <BlocoVoo
                      titulo="Voo de volta"
                      valor={voos[`${c.id}:VOLTA`] ?? {}}
                      editavel={podeEditarServico('AEREO')}
                      onChange={(v) => setVoos((p) => ({ ...p, [`${c.id}:VOLTA`]: v }))}
                    />
                  </>
                )}

                {tem(s, 'RODOVIARIO') && (
                  <BlocoRodoviario
                    valor={rodo[c.id] ?? {}}
                    editavel={podeEditarServico('RODOVIARIO')}
                    onChange={(v) => setRodo((p) => ({ ...p, [c.id]: v }))}
                  />
                )}

                {/* Um bloco por hospedagem pedida. Quem marcou as duas tem
                    duas estadias de verdade — hotéis, datas e reservas
                    diferentes — e por isso são dois blocos, não um. */}
                {tiposHospedagem(s).map((tipo) => {
                  const fora = tipo === 'FORA_HOTEL_PAX'
                  const servico = fora ? 'HOSPEDAGEM_FORA' : 'HOSPEDAGEM'
                  return (
                    <BlocoHospedagem
                      key={tipo}
                      titulo={ROTULO_HOSPEDAGEM[tipo]}
                      valor={hosp[`${c.id}:${tipo}`] ?? {}}
                      editavel={podeEditarServico(servico)}
                      padraoHotel={fora ? '' : s.edicoes.hotel}
                      enderecoDe={(nome) => hoteis.get(chaveHotel(nome))}
                      padraoIn={s.data_entrada}
                      padraoOut={s.data_saida}
                      fora={fora}
                      pedido={{
                        qtd: s.hosp_qtd_quartos,
                        tipo: s.hosp_tipo_quarto,
                        alimentacao: s.hosp_alimentacao,
                        obs: s.hosp_externa_obs,
                      }}
                      onChange={(v) =>
                        setHosp((p) => ({ ...p, [`${c.id}:${tipo}`]: v }))
                      }
                    />
                  )
                })}
              </div>
            </Card>
          ))}

          {tem(s, 'VAN') && (
            <Card
              titulo="Locação de van ou ônibus"
              descricao={
                `Pedido: ${veiculosTexto(s.van_qtd_veiculos, s.van_tipo_veiculo)} · ` +
                `${s.van_qtd_passageiros ? `${s.van_qtd_passageiros} passageiro(s)` : 'passageiros a definir'} · ` +
                `saída ${dataBR(s.van_data_saida ?? undefined)}${hora(s.van_hora_saida)} ` +
                `de ${s.van_local_saida ?? '—'} · ` +
                `destino ${s.van_destino ?? '—'}`
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Campo label="Empresa / locadora" obrigatorio={false}>
                  <Input
                    disabled={!podeEditarServico('VAN')}
                    value={van.empresa ?? ''}
                    onChange={(e) => setVan((v) => ({ ...v, empresa: e.target.value }))}
                  />
                </Campo>
                <Campo label="Motorista" obrigatorio={false}>
                  <Input
                    disabled={!podeEditarServico('VAN')}
                    value={van.motorista ?? ''}
                    onChange={(e) => setVan((v) => ({ ...v, motorista: e.target.value }))}
                  />
                </Campo>
                <Campo label="Telefone do motorista" obrigatorio={false}>
                  <Input
                    disabled={!podeEditarServico('VAN')}
                    value={van.telefone ?? ''}
                    onChange={(e) => setVan((v) => ({ ...v, telefone: e.target.value }))}
                  />
                </Campo>
                <Campo label="Placa" obrigatorio={false}>
                  <Input
                    disabled={!podeEditarServico('VAN')}
                    value={van.placa ?? ''}
                    onChange={(e) =>
                      setVan((v) => ({ ...v, placa: e.target.value.toUpperCase() }))
                    }
                  />
                </Campo>
                <Campo label="Passageiros" obrigatorio={false}>
                  <Input
                    type="number"
                    disabled={!podeEditarServico('VAN')}
                    value={van.qtd_passageiros ?? ''}
                    onChange={(e) =>
                      setVan({
                        ...van,
                        qtd_passageiros: e.target.value ? +e.target.value : null,
                      })
                    }
                  />
                </Campo>
                <Campo label="Preço (R$)" obrigatorio={false}>
                  <Input
                    type="number"
                    step="0.01"
                    disabled={!podeEditarServico('VAN')}
                    value={van.preco ?? ''}
                    onChange={(e) =>
                      setVan((v) => ({ ...v, preco: e.target.value ? +e.target.value : null }))
                    }
                  />
                </Campo>
                <Campo label="Local de saída" obrigatorio={false}>
                  <Input
                    disabled={!podeEditarServico('VAN')}
                    value={van.local_saida ?? ''}
                    onChange={(e) => setVan((v) => ({ ...v, local_saida: e.target.value }))}
                  />
                </Campo>
                <DataHora
                  rotulo="Saída"
                  valor={van}
                  campoData="saida_data"
                  campoHora="saida_hora"
                  editavel={podeEditarServico('VAN')}
                  onChange={setVan}
                />
                {/* O retorno chega preenchido com a data e a hora do pedido —
                    antes ele só existia no resumo e não tinha onde ser
                    ajustado quando a operação fechava com a empresa. */}
                <DataHora
                  rotulo="Retorno"
                  valor={van}
                  campoData="chegada_data"
                  campoHora="chegada_hora"
                  editavel={podeEditarServico('VAN')}
                  onChange={setVan}
                />
                <Campo label="Local de chegada" obrigatorio={false}>
                  <Input
                    disabled={!podeEditarServico('VAN')}
                    value={van.local_chegada ?? ''}
                    onChange={(e) => setVan((v) => ({ ...v, local_chegada: e.target.value }))}
                  />
                </Campo>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Campo label="Observações" obrigatorio={false}>
                    <Textarea
                      rows={2}
                      disabled={!podeEditarServico('VAN')}
                      value={van.observacoes ?? ''}
                      onChange={(e) => setVan((v) => ({ ...v, observacoes: e.target.value }))}
                    />
                  </Campo>
                </div>
              </div>
            </Card>
          )}

          {tem(s, 'CARRO') && (
            <>
            {carrosPedidos.length === 0 && (
              <Card titulo="Locação de carro">
                <p className="text-sm text-neutral-600">
                  Esta solicitação pede carro, mas não tem condutor cadastrado. Sem um
                  condutor não há reserva para preencher — confira o pedido com quem
                  solicitou.
                </p>
              </Card>
            )}
            {/* Uma reserva por condutor. Antes havia UMA locação para a
                solicitação inteira, então quatro condutores dividiam uma
                locadora, uma diária e um preço — e o custo saía errado por
                construção. */}
            {carrosPedidos.map((pedido, idx) => (
            <Card
              key={pedido.id}
              titulo={`Locação de carro ${carrosPedidos.length > 1 ? `${idx + 1}. ` : '— '}${pedido.condutor_nome}`}
            >
              <div className="mb-4 rounded-lg bg-neutral-50 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Pedido pelo solicitante
                </p>
                <p className="text-xs text-neutral-700">
                  <span className="font-medium">{pedido.condutor_nome}</span> ·{' '}
                  {TIPOS_CARRO.find((t) => t.value === pedido.tipo_carro)?.label ??
                    pedido.tipo_carro ??
                    '—'}{' '}
                  · {pedido.transmissao === 'AUTOMATICO' ? 'automático' : 'manual'}
                  <br />
                  <span className="text-neutral-500">
                    {dataBR(pedido.retirada_data)}
                    {hora(pedido.retirada_hora)} a {dataBR(pedido.devolucao_data)}
                    {hora(pedido.devolucao_hora)}
                    {pedido.local_retirada ? ` · retirada: ${pedido.local_retirada}` : ''}
                  </span>
                </p>
              </div>
              <BlocoCarro
                valor={carros[pedido.id] ?? {}}
                editavel={podeEditarServico('CARRO')}
                colaboradores={s.colaboradores}
                onChange={(v) => setCarros((p) => ({ ...p, [pedido.id]: v }))}
              />
            </Card>
            ))}
            </>
          )}


          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-sm text-neutral-600">
              Custo calculado: <strong>{moeda(s.custo_total)}</strong>
            </span>
            <Botao onClick={salvarOperacional} carregando={salvando} disabled={!podeEditar}>
              Salvar dados operacionais
            </Botao>
          </div>
        </div>
      )}

      {/* ---------- ABA APROVAÇÃO ---------- */}
      {aba === 'Aprovação' && (
        <PainelAprovacao solicitacao={s} aprovacoes={aprovacoes} />
      )}

      {/* ---------- ABA HISTÓRICO ---------- */}
      {aba === 'Histórico' && (
        <Card>
          {eventos.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Sem eventos ainda.</p>
          ) : (
            <ol className="space-y-3">
              {eventos.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-neutral-300" />
                  <div>
                    <p className="text-neutral-800">{e.descricao}</p>
                    <p className="text-xs text-neutral-500">
                      {e.autor_nome ?? 'Solicitante'} · {dataHoraBR(e.created_at)} ·{' '}
                      <span className="font-mono">{e.tipo}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  )

  /** Copia voos e hospedagem do primeiro colaborador para os demais. */
  function replicar(origemId: string) {
    if (!s) return
    const alvos = s.colaboradores.filter((c) => c.id !== origemId)
    setVoos((p) => {
      const n = { ...p }
      for (const t of ['IDA', 'VOLTA']) {
        const base = p[`${origemId}:${t}`]
        if (!base) continue
        alvos.forEach((c) => {
          const { id: _i, localizador: _l, ...resto } = base as Voo
          n[`${c.id}:${t}`] = { ...resto, colaborador_id: c.id, trecho: t as 'IDA' | 'VOLTA' }
        })
      }
      return n
    })
    setHosp((p) => {
      const n = { ...p }
      // Replica cada tipo de hospedagem no seu par: a estadia no hotel da
      // operação não deve vazar para a de fora, nem o contrário.
      for (const tipo of tiposHospedagem(s)) {
        const base = p[`${origemId}:${tipo}`]
        if (!base) continue
        alvos.forEach((c) => {
          const {
            id: _i,
            codigo_reserva: _r,
            dividindo_com: _d,
            ...resto
          } = base as HospedagemDetalhe
          n[`${c.id}:${tipo}`] = { ...resto, colaborador_id: c.id, tipo }
        })
      }
      return n
    })
    setMsg({
      tom: 'sucesso',
      texto: 'Dados replicados. Localizador e código de reserva ficam em branco — revise e salve.',
    })
  }
}

// ---------------------------------------------------------------- helpers

/** Remove chaves undefined e strings vazias viram null. */
/**
 * A solicitação pede vários serviços ao mesmo tempo. `modal` guarda um só
 * (com prioridade aéreo > van > rodoviário), então quem pedia aéreo E van
 * nunca via o bloco da van — e o preço dela ficava de fora do total.
 * `servicos` é a fonte de verdade; `modal` e `precisa_locacao_carro` só
 * cobrem as solicitações antigas, anteriores a essa mudança.
 */
/**
 * Mesma normalização da função `chave_hotel` no banco. As duas precisam
 * concordar: se divergirem, a tela procura por uma chave que o catálogo não
 * tem e o endereço simplesmente não aparece, sem erro nenhum na cara.
 */
function chaveHotel(nome: string) {
  return nome.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Quais hospedagens a solicitação pediu, na ordem em que fazem sentido ler:
 * primeiro a da operação, depois a de fora.
 *
 * Solicitações anteriores à separação não têm os serviços novos — para elas
 * vale o `tipo_hospedagem` antigo, que era escolha única.
 */
type TipoHospedagem = 'HOTEL_PAX' | 'FORA_HOTEL_PAX'

function tiposHospedagem(s: Solicitacao): TipoHospedagem[] {
  const lista = s.servicos ?? []
  const tipos: TipoHospedagem[] = []
  if (lista.includes('HOSPEDAGEM')) tipos.push('HOTEL_PAX')
  if (lista.includes('HOSPEDAGEM_FORA')) tipos.push('FORA_HOTEL_PAX')
  if (tipos.length) return tipos
  if (lista.length) return []
  return [(s.tipo_hospedagem as TipoHospedagem) ?? 'HOTEL_PAX']
}

const ROTULO_HOSPEDAGEM: Record<string, string> = {
  HOTEL_PAX: 'Hospedagem — hotel da operação',
  FORA_HOTEL_PAX: 'Hospedagem — fora do hotel do pax',
}

function tem(s: Solicitacao, servico: string) {
  const lista = s.servicos ?? []
  if (lista.length) return lista.includes(servico)
  if (servico === 'CARRO') return s.precisa_locacao_carro
  if (servico === 'HOSPEDAGEM') return true
  return s.precisa_transporte && s.modal === servico
}


function limpar<T extends Record<string, unknown>>(o: T) {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue
    r[k] = v === '' ? null : v
  }
  return r
}

async function erro(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (error) throw new Error(error.message)
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-36 shrink-0 text-neutral-500">{t}</dt>
      <dd className="flex-1 text-neutral-800">{children}</dd>
    </div>
  )
}

function BlocoVoo({
  titulo,
  valor,
  editavel,
  onChange,
}: {
  titulo: string
  valor: Partial<Voo>
  editavel: boolean
  onChange: (v: Partial<Voo>) => void
}) {
  const up = (k: keyof Voo, v: unknown) => onChange({ ...valor, [k]: v })
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-3.5">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {titulo}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Companhia" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.companhia ?? ''} onChange={(e) => up('companhia', e.target.value)} />
        </Campo>
        <Campo label="Número do voo" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.numero_voo ?? ''} onChange={(e) => up('numero_voo', e.target.value)} />
        </Campo>
        <Campo label="Origem (IATA)" obrigatorio={false}>
          <Input
            disabled={!editavel}
            maxLength={3}
            value={valor.aeroporto_origem ?? ''}
            onChange={(e) => up('aeroporto_origem', e.target.value.toUpperCase())}
          />
        </Campo>
        <Campo label="Destino (IATA)" obrigatorio={false}>
          <Input
            disabled={!editavel}
            maxLength={3}
            value={valor.aeroporto_destino ?? ''}
            onChange={(e) => up('aeroporto_destino', e.target.value.toUpperCase())}
          />
        </Campo>
        <DataHora
          rotulo="Partida"
          valor={valor}
          campoData="partida_data"
          campoHora="partida_hora"
          editavel={editavel}
          onChange={onChange}
        />
        <DataHora
          rotulo="Chegada"
          valor={valor}
          campoData="chegada_data"
          campoHora="chegada_hora"
          editavel={editavel}
          onChange={onChange}
        />
        <Campo label="Localizador" obrigatorio={false}>
          <Input
            disabled={!editavel}
            value={valor.localizador ?? ''}
            onChange={(e) => up('localizador', e.target.value.toUpperCase())}
            className="font-mono"
          />
        </Campo>
        {/* Prazo de emissão: é o relógio que derruba a reserva. Fica ao lado
            do localizador porque os dois vêm da mesma tela da companhia, e
            vai junto para o diretor — a demora dele é o que estoura o prazo. */}
        <DataHora
          rotulo="Prazo de emissão"
          valor={valor}
          campoData="emissao_prazo_data"
          campoHora="emissao_prazo_hora"
          editavel={editavel}
          onChange={onChange}
        />
        <Campo label="Preço (R$)" obrigatorio={false}>
          <Input
            type="number"
            step="0.01"
            disabled={!editavel}
            value={valor.preco ?? ''}
            onChange={(e) => up('preco', e.target.value ? +e.target.value : null)}
          />
        </Campo>
        <Campo label="Bagagem despachada" obrigatorio={false}>
          <Select
            disabled={!editavel}
            value={valor.bagagem_despachada === null || valor.bagagem_despachada === undefined ? '' : String(valor.bagagem_despachada)}
            onChange={(e) => up('bagagem_despachada', e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">—</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </Select>
        </Campo>
        <div className="sm:col-span-2 lg:col-span-3">
          <Campo label="Observações" obrigatorio={false}>
            <Input disabled={!editavel} value={valor.observacoes ?? ''} onChange={(e) => up('observacoes', e.target.value)} />
          </Campo>
        </div>
      </div>
    </fieldset>
  )
}

function BlocoRodoviario({
  valor,
  editavel,
  onChange,
}: {
  valor: Partial<Rodoviario>
  editavel: boolean
  onChange: (v: Partial<Rodoviario>) => void
}) {
  const up = (k: keyof Rodoviario, v: unknown) => onChange({ ...valor, [k]: v })
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-3.5">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Transporte rodoviário
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Empresa" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.empresa ?? ''} onChange={(e) => up('empresa', e.target.value)} />
        </Campo>
        <Campo label="Número do ônibus" obrigatorio={false}>
          <Input
            disabled={!editavel}
            value={valor.numero_onibus ?? ''}
            onChange={(e) => up('numero_onibus', e.target.value)}
          />
        </Campo>
        <DataHora
          rotulo="Apresentação"
          valor={valor}
          campoData="apresentacao_data"
          campoHora="apresentacao_hora"
          editavel={editavel}
          onChange={onChange}
        />
        <DataHora
          rotulo="Ida"
          valor={valor}
          campoData="ida_data"
          campoHora="ida_hora"
          editavel={editavel}
          onChange={onChange}
        />
        <Campo label="Embarque (ida)" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.local_embarque_ida ?? ''} onChange={(e) => up('local_embarque_ida', e.target.value)} />
        </Campo>
        <Campo label="Preço (R$)" obrigatorio={false}>
          <Input
            type="number"
            step="0.01"
            disabled={!editavel}
            value={valor.preco ?? ''}
            onChange={(e) => up('preco', e.target.value ? +e.target.value : null)}
          />
        </Campo>
        <DataHora
          rotulo="Volta"
          valor={valor}
          campoData="volta_data"
          campoHora="volta_hora"
          editavel={editavel}
          onChange={onChange}
        />
        <Campo label="Embarque (volta)" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.local_embarque_volta ?? ''} onChange={(e) => up('local_embarque_volta', e.target.value)} />
        </Campo>
        <div className="sm:col-span-2 lg:col-span-3">
          <Campo label="Observações" obrigatorio={false}>
            <Input disabled={!editavel} value={valor.observacoes ?? ''} onChange={(e) => up('observacoes', e.target.value)} />
          </Campo>
        </div>
      </div>
    </fieldset>
  )
}

/**
 * Uma reserva de carro. Um bloco por condutor pedido.
 *
 * Virou componente pelo mesmo motivo que voo e hospedagem viraram: com mais de
 * um condutor, os campos se repetem, e repetir JSX é repetir defeito.
 */
function BlocoCarro({
  valor,
  editavel,
  colaboradores,
  onChange,
}: {
  valor: Partial<LocacaoCarro>
  editavel: boolean
  colaboradores: Colaborador[]
  onChange: (v: Partial<LocacaoCarro>) => void
}) {
  const up = (k: keyof LocacaoCarro, v: unknown) => onChange({ ...valor, [k]: v })
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Campo label="Locadora" obrigatorio={false}>
        <Input
          disabled={!editavel}
          value={valor.locadora ?? ''}
          onChange={(e) => up('locadora', e.target.value)}
        />
      </Campo>
      <Campo label="Categoria" obrigatorio={false}>
        <Input
          disabled={!editavel}
          value={valor.categoria ?? ''}
          onChange={(e) => up('categoria', e.target.value)}
        />
      </Campo>
      {/* Código da reserva: é por ele que a locadora acha o carro no balcão,
          e sem campo próprio ele acabava perdido nas observações. */}
      <Campo label="Código da reserva" obrigatorio={false}>
        <Input
          disabled={!editavel}
          value={valor.codigo_reserva ?? ''}
          onChange={(e) => up('codigo_reserva', e.target.value.toUpperCase())}
          className="font-mono"
        />
      </Campo>
      <Campo label="Condutor (colaborador)" obrigatorio={false}>
        <Select
          disabled={!editavel}
          value={valor.condutor_colaborador_id ?? ''}
          onChange={(e) => up('condutor_colaborador_id', e.target.value || null)}
        >
          <option value="">Selecione…</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome_completo}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo label="Local de retirada" obrigatorio={false}>
        <Input
          disabled={!editavel}
          value={valor.retirada_local ?? ''}
          onChange={(e) => up('retirada_local', e.target.value)}
        />
      </Campo>
      <DataHora
        rotulo="Retirada"
        valor={valor}
        campoData="retirada_data"
        campoHora="retirada_hora"
        editavel={editavel}
        onChange={onChange}
      />
      <Campo label="Local de devolução" obrigatorio={false}>
        <Input
          disabled={!editavel}
          value={valor.devolucao_local ?? ''}
          onChange={(e) => up('devolucao_local', e.target.value)}
        />
      </Campo>
      <DataHora
        rotulo="Devolução"
        valor={valor}
        campoData="devolucao_data"
        campoHora="devolucao_hora"
        editavel={editavel}
        onChange={onChange}
      />
      <Campo label="Preço (R$)" obrigatorio={false}>
        <Input
          type="number"
          step="0.01"
          disabled={!editavel}
          value={valor.preco ?? ''}
          onChange={(e) => up('preco', e.target.value ? +e.target.value : null)}
        />
      </Campo>
      <div className="sm:col-span-2 lg:col-span-3">
        <Campo label="Observações" obrigatorio={false}>
          <Textarea
            rows={2}
            disabled={!editavel}
            value={valor.observacoes ?? ''}
            onChange={(e) => up('observacoes', e.target.value)}
          />
        </Campo>
      </div>
    </div>
  )
}

function BlocoHospedagem({
  titulo,
  valor,
  editavel,
  padraoHotel,
  padraoIn,
  padraoOut,
  fora,
  pedido,
  enderecoDe,
  onChange,
}: {
  /** Diz de qual das duas hospedagens este bloco trata. */
  titulo: string
  valor: Partial<HospedagemDetalhe>
  editavel: boolean
  padraoHotel: string
  padraoIn: string
  padraoOut: string
  /** Hospedagem fora do hotel dos passageiros — muda o que a operação vê. */
  fora: boolean
  pedido: {
    qtd: number | null
    tipo: string | null
    alimentacao: string | null
    obs: string | null
  }
  /** Endereço conhecido para um nome de hotel, se houver. */
  enderecoDe: (nome: string) => string | undefined
  onChange: (v: Partial<HospedagemDetalhe>) => void
}) {
  const up = (k: keyof HospedagemDetalhe, v: unknown) => onChange({ ...valor, [k]: v })

  /**
   * Troca o hotel e, de quebra, traz o endereço dele.
   *
   * Só preenche endereço vazio. Digitar o nome de outro hotel por cima de um
   * endereço já escrito não apaga o que estava lá — a operação pode ter
   * colocado o endereço exato de uma unidade, e o do catálogo é o genérico.
   */
  const trocarHotel = (campo: 'hotel' | 'hotel_hospedagem', nome: string) => {
    const achado = nome.trim() ? enderecoDe(nome) : undefined
    onChange({
      ...valor,
      [campo]: nome,
      ...(achado && !valor.endereco?.trim() ? { endereco: achado } : {}),
    })
  }
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-3.5">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {titulo}
      </legend>

      {/* Fora do hotel do pax: o que o solicitante pediu fica à vista, senão
          quem reserva teria que voltar na aba anterior para conferir. */}
      {fora && (
        <div className="mb-3 rounded-lg bg-neutral-50 p-3 text-xs">
          <p className="mb-1 font-semibold uppercase tracking-wide text-neutral-500">
            Pedido pelo solicitante
          </p>
          <p className="text-neutral-700">
            {pedido.qtd ?? '—'} quarto{pedido.qtd === 1 ? '' : 's'}{' '}
            {tipoQuartoLabel(pedido.tipo).toLowerCase()} ·{' '}
            {alimentacaoLabel(pedido.alimentacao).toLowerCase()}
          </p>
          {pedido.obs && (
            <p className="mt-1 whitespace-pre-wrap text-neutral-600">{pedido.obs}</p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Campo
            label={fora ? 'Hotel da operação (referência)' : 'Hotel'}
            obrigatorio={false}
          >
            <Input
              disabled={!editavel || fora}
              value={valor.hotel ?? ''}
              placeholder={padraoHotel}
              onChange={(e) => trocarHotel('hotel', e.target.value)}
            />
          </Campo>
        </div>
        {fora && (
          <div className="lg:col-span-2">
            <Campo label="Hotel onde vamos hospedar" obrigatorio={false}>
              <Input
                disabled={!editavel}
                value={valor.hotel_hospedagem ?? ''}
                onChange={(e) => trocarHotel('hotel_hospedagem', e.target.value)}
                placeholder="Nome do hotel que a operação reservou"
              />
            </Campo>
          </div>
        )}
        <div className="lg:col-span-2">
          <Campo label="Endereço do hotel" obrigatorio={false}>
            <Input
              disabled={!editavel}
              value={valor.endereco ?? ''}
              onChange={(e) => up('endereco', e.target.value)}
              placeholder="Rua, número, bairro, cidade"
            />
          </Campo>
        </div>
        <Campo label="Tipo de quarto" obrigatorio={false}>
          {fora ? (
            // Fora do hotel do pax o tipo veio do formulário, com opções
            // fechadas. Texto livre aqui só criaria divergência com o pedido.
            <Select
              disabled={!editavel}
              value={valor.tipo_quarto ?? ''}
              onChange={(e) => up('tipo_quarto', e.target.value)}
            >
              <option value="">Selecione…</option>
              {TIPOS_QUARTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              disabled={!editavel}
              value={valor.tipo_quarto ?? ''}
              onChange={(e) => up('tipo_quarto', e.target.value)}
            />
          )}
        </Campo>
        {fora && (
          <Campo label="Alimentação" obrigatorio={false}>
            <Select
              disabled={!editavel}
              value={valor.alimentacao ?? ''}
              onChange={(e) => up('alimentacao', e.target.value)}
            >
              <option value="">Selecione…</option>
              {ALIMENTACAO.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <Campo label="Dividindo com" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.dividindo_com ?? ''} onChange={(e) => up('dividindo_com', e.target.value)} />
        </Campo>
        <Campo label="Check-in" obrigatorio={false}>
          <Input
            type="date"
            disabled={!editavel}
            value={valor.check_in ?? ''}
            placeholder={padraoIn}
            onChange={(e) => up('check_in', e.target.value || null)}
          />
        </Campo>
        <Campo label="Check-out" obrigatorio={false}>
          <Input
            type="date"
            disabled={!editavel}
            value={valor.check_out ?? ''}
            placeholder={padraoOut}
            onChange={(e) => up('check_out', e.target.value || null)}
          />
        </Campo>
        <Campo label="Valor total da hospedagem (R$)" obrigatorio={false}>
          <Input
            type="number"
            step="0.01"
            disabled={!editavel}
            value={valor.valor_total ?? ''}
            onChange={(e) => up('valor_total', e.target.value ? +e.target.value : null)}
          />
        </Campo>
        <Campo label="Código da reserva" obrigatorio={false}>
          <Input
            disabled={!editavel}
            value={valor.codigo_reserva ?? ''}
            onChange={(e) => up('codigo_reserva', e.target.value.toUpperCase())}
            className="font-mono"
          />
        </Campo>
      </div>
    </fieldset>
  )
}


/**
 * A decisão agora acontece na área do diretor (/aprovacao). Aqui a operação
 * só acompanha: o que foi enviado, o que o diretor respondeu e quando.
 */
function PainelAprovacao({
  solicitacao,
  aprovacoes,
}: {
  solicitacao: Cheia
  aprovacoes: Aprovacao[]
}) {
  const aguardando = solicitacao.status === 'AGUARDANDO_APROVACAO'
  const servicos = solicitacao.servicos ?? []
  const jaAprovados = solicitacao.servicos_aprovados ?? []
  const faltam = servicos.filter((x) => !jaAprovados.includes(x))
  /**
   * Aprovação parcial devolve a solicitação para EM_PREENCHIMENTO. Sem
   * distinguir esse caso, a tela dizia "ainda não enviada para aprovação"
   * numa solicitação que teve o aéreo aprovado — e a operação acreditaria.
   */
  const parcialmenteAprovada = jaAprovados.length > 0 && faltam.length > 0
  const reprovados = (solicitacao.colaboradores ?? []).filter((c) => c.aprovacao === false)
  const decididos = (solicitacao.colaboradores ?? []).filter((c) => c.aprovacao !== null)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card titulo="Situação da aprovação">
        {aguardando ? (
          <div className="space-y-3">
            <Aviso tom="destaque">
              Aguardando <strong>{solicitacao.diretores.nome}</strong> decidir no sistema.
              Ele foi avisado no Slack e acessa a solicitação pela própria área de
              aprovações.
            </Aviso>
            {decididos.length > 0 && (
              <p className="text-sm text-neutral-700">
                Ele já decidiu sobre {decididos.length} de{' '}
                {(solicitacao.colaboradores ?? []).length} passageiro(s). A rodada fecha
                quando o último for decidido.
              </p>
            )}
            <p className="text-sm text-neutral-600">
              Enquanto estiver neste status, os dados ficam travados para edição. Se
              precisar corrigir algo, use <strong>Reabrir para edição</strong> — isso
              cancela a pendência e exige um novo envio.
            </p>
          </div>
        ) : parcialmenteAprovada ? (
          <Aviso tom="destaque">
            <strong>Aprovada em parte.</strong> {solicitacao.diretores.nome} já liberou{' '}
            {jaAprovados.map(servicoCurto).join(', ')}. Falta enviar{' '}
            {faltam.map(servicoCurto).join(', ')} — use os botões de{' '}
            <strong>Aprovação por serviço</strong> quando estiver cotado.
          </Aviso>
        ) : solicitacao.status === 'RECEBIDA' ||
          solicitacao.status === 'EM_PREENCHIMENTO' ? (
          <Aviso>
            Ainda não enviada para aprovação. Preencha os dados operacionais e use{' '}
            <strong>Enviar para aprovação</strong>.
          </Aviso>
        ) : (
          <Aviso tom={solicitacao.status === 'REPROVADA' ? 'erro' : 'sucesso'}>
            {solicitacao.status === 'REPROVADA'
              ? 'Reprovada pelo diretor. Reabra para ajustar e enviar de novo.'
              : 'Aprovada pelo diretor.'}
          </Aviso>
        )}

        {/* Passageiro reprovado individualmente.
            Sem isto a operação emitiria a passagem de alguém que o diretor
            barrou — o status da solicitação continua "aprovada", porque os
            outros passaram. */}
        {reprovados.length > 0 && (
          <Aviso tom="erro" className="mt-3">
            <strong>
              {reprovados.length === 1
                ? '1 passageiro foi reprovado'
                : `${reprovados.length} passageiros foram reprovados`}{' '}
              individualmente.
            </strong>{' '}
            Não emita nada para{' '}
            {reprovados.map((c) => c.nome_completo.split(' ')[0]).join(', ')}.
            <ul className="mt-1.5 space-y-1 text-xs">
              {reprovados.map((c) => (
                <li key={c.id}>
                  <strong>{c.nome_completo}</strong>
                  {c.aprovacao_obs ? ` — ${c.aprovacao_obs}` : ''}
                </li>
              ))}
            </ul>
          </Aviso>
        )}
      </Card>

      <Card titulo="Decisões registradas">
        {aprovacoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            Nenhuma decisão ainda.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {aprovacoes.map((a) => (
              <li key={a.id} className="rounded-lg bg-neutral-50 p-3">
                <Etiqueta
                  className={
                    a.aprovado
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                      : 'bg-red-50 text-red-800 ring-red-300'
                  }
                >
                  {a.aprovado ? 'Aprovado' : 'Reprovado'}
                </Etiqueta>
                {/* Sem o escopo, duas linhas "Aprovado" no histórico ficam
                    indistinguíveis — e uma delas cobria só o aéreo. */}
                {a.escopo?.length && a.escopo.length < servicos.length ? (
                  <span className="ml-2 text-xs font-semibold text-neutral-700">
                    somente {a.escopo.map(servicoCurto).join(', ')}
                  </span>
                ) : null}
                <p className="mt-1.5 text-xs text-neutral-500">
                  {solicitacao.diretores.nome}
                  {a.registrado_por ? ' (registrado pelo super admin)' : ''} ·{' '}
                  {dataHoraBR(a.decidido_em)}
                </p>
                {a.observacao && (
                  <p className="mt-1 whitespace-pre-wrap text-neutral-700">
                    {a.observacao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
