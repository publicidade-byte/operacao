import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { STATUS_CLASS, STATUS_LABEL, equipeLabel, servicoCurto } from '../../lib/constants'
import { dataBR, dataCurta, moeda } from '../../lib/format'
import { Aviso, Botao, Card, Etiqueta, Vazio } from '../../components/ui'

export type LinhaAprovacao = {
  id: string
  protocolo: string
  status: string
  equipe: string
  equipe_outro: string | null
  data_entrada: string
  data_saida: string
  destino: string
  hotel: string
  evento_inicio: string
  evento_fim: string
  qtd_pax: number
  custo_total: number | null
  solicitante_nome: string
  servicos: string[] | null
  /**
   * Serviços desta rodada de aprovação. Menor que `servicos` numa aprovação
   * parcial — o diretor está decidindo só sobre parte do pedido.
   */
  escopo_aprovacao: string[] | null
  /** O que já foi aprovado em rodadas anteriores. */
  servicos_aprovados: string[] | null
  /** Nomes de quem viaja, montados à parte da visão de solicitações. */
  colaboradores?: string[]
  created_at: string
}

/** "Aéreo · Hospedagem · Aluguel de van" — o que o solicitante pediu. */
function listaServicos(servicos: string[] | null) {
  return (servicos ?? []).map(servicoCurto).join(' · ')
}

