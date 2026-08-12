import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { STATUS_CLASS, STATUS_LABEL, equipeLabel, servicoCurto } from '../../lib/constants'
import { dataBR, dataCurta, moeda } from '../../lib/format'
import { Card, Etiqueta, Vazio } from '../../components/ui'

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
  }, [])

  const pendentes = useMemo(
    () => dados.filter((d) => d.status === 'AGUARDANDO_APROVACAO'),
    [dados],
  )
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

      {pendentes.length > 0 && (
        <section className="space-y-3">
          {pendentes.map((d) => (
            <Link
              key={d.id}
              to={`/aprovacao/${d.id}`}
              className="block rounded-xl border-2 border-marca-400 bg-white p-4 shadow-sm transition hover:border-marca-500 hover:shadow"
            >
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
