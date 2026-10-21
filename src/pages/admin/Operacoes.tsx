import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Edicao } from '../../lib/types'
import { dataBR } from '../../lib/format'
import { Botao, Card, Input, Select, Vazio } from '../../components/ui'

/**
 * Quais datas aceitam solicitação.
 *
 * O problema que ela resolve é pedido em cima da hora: a operação de
 * sexta-feira aparecia no formulário na quinta, e alguém pedia aéreo para o
 * dia seguinte. Fechar a data tira ela do formulário sem apagar nada — o
 * que já foi solicitado continua existindo, com protocolo e histórico.
 *
 * Só gestor vê esta tela, e é o banco que garante isso: a política de
 * leitura das operações só devolve as inativas para quem é gestor.
 */

type Linha = Edicao & { solicitacoes: number }

/** Quantos dias faltam para a operação começar. Negativo = já começou. */
function diasAte(data: string) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${data}T12:00:00`)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

function prazoTexto(dias: number) {
  if (dias < 0) return 'já começou'
  if (dias === 0) return 'começa hoje'
  if (dias === 1) return 'começa amanhã'
  return `faltam ${dias} dias`
}

export default function Operacoes() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [fDestino, setFDestino] = useState('')
  const [fEstado, setFEstado] = useState<'' | 'ABERTA' | 'FECHADA'>('')
  const [verPassadas, setVerPassadas] = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [diasCorte, setDiasCorte] = useState('7')

  async function carregar() {
    const [{ data: eds }, { data: vinculos }] = await Promise.all([
      supabase.from('edicoes').select('*').order('data_inicio'),
      supabase
        .from('solicitacao_edicoes')
        .select('edicao_id, solicitacoes!inner(excluida_em)'),
    ])
    const usos = new Map<string, number>()
    for (const v of (vinculos ?? []) as unknown as {
      edicao_id: string
      solicitacoes: { excluida_em: string | null }
    }[]) {
      if (v.solicitacoes?.excluida_em) continue
      usos.set(v.edicao_id, (usos.get(v.edicao_id) ?? 0) + 1)
    }
    setLinhas(
      ((eds ?? []) as Edicao[]).map((e) => ({ ...e, solicitacoes: usos.get(e.id) ?? 0 })),
    )
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const destinos = useMemo(
    () => [...new Set(linhas.map((l) => l.destino))].sort(),
    [linhas],
  )

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (l.avulsa) return false // tratada à parte, embaixo
      if (!verPassadas && diasAte(l.data_fim) < 0) return false
      if (fDestino && l.destino !== fDestino) return false
      if (fEstado === 'ABERTA' && !l.ativa) return false
      if (fEstado === 'FECHADA' && l.ativa) return false
      if (!q) return true
      return (
        l.destino.toLowerCase().includes(q) ||
        (l.hotel ?? '').toLowerCase().includes(q) ||
        l.codigo.toLowerCase().includes(q)
      )
    })
  }, [linhas, busca, fDestino, fEstado, verPassadas])

  const avulsa = linhas.find((l) => l.avulsa)

  /**
   * Abre ou fecha uma data.
   *
   * A tela responde na hora e desfaz se o banco recusar: fechar datas é
   * clique em série, e esperar a rede a cada uma trava o trabalho.
   */
  async function alternar(l: Linha, valor?: boolean) {
    const novo = valor ?? !l.ativa
    setSalvando(l.id)
    setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, ativa: novo } : x)))
    const { error } = await supabase.from('edicoes').update({ ativa: novo }).eq('id', l.id)
    setSalvando(null)
    if (error) {
      setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, ativa: !novo } : x)))
      setMsg(`Não foi possível mudar ${l.codigo}: ${error.message}`)
      return
    }
    setMsg(
      `${l.codigo} (${dataBR(l.data_inicio)} a ${dataBR(l.data_fim)}) ${
        novo ? 'voltou para o formulário' : 'saiu do formulário'
      }.`,
    )
  }

  /** Fecha de uma vez tudo que começa dentro do prazo — o pedido em cima da hora. */
  async function fecharProximas() {
    const dias = Number(diasCorte)
    if (!Number.isFinite(dias) || dias < 0) return setMsg('Informe um número de dias.')
    const alvos = linhas.filter(
      (l) => !l.avulsa && l.ativa && diasAte(l.data_inicio) <= dias && diasAte(l.data_fim) >= 0,
    )
    if (!alvos.length) return setMsg('Nenhuma data aberta dentro desse prazo.')
    if (
      !confirm(
        `Fechar ${alvos.length} data(s) que começam em até ${dias} dia(s)?\n\n` +
          alvos.map((a) => `· ${a.destino} ${dataBR(a.data_inicio)} (${a.codigo})`).join('\n') +
          '\n\nElas somem do formulário. As solicitações já feitas continuam como estão.',
      )
    )
      return
    setSalvando('lote')
    const ids = alvos.map((a) => a.id)
    const { error } = await supabase.from('edicoes').update({ ativa: false }).in('id', ids)
    setSalvando(null)
    if (error) return setMsg(`Não foi possível fechar: ${error.message}`)
    setLinhas((ls) => ls.map((x) => (ids.includes(x.id) ? { ...x, ativa: false } : x)))
    setMsg(`${alvos.length} data(s) fechadas.`)
  }

  const abertas = filtradas.filter((l) => l.ativa).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Operações abertas para solicitação</h1>
          <p className="mt-0.5 text-sm text-neutral-600">
            Data fechada some do formulário. Nada do que já foi solicitado se perde.
          </p>
        </div>
        <span className="text-sm text-neutral-600">
          <strong>{abertas}</strong> aberta(s) de {filtradas.length} na lista
        </span>
      </div>

      {msg && (
        <Card>
          <p className="text-sm text-neutral-700">{msg}</p>
        </Card>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Buscar por destino, hotel ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Select value={fDestino} onChange={(e) => setFDestino(e.target.value)}>
            <option value="">Todos os destinos</option>
            {destinos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value as '' | 'ABERTA' | 'FECHADA')}
          >
            <option value="">Abertas e fechadas</option>
            <option value="ABERTA">Só abertas</option>
            <option value="FECHADA">Só fechadas</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={verPassadas}
              onChange={(e) => setVerPassadas(e.target.checked)}
            />
            Mostrar datas que já passaram
          </label>
        </div>

        {/* O pedido em cima da hora resolvido de uma vez: é para isso que a
            tela existe, e fazer isso data por data seria trabalho manual. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 text-sm">
          <span className="text-neutral-600">Fechar tudo que começa em até</span>
          <Input
            type="number"
            min={0}
            value={diasCorte}
            onChange={(e) => setDiasCorte(e.target.value)}
            className="w-20"
          />
          <span className="text-neutral-600">dia(s)</span>
          <Botao
            variante="secundario"
            onClick={fecharProximas}
            carregando={salvando === 'lote'}
          >
            Fechar em lote
          </Botao>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {carregando ? (
          <Vazio>Carregando…</Vazio>
        ) : filtradas.length === 0 ? (
          <Vazio>Nenhuma data com esses filtros.</Vazio>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {filtradas.map((l) => {
              const dias = diasAte(l.data_inicio)
              const passou = diasAte(l.data_fim) < 0
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-900">
                      {l.destino}
                      {l.hotel && (
                        <span className="ml-1.5 text-sm font-normal text-neutral-500">
                          {l.hotel}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {dataBR(l.data_inicio)} a {dataBR(l.data_fim)}
                      <span className="ml-1.5 font-mono text-xs text-neutral-500">
                        {l.codigo}
                      </span>
                      <span
                        className={
                          'ml-2 text-xs ' +
                          (passou
                            ? 'text-neutral-400'
                            : dias <= 7
                              ? 'font-semibold text-amber-700'
                              : 'text-neutral-500')
                        }
                      >
                        {prazoTexto(dias)}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-400">
                      {l.solicitacoes === 0
                        ? 'nenhuma solicitação'
                        : `${l.solicitacoes} solicitação(ões)`}
                    </p>
                  </div>
                  <button
                    onClick={() => alternar(l)}
                    disabled={salvando === l.id}
                    className={
                      'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-50 ' +
                      (l.ativa
                        ? 'bg-emerald-100 text-emerald-800 ring-emerald-400 hover:bg-emerald-200'
                        : 'bg-neutral-100 text-neutral-500 ring-neutral-300 hover:bg-neutral-200')
                    }
                    title={
                      l.ativa
                        ? 'Aparece no formulário — clique para fechar'
                        : 'Fora do formulário — clique para abrir'
                    }
                  >
                    {l.ativa ? 'Aberta' : 'Fechada'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* A avulsa não é uma data: é a porta de entrada do que não está no
          calendário. Fechar sem querer deixaria essas demandas sem caminho. */}
      {avulsa && (
        <Card titulo="Outras operações (avulsa)">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              É por aqui que entram Colab, Universidade Forma, Porto Seguro e visitas
              técnicas — demandas sem data no calendário. Fechar isto tira a opção do
              formulário inteiro.
            </p>
            <button
              onClick={() => alternar(avulsa)}
              disabled={salvando === avulsa.id}
              className={
                'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-50 ' +
                (avulsa.ativa
                  ? 'bg-emerald-100 text-emerald-800 ring-emerald-400 hover:bg-emerald-200'
                  : 'bg-neutral-100 text-neutral-500 ring-neutral-300 hover:bg-neutral-200')
              }
            >
              {avulsa.ativa ? 'Aberta' : 'Fechada'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