export default function Pendentes() {
  const [dados, setDados] = useState<LinhaAprovacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [aprovandoLote, setAprovandoLote] = useState(false)
  const [resultadoLote, setResultadoLote] = useState<string | null>(null)
  const [recarregar, setRecarregar] = useState(0)

  useEffect(() => {
    ;(async () => {
      // Os nomes de quem viaja vêm à parte: a visão de solicitações traz uma
      // linha por pedido, e o diretor precisa saber QUEM vai — não só quantos.
      const [{ data, error }, { data: pessoas }] = await Promise.all([
        supabase
          .from('v_aprovacao_solicitacoes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('v_aprovacao_colaboradores').select('solicitacao_id, nome_completo, ordem'),
      ])
      if (error) setErro(error.message)

      const porSolicitacao = new Map<string, string[]>()
      for (const p of (pessoas ?? []).sort(
        (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0),
      ) as { solicitacao_id: string; nome_completo: string; ordem: number }[]) {
        const lista = porSolicitacao.get(p.solicitacao_id) ?? []
        lista.push(p.nome_completo)
        porSolicitacao.set(p.solicitacao_id, lista)
      }

      setDados(
        ((data ?? []) as LinhaAprovacao[]).map((d) => ({
          ...d,
          colaboradores: porSolicitacao.get(d.id) ?? [],
        })),
      )
      setCarregando(false)
    })()
  }, [recarregar])

  const pendentes = useMemo(
    () => dados.filter((d) => d.status === 'AGUARDANDO_APROVACAO'),
    [dados],
  )

  const alternar = (id: string) =>
    setMarcadas((antes) => {
      const novo = new Set(antes)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const selecionadas = pendentes.filter((d) => marcadas.has(d.id))
  const totalSelecionado = selecionadas.reduce((t, d) => t + Number(d.custo_total ?? 0), 0)

  /**
   * Aprova em lote o que estiver marcado.
   *
   * O banco devolve uma linha por solicitação em vez de parar no primeiro
   * erro. Se uma delas foi decidida por outro caminho enquanto a tela estava
   * aberta, as outras passam e a tela diz exatamente qual não passou — some
   * uma da lista sem explicação seria pior.
   */
  async function aprovarSelecionadas() {
    if (selecionadas.length === 0) return
    const quais = selecionadas.map((d) => d.protocolo).join(', ')
    if (
      !confirm(
        `Aprovar ${selecionadas.length} ${selecionadas.length === 1 ? 'solicitação' : 'solicitações'} ` +
          `(${quais}), somando ${moeda(totalSelecionado)}?\n\n` +
          'Todos os passageiros de cada uma serão aprovados.',
      )
    )
      return

    setAprovandoLote(true)
    setResultadoLote(null)
    setErro('')
    const { data, error } = await supabase.rpc('aprovar_varias', {
      p_solicitacoes: selecionadas.map((d) => d.id),
      p_observacao: null,
    })
    setAprovandoLote(false)

    if (error) {
      setErro(error.message)
      return
    }

    const linhas = (data ?? []) as { solicitacao_id: string; ok: boolean; erro: string }[]
    const protocoloDe = (id: string) =>
      pendentes.find((d) => d.id === id)?.protocolo ?? id.slice(0, 8)
    const falhas = linhas.filter((l) => !l.ok)
    const passaram = linhas.length - falhas.length

    setResultadoLote(
      `${passaram} ${passaram === 1 ? 'aprovada' : 'aprovadas'}.` +
        (falhas.length
          ? ' Não passaram: ' +
            falhas.map((f) => `${protocoloDe(f.solicitacao_id)} (${f.erro})`).join('; ')
          : ''),
    )
    setMarcadas(new Set())
    setRecarregar((n) => n + 1)
  }
  const decididas = useMemo(
    () => dados.filter((d) => d.status !== 'AGUARDANDO_APROVACAO'),
    [dados],
  )

  if (carregando)
    return <p className="py-16 text-center text-sm text-neutral-500">Carregando…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-neutral-900">Suas aprovações</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {pendentes.length === 0
            ? 'Nenhuma solicitação aguardando você no momento.'
            : `${pendentes.length} ${pendentes.length === 1 ? 'solicitação aguarda' : 'solicitações aguardam'} sua decisão.`}
        </p>
      </div>

      {erro && (
        <Card>
          <p className="text-sm text-red-600">{erro}</p>
        </Card>
      )}

      {resultadoLote && <Aviso tom="sucesso">{resultadoLote}</Aviso>}

      {/* Barra de seleção.
          Só aparece com mais de uma pendência: com uma só, marcar e clicar em
          "aprovar selecionadas" dá mais trabalho do que abrir e decidir. */}
      {pendentes.length > 1 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-neutral-900"
                checked={marcadas.size === pendentes.length && pendentes.length > 0}
                onChange={(e) =>
                  setMarcadas(
                    e.target.checked ? new Set(pendentes.map((d) => d.id)) : new Set(),
                  )
                }
              />
              Selecionar todas ({pendentes.length})
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {marcadas.size > 0 && (
                <span className="text-sm text-neutral-600">
                  {marcadas.size} marcada{marcadas.size === 1 ? '' : 's'} ·{' '}
                  <strong className="text-neutral-900">{moeda(totalSelecionado)}</strong>
                </span>
              )}
              <Botao
                variante="sucesso"
                disabled={marcadas.size === 0}
                carregando={aprovandoLote}
                onClick={aprovarSelecionadas}
              >
                Aprovar selecionadas
              </Botao>
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            A aprovação em lote aprova todos os passageiros de cada solicitação. Para
            decidir pessoa por pessoa, abra a solicitação.
          </p>
        </Card>
      )}

      {pendentes.length > 0 && (
        <section className="space-y-3">
          {pendentes.map((d) => (
            <div
              key={d.id}
              className={
                'flex items-start gap-3 rounded-xl border-2 bg-white p-4 shadow-sm transition ' +
                (marcadas.has(d.id)
                  ? 'border-neutral-900'
                  : 'border-marca-400 hover:border-marca-500 hover:shadow')
              }
            >
              {pendentes.length > 1 && (
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${d.protocolo}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-neutral-900"
                  checked={marcadas.has(d.id)}
                  onChange={() => alternar(d.id)}
                />
              )}
              <Link to={`/aprovacao/${d.id}`} className="block flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-neutral-500">
                      {d.protocolo}
                    </span>
                    <Etiqueta className={STATUS_CLASS[d.status]}>
                      {STATUS_LABEL[d.status]}
                    </Etiqueta>
                  </div>
                  <p className="mt-1.5 text-base font-bold text-neutral-900">
                    {d.destino} — {d.hotel}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    {equipeLabel(d.equipe, d.equipe_outro)} · {d.qtd_pax} pax ·{' '}
                    {dataCurta(d.data_entrada)} a {dataCurta(d.data_saida)}
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-700">
                    <span className="text-neutral-500">Solicitado:</span>{' '}
                    {listaServicos(d.servicos) || '—'}
                  </p>
                  {/* Quem viaja: é o que o diretor está aprovando, e antes
                      só aparecia a contagem de pax. */}
                  <p className="mt-0.5 text-sm text-neutral-700">
                    <span className="text-neutral-500">Quem viaja:</span>{' '}
                    {d.colaboradores?.length
                      ? d.colaboradores.join(', ')
                      : 'lista ainda não informada'}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Solicitado por {d.solicitante_nome}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Custo total
                  </p>
                  <p className="text-lg font-bold text-neutral-900">
                    {moeda(d.custo_total)}
                  </p>
                  <span className="mt-1 inline-block text-xs font-semibold text-neutral-700 underline decoration-marca-400 decoration-2 underline-offset-2">
                    Analisar →
                  </span>
                </div>
              </div>
              </Link>
            </div>
          ))}
        </section>
      )}

      {pendentes.length === 0 && decididas.length === 0 && (
        <Card>
          <Vazio titulo="Tudo em dia">
            Quando a operação enviar uma solicitação para sua aprovação, ela aparece aqui —
            e você recebe um aviso no Slack.
          </Vazio>
        </Card>
      )}

      {decididas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Histórico</h2>
          <Card className="overflow-hidden">
            <div className="-m-4 divide-y divide-neutral-100">
              {decididas.map((d) => (
                <Link
                  key={d.id}
                  to={`/aprovacao/${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-neutral-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">
                      {d.destino}{' '}
                      <span className="font-mono text-xs font-normal text-neutral-400">
                        {d.protocolo}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {equipeLabel(d.equipe, d.equipe_outro)} · {d.qtd_pax} pax ·{' '}
                      {dataBR(d.data_entrada)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {listaServicos(d.servicos) || '—'}
                      {d.colaboradores?.length ? ` · ${d.colaboradores.join(', ')}` : ''}
                      <span className="text-neutral-400">
                        {' '}· solicitado por {d.solicitante_nome}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-600">
                      {moeda(d.custo_total)}
                    </span>
                    <Etiqueta className={STATUS_CLASS[d.status]}>
                      {STATUS_LABEL[d.status]}
                    </Etiqueta>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  )
}
