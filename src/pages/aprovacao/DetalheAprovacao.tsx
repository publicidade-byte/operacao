import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  STATUS_CLASS,
  STATUS_LABEL,
  aeroportoLabel,
  equipeLabel,
  servicoCurto,
  tipoQuartoLabel,
  veiculosTexto,
  alimentacaoLabel,
} from '../../lib/constants'
import { dataBR, dataHora, dataHoraBR, moeda } from '../../lib/format'
import { Aviso, Botao, Card, Etiqueta, Textarea } from '../../components/ui'
import type { LinhaAprovacao } from './Pendentes'

type Sol = LinhaAprovacao & {
  tipo_hospedagem: string
  precisa_transporte: boolean
  modal: string | null
  aeroporto_saida: string | null
  aeroporto_chegada: string | null
  precisa_bagagem: boolean | null
  obs_transporte: string
  precisa_locacao_carro: boolean
  obs_locacao_carro: string | null
  solicitante_email: string
  solicitante_whatsapp: string | null
  van_local_saida: string | null
  van_horario_saida: string | null
  van_data_saida: string | null
  van_hora_saida: string | null
  van_retorno_data: string | null
  van_retorno_hora: string | null
  van_destino: string | null
  van_qtd_passageiros: number | null
  van_tipo_veiculo: string | null
  van_qtd_veiculos: number | null
  rodo_regiao_saida: string | null
  rodo_cidade_estado: string | null
  hosp_externa_obs: string | null
  hosp_qtd_quartos: number | null
  hosp_tipo_quarto: string | null
  hosp_alimentacao: string | null
  observacoes_internas: string | null
}

/**
 * `modal` guarda um serviço só (aéreo > van > rodoviário), então quem pedia
 * aéreo E van aparecia para o diretor como se tivesse pedido só o aéreo.
 * A lista `servicos` é a fonte de verdade; os campos antigos só cobrem as
 * solicitações anteriores a essa mudança.
 */
function tem(s: Sol, servico: string) {
  const lista = s.servicos ?? []
  if (lista.length) return lista.includes(servico)
  if (servico === 'CARRO') return s.precisa_locacao_carro
  return s.precisa_transporte && s.modal === servico
}

type Colab = { id: string; nome_completo: string; ordem: number }
type Voo = {
  colaborador_id: string
  trecho: string
  companhia: string | null
  numero_voo: string | null
  aeroporto_origem: string | null
  aeroporto_destino: string | null
  partida_data: string | null
  partida_hora: string | null
  chegada_data: string | null
  chegada_hora: string | null
  localizador: string | null
  preco: number | null
}
type Rodo = {
  colaborador_id: string
  empresa: string | null
  ida_data: string | null
  ida_hora: string | null
  volta_data: string | null
  volta_hora: string | null
  preco: number | null
}
type Hosp = {
  colaborador_id: string
  hotel: string | null
  hotel_hospedagem: string | null
  tipo_quarto: string | null
  alimentacao: string | null
  check_in: string | null
  check_out: string | null
  valor_total: number | null
}
type Carro = {
  locadora: string | null
  categoria: string | null
  retirada_data: string | null
  retirada_hora: string | null
  devolucao_data: string | null
  devolucao_hora: string | null
  preco: number | null
}
type Operacao = {
  edicao_id: string
  codigo: string
  data_inicio: string
  data_fim: string
  noites: number
}
type Decisao = {
  id: string
  aprovado: boolean
  decidido_em: string
  observacao: string | null
}

export default function DetalheAprovacao() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [s, setS] = useState<Sol | null>(null)
  const [colabs, setColabs] = useState<Colab[]>([])
  const [voos, setVoos] = useState<Voo[]>([])
  const [rodo, setRodo] = useState<Rodo[]>([])
  const [hosp, setHosp] = useState<Hosp[]>([])
  const [carro, setCarro] = useState<Carro | null>(null)
  const [van, setVan] = useState<{ preco: number | null } | null>(null)
  const [decisoes, setDecisoes] = useState<Decisao[]>([])
  const [operacoes, setOperacoes] = useState<Operacao[]>([])
  const [obs, setObs] = useState('')
  const [acao, setAcao] = useState<'APROVAR' | 'REPROVAR' | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const [sol, c, v, r, h, l, d, ops, vn] = await Promise.all([
      supabase.from('v_aprovacao_solicitacoes').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_aprovacao_colaboradores').select('*').eq('solicitacao_id', id),
      supabase.from('v_aprovacao_voos').select('*').eq('solicitacao_id', id),
      supabase.from('v_aprovacao_rodoviario').select('*').eq('solicitacao_id', id),
      supabase.from('v_aprovacao_hospedagem').select('*').eq('solicitacao_id', id),
      supabase.from('v_aprovacao_carro').select('*').eq('solicitacao_id', id).maybeSingle(),
      supabase
        .from('v_aprovacao_decisoes')
        .select('*')
        .eq('solicitacao_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('v_aprovacao_edicoes')
        .select('*')
        .eq('solicitacao_id', id)
        .order('data_inicio'),
      supabase.from('v_aprovacao_van').select('*').eq('solicitacao_id', id).maybeSingle(),
    ])
    setS(sol.data as Sol)
    setOperacoes((ops.data ?? []) as Operacao[])
    setColabs(((c.data ?? []) as Colab[]).sort((a, b) => a.ordem - b.ordem))
    setVoos((v.data ?? []) as Voo[])
    setRodo((r.data ?? []) as Rodo[])
    setHosp((h.data ?? []) as Hosp[])
    setCarro((l.data as Carro) ?? null)
    setVan((vn.data as { preco: number | null }) ?? null)
    setDecisoes((d.data ?? []) as Decisao[])
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function decidir(aprovado: boolean) {
    if (!aprovado && !obs.trim()) {
      setErro('Informe o motivo da reprovação.')
      return
    }
    setEnviando(true)
    setErro('')
    const { error } = await supabase.rpc('aprovar_solicitacao', {
      p_solicitacao: id,
      p_aprovado: aprovado,
      p_observacao: obs.trim() || null,
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    navigate('/aprovacao', { replace: true })
  }

  if (!s)
    return <p className="py-16 text-center text-sm text-neutral-500">Carregando…</p>

  const pendente = s.status === 'AGUARDANDO_APROVACAO'
  const totalVoos = voos.reduce((t, v) => t + Number(v.preco ?? 0), 0)
  const totalRodo = rodo.reduce((t, v) => t + Number(v.preco ?? 0), 0)
  // A operação lança o valor fechado da hospedagem — não há mais diária
  // para multiplicar por noites.
  const totalHosp = hosp.reduce((t, h) => t + Number(h.valor_total ?? 0), 0)
  const totalCarro = Number(carro?.preco ?? 0)
  const totalVan = Number(van?.preco ?? 0)

  /**
   * Uma aprovação pode cobrir a solicitação inteira ou só parte dela.
   *
   * Quando a operação manda só o aéreo, é sobre o aéreo que o diretor está
   * decidindo — e é o custo do aéreo que ele precisa ver. Mostrar o total da
   * viagem aqui faria ele aprovar, sem perceber, um número que ainda não
   * existe: os serviços que faltam estão em R$ 0,00 justamente porque
   * ninguém cotou.
   */
  const escopo = s.escopo_aprovacao?.length ? s.escopo_aprovacao : (s.servicos ?? [])
  const parcial = escopo.length > 0 && escopo.length < (s.servicos ?? []).length
  const jaAprovados = s.servicos_aprovados ?? []

  const porServico: [string, string, number][] = [
    ['AEREO', 'Aéreo', totalVoos],
    ['RODOVIARIO', 'Rodoviário', totalRodo],
    ['HOSPEDAGEM', 'Hospedagem', totalHosp],
    ['CARRO', 'Locação de carro', totalCarro],
    ['VAN', 'Locação de van ou ônibus', totalVan],
  ]
  const custoDecisao = parcial
    ? porServico.filter(([sv]) => escopo.includes(sv)).reduce((t, [, , v]) => t + v, 0)
    : s.custo_total
  const escopoTexto = escopo.map(servicoCurto).join(', ')

  return (
    <div className="space-y-4">
      <Link to="/aprovacao" className="text-xs text-neutral-500 hover:underline">
        ← Voltar
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm text-neutral-500">{s.protocolo}</span>
            <Etiqueta className={STATUS_CLASS[s.status]}>
              {STATUS_LABEL[s.status]}
            </Etiqueta>
          </div>
          <h1 className="mt-1 text-xl font-bold text-neutral-900">
            {s.destino} — {s.hotel}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-600">
            {equipeLabel(s.equipe, s.equipe_outro)} · {s.qtd_pax} pax · solicitado por{' '}
            {s.solicitante_nome}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-900 px-4 py-2.5 text-right text-white">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">
            {parcial ? `Custo de ${escopoTexto}` : 'Custo total'}
          </p>
          <p className="text-xl font-bold">{moeda(custoDecisao)}</p>
        </div>
      </header>

      {/* Aviso de escopo: sem isto o diretor lê a tela inteira e assume que
          está decidindo sobre a viagem toda. */}
      {pendente && parcial && (
        <Aviso tom="destaque">
          Esta é uma <strong>aprovação parcial</strong>. Você está decidindo apenas sobre{' '}
          <strong>{escopoTexto}</strong>, no valor de <strong>{moeda(custoDecisao)}</strong>.
          O restante da solicitação ainda está sendo cotado pela operação e virá em outra
          aprovação.
          {jaAprovados.length > 0 && (
            <>
              {' '}
              Você já aprovou antes: {jaAprovados.map(servicoCurto).join(', ')}.
            </>
          )}
        </Aviso>
      )}

      {/* Resumo de custos — é o que o diretor precisa para decidir */}
      <Card
        titulo="Composição do custo"
        descricao={
          parcial ? 'Em destaque, o que está na sua decisão agora.' : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {porServico.map(([sv, rotulo, valor]) => (
            <Custo
              key={sv}
              rotulo={rotulo}
              valor={valor}
              // Numa rodada parcial o que está fora dela fica apagado: continua
              // à vista para dar contexto, sem se misturar com o que se decide.
              apagado={parcial && !escopo.includes(sv)}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="O que foi solicitado">
          <dl className="divide-y divide-neutral-100 text-sm">
            <L t={operacoes.length > 1 ? `Operações (${operacoes.length})` : 'Operação'}>
              {operacoes.length > 0 ? (
                <ul className="space-y-0.5">
                  {operacoes.map((o) => (
                    <li key={o.edicao_id}>
                      {dataBR(o.data_inicio)} a {dataBR(o.data_fim)}
                    </li>
                  ))}
                </ul>
              ) : (
                `${dataBR(s.evento_inicio)} a ${dataBR(s.evento_fim)}`
              )}
            </L>
            <L t="Estadia">
              {dataBR(s.data_entrada)} a {dataBR(s.data_saida)}
            </L>
            <L t="Hospedagem">
              {s.tipo_hospedagem === 'HOTEL_PAX'
                ? 'Hotel do pax'
                : 'Fora do hotel do pax'}
              {/* Fora do hotel do pax, o que se reserva é quarto — e é isso
                  que o diretor está aprovando o custo. */}
              {s.hosp_qtd_quartos != null && (
                <span className="block font-medium text-neutral-800">
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
            </L>
            <L t="Solicitado">
              {(s.servicos ?? []).map(servicoCurto).join(' · ') || '—'}
            </L>
            {tem(s, 'AEREO') && (
              <>
                <L t="Trecho aéreo">
                  {aeroportoLabel(s.aeroporto_saida)} →{' '}
                  {aeroportoLabel(s.aeroporto_chegada)}
                </L>
                <L t="Bagagem despachada">
                  {s.precisa_bagagem === null
                    ? '—'
                    : s.precisa_bagagem
                      ? 'Sim'
                      : 'Não, só bagagem de mão'}
                </L>
              </>
            )}
            {tem(s, 'RODOVIARIO') && (
              <L t="Rodoviário">
                Sai de {s.rodo_regiao_saida ?? '—'} · {s.rodo_cidade_estado ?? '—'}
              </L>
            )}
            {tem(s, 'VAN') && (
              <L t="Van ou ônibus">
                {veiculosTexto(s.van_qtd_veiculos, s.van_tipo_veiculo)} ·{' '}
                {s.van_qtd_passageiros ?? '—'} passageiro(s)
                <br />
                Ida {dataBR(s.van_data_saida)} {s.van_hora_saida?.slice(0, 5) ?? ''} · de{' '}
                {s.van_local_saida ?? '—'} para {s.van_destino ?? '—'}
                <br />
                Retorno {dataBR(s.van_retorno_data)}{' '}
                {s.van_retorno_hora?.slice(0, 5) ?? ''}
              </L>
            )}
            <L t="Observações">
              <span className="whitespace-pre-wrap">{s.obs_transporte}</span>
            </L>
            {tem(s, 'CARRO') && s.obs_locacao_carro && (
              <L t="Obs. locação">{s.obs_locacao_carro}</L>
            )}
          </dl>
        </Card>

        <Card titulo={`Pessoas e viagem (${colabs.length})`}>
          <div className="space-y-3">
            {/* Reserva por quarto: a lista de passageiros ainda não existe.
                Sem isto o card apareceria vazio e pareceria erro. */}
            {colabs.length === 0 && (
              <p className="text-sm text-neutral-600">
                A lista de passageiros ainda não chegou — nesta solicitação a operação
                reserva os quartos e completa os nomes depois. O que está sendo
                aprovado é a reserva de{' '}
                <strong>
                  {s.hosp_qtd_quartos ?? '—'} quarto
                  {s.hosp_qtd_quartos === 1 ? '' : 's'}{' '}
                  {tipoQuartoLabel(s.hosp_tipo_quarto).toLowerCase()}
                </strong>
                , {alimentacaoLabel(s.hosp_alimentacao).toLowerCase()}.
              </p>
            )}
            {colabs.map((c) => {
              const meusVoos = voos.filter((v) => v.colaborador_id === c.id)
              const meuBus = rodo.find((r) => r.colaborador_id === c.id)
              const minhaHosp = hosp.find((h) => h.colaborador_id === c.id)
              return (
                <div key={c.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <p className="font-semibold text-neutral-900">{c.nome_completo}</p>
                  {meusVoos
                    .sort((a) => (a.trecho === 'IDA' ? -1 : 1))
                    .map((v, i) => (
                      <p key={i} className="mt-1 text-neutral-600">
                        <span className="font-medium text-neutral-700">{v.trecho}</span>{' '}
                        {v.companhia} {v.numero_voo} · {v.aeroporto_origem} →{' '}
                        {v.aeroporto_destino} · {dataHora(v.partida_data, v.partida_hora)}
                        {v.preco != null && (
                          <span className="ml-1 text-neutral-500">
                            ({moeda(v.preco)})
                          </span>
                        )}
                      </p>
                    ))}
                  {meuBus?.empresa && (
                    <p className="mt-1 text-neutral-600">
                      Ônibus {meuBus.empresa} · ida {dataHora(meuBus.ida_data, meuBus.ida_hora)}
                      {meuBus.preco != null && (
                        <span className="ml-1 text-neutral-500">
                          ({moeda(meuBus.preco)})
                        </span>
                      )}
                    </p>
                  )}
                  {/* Fora do hotel do pax, `hotel` é só a referência da
                      operação — o diretor precisa ver onde a pessoa dorme. */}
                  {(minhaHosp?.hotel_hospedagem || minhaHosp?.hotel) && (
                    <p className="mt-1 text-neutral-600">
                      {minhaHosp.hotel_hospedagem || minhaHosp.hotel}
                      {minhaHosp.tipo_quarto &&
                        ` · ${tipoQuartoLabel(minhaHosp.tipo_quarto)}`}
                      {minhaHosp.alimentacao &&
                        ` · ${alimentacaoLabel(minhaHosp.alimentacao).toLowerCase()}`}{' '}
                      · {dataBR(minhaHosp.check_in)} a {dataBR(minhaHosp.check_out)}
                      {minhaHosp.valor_total != null && (
                        <span className="ml-1 text-neutral-500">
                          ({moeda(minhaHosp.valor_total)})
                        </span>
                      )}
                    </p>
                  )}
                  {meusVoos.length === 0 &&
                    !meuBus?.empresa &&
                    !minhaHosp?.hotel &&
                    !minhaHosp?.hotel_hospedagem && (
                      <p className="mt-1 text-xs text-neutral-400">
                        Sem dados de viagem preenchidos.
                      </p>
                    )}
                </div>
              )
            })}
          </div>

          {carro?.locadora && (
            <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm">
              <p className="font-semibold text-neutral-900">Locação de carro</p>
              <p className="mt-1 text-neutral-600">
                {carro.locadora}
                {carro.categoria && ` · ${carro.categoria}`} ·{' '}
                {dataHora(carro.retirada_data, carro.retirada_hora)} a {dataHora(carro.devolucao_data, carro.devolucao_hora)}
              </p>
            </div>
          )}
        </Card>
      </div>

      <p className="text-center text-xs text-neutral-400">
        Esta tela não exibe CPF nem data de nascimento — só o necessário para a decisão.
      </p>

      {/* ---------- Decisão ---------- */}
      {pendente ? (
        <Card titulo="Sua decisão">
          {!acao ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Botao
                variante="sucesso"
                className="flex-1"
                onClick={() => {
                  setAcao('APROVAR')
                  setErro('')
                }}
              >
                {parcial ? `Aprovar ${escopoTexto.toLowerCase()}` : 'Aprovar solicitação'}
              </Botao>
              <Botao
                variante="secundario"
                className="flex-1"
                onClick={() => {
                  setAcao('REPROVAR')
                  setErro('')
                }}
              >
                Reprovar
              </Botao>
            </div>
          ) : (
            <div className="space-y-3">
              <Aviso tom={acao === 'APROVAR' ? 'sucesso' : 'erro'}>
                {acao === 'APROVAR' ? (
                  parcial ? (
                    <>
                      Você vai <strong>aprovar {escopoTexto}</strong> no valor de{' '}
                      <strong>{moeda(custoDecisao)}</strong>. O resto da solicitação
                      continua com a operação e volta para você depois.
                    </>
                  ) : (
                    <>
                      Você vai <strong>aprovar</strong> esta solicitação no valor de{' '}
                      <strong>{moeda(custoDecisao)}</strong>. A operação será notificada e
                      enviará a confirmação ao solicitante.
                    </>
                  )
                ) : (
                  <>
                    Você vai <strong>reprovar</strong>{' '}
                    {parcial ? <>a aprovação de {escopoTexto}</> : 'esta solicitação'}. O
                    motivo é obrigatório e será registrado.
                  </>
                )}
              </Aviso>
              <Textarea
                rows={3}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={
                  acao === 'APROVAR'
                    ? 'Observação (opcional)'
                    : 'Motivo da reprovação (obrigatório)'
                }
                erro={acao === 'REPROVAR' && !!erro && !obs.trim()}
              />
              {erro && <Aviso tom="erro">{erro}</Aviso>}
              <div className="flex gap-2">
                <Botao
                  variante={acao === 'APROVAR' ? 'sucesso' : 'perigo'}
                  carregando={enviando}
                  onClick={() => decidir(acao === 'APROVAR')}
                >
                  Confirmar {acao === 'APROVAR' ? 'aprovação' : 'reprovação'}
                </Botao>
                <Botao
                  variante="fantasma"
                  onClick={() => {
                    setAcao(null)
                    setErro('')
                  }}
                >
                  Cancelar
                </Botao>
              </div>
            </div>
          )}
        </Card>
      ) : (
        decisoes.length > 0 && (
          <Card titulo="Decisão registrada">
            <ul className="space-y-3 text-sm">
              {decisoes.map((d) => (
                <li key={d.id} className="rounded-lg bg-neutral-50 p-3">
                  <Etiqueta
                    className={
                      d.aprovado
                        ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                        : 'bg-red-50 text-red-800 ring-red-300'
                    }
                  >
                    {d.aprovado ? 'Aprovado' : 'Reprovado'}
                  </Etiqueta>
                  <p className="mt-1.5 text-xs text-neutral-500">
                    {dataHoraBR(d.decidido_em)}
                  </p>
                  {d.observacao && (
                    <p className="mt-1 text-neutral-700">{d.observacao}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )
      )}
    </div>
  )
}

function Custo({
  rotulo,
  valor,
  apagado = false,
}: {
  rotulo: string
  valor: number
  /** Fora da rodada de aprovação em curso: visível, mas sem peso. */
  apagado?: boolean
}) {
  return (
    <div
      className={
        'rounded-lg border px-3 py-2.5 ' +
        (apagado ? 'border-neutral-200 bg-neutral-50 opacity-60' : 'border-neutral-200')
      }
    >
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p
        className={
          'mt-0.5 text-sm font-bold ' + (apagado ? 'text-neutral-500' : 'text-neutral-900')
        }
      >
        {valor > 0 ? moeda(valor) : '—'}
      </p>
      {apagado && <p className="text-[10px] text-neutral-500">fora desta aprovação</p>}
    </div>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-32 shrink-0 text-neutral-500">{t}</dt>
      <dd className="flex-1 text-neutral-800">{children}</dd>
    </div>
  )
}
