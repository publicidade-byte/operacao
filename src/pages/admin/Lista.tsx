import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Diretor, Edicao, Solicitacao } from '../../lib/types'
import {
  EQUIPES,
  SERVICOS,
  STATUS_CLASS,
  STATUS_LABEL,
  corResponsavel,
  corServico,
  etiquetaServico,
  SERVICOS_HOSPEDAGEM,
  equipeLabel,
  nomeDestino,
} from '../../lib/constants'
import { dataBR, dataCurta, moeda, soDigitos } from '../../lib/format'
import { Botao, Card, Etiqueta, Input, Select, Vazio } from '../../components/ui'
import { useAdmin } from './AdminLayout'

type Linha = Solicitacao & {
  edicoes: Edicao
  diretores: Diretor
  colaboradores: { id: string; nome_completo: string; cpf: string }[]
  responsaveis?: string[]
  /** Quantas operações (edições) esta solicitação cobre. */
  qtd_operacoes?: number
}

/**
 * Faixa colorida na borda esquerda de cada linha.
 *
 * A etiqueta de status já diz o estado por escrito, mas ler 60 etiquetas é
 * trabalho. A faixa deixa a coluna inteira legível de relance — dá para achar
 * as que esperam aprovação sem passar o olho em cada linha.
 */
const FAIXA_STATUS: Record<string, string> = {
  RECEBIDA: 'bg-violet-400',
  EM_PREENCHIMENTO: 'bg-sky-400',
  AGUARDANDO_APROVACAO: 'bg-marca-400',
  APROVADA: 'bg-emerald-400',
  REPROVADA: 'bg-red-400',
  CONCLUIDA: 'bg-neutral-800',
  CANCELADA: 'bg-red-600',
}

const STATUS_FILTROS = [
  'RECEBIDA',
  'EM_PREENCHIMENTO',
  'AGUARDANDO_APROVACAO',
  'APROVADA',
  'REPROVADA',
  'CONCLUIDA',
  'CANCELADA',
]

export default function Lista() {
  const admin = useAdmin()
  const [dados, setDados] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState<string[]>([])
  const [fEquipe, setFEquipe] = useState('')
  const [fDestino, setFDestino] = useState('')
  const [fDiretor, setFDiretor] = useState('')
  const [fServico, setFServico] = useState('')
  const [fResponsavel, setFResponsavel] = useState('')
  const [verLixeira, setVerLixeira] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [sol, resp] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select(
            '*, edicoes!solicitacoes_edicao_id_fkey(*), diretores(*), colaboradores(id, nome_completo, cpf)',
          )
          .order('created_at', { ascending: false }),
        supabase.from('solicitacao_responsaveis').select('solicitacao_id, admin_id'),
      ])

      // Quantas operações cada solicitação cobre. Uma solicitação que atende
      // duas edições do mesmo destino é logisticamente outra coisa — dois
      // períodos, dois voucher, duas listas — e isso não aparecia em lugar
      // nenhum da lista.
      const { data: vinculos } = await supabase
        .from('solicitacao_edicoes')
        .select('solicitacao_id')
      const operacoesPor = new Map<string, number>()
      for (const v of vinculos ?? [])
        operacoesPor.set(v.solicitacao_id, (operacoesPor.get(v.solicitacao_id) ?? 0) + 1)

      // Nomes dos responsáveis, para mostrar ao lado do status.
      const { data: equipe } = await supabase.from('v_equipe').select('id, nome')
      const nomePorId = new Map((equipe ?? []).map((u) => [u.id, u.nome]))
      const porSolicitacao = new Map<string, string[]>()
      for (const r of resp.data ?? []) {
        const lista = porSolicitacao.get(r.solicitacao_id) ?? []
        lista.push(nomePorId.get(r.admin_id) ?? '—')
        porSolicitacao.set(r.solicitacao_id, lista)
      }

      setDados(
        ((sol.data ?? []) as Linha[]).map((d) => ({
          ...d,
          responsaveis: porSolicitacao.get(d.id) ?? [],
          qtd_operacoes: operacoesPor.get(d.id) ?? 0,
        })),
      )
      setCarregando(false)
    })()
  }, [])

  const destinos = useMemo(
    () => [...new Set(dados.map((d) => d.edicoes?.destino).filter(Boolean))].sort(),
    [dados],
  )
  const diretores = useMemo(() => {
    const m = new Map<string, string>()
    dados.forEach((d) => d.diretores && m.set(d.diretores.id, d.diretores.nome))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dados])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qDigitos = soDigitos(busca)
    return dados.filter((d) => {
      // A lixeira é uma visão à parte: ou se olha o que está ativo, ou o
      // que foi excluído. Misturar os dois só confunde quem opera.
      if (!!d.excluida_em !== verLixeira) return false
      if (fStatus.length && !fStatus.includes(d.status)) return false
      if (fEquipe && d.equipe !== fEquipe) return false
      if (fDestino && d.edicoes?.destino !== fDestino) return false
      if (fDiretor && d.diretor_id !== fDiretor) return false
      if (fServico && !(d.servicos ?? []).includes(fServico)) return false
      if (fResponsavel && !(d.responsaveis ?? []).includes(fResponsavel)) return false
      if (!q) return true
      return (
        d.protocolo.toLowerCase().includes(q) ||
        d.solicitante_nome.toLowerCase().includes(q) ||
        d.solicitante_email.toLowerCase().includes(q) ||
        d.colaboradores?.some(
          (c) =>
            c.nome_completo.toLowerCase().includes(q) ||
            (qDigitos.length >= 3 && c.cpf.includes(qDigitos)),
        )
      )
    })
  }, [dados, busca, fStatus, fEquipe, fDestino, fDiretor, fServico, fResponsavel, verLixeira])

  /** Todos os responsaveis que aparecem em alguma solicitacao. */
  const responsaveisDisponiveis = useMemo(
    () => [...new Set(dados.flatMap((d) => d.responsaveis ?? []))].sort(),
    [dados],
  )

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    dados
      .filter((d) => !d.excluida_em)
      .forEach((d) => (c[d.status] = (c[d.status] ?? 0) + 1))
    return c
  }, [dados])

  const naLixeira = useMemo(() => dados.filter((d) => d.excluida_em).length, [dados])

  function exportarCsv() {
    const cab = [
      'Protocolo',
      'Status',
      'Destino',
      'Hotel',
      'Entrada',
      'Saida',
      'Equipe',
      'Pax',
      'Servicos',
      'Inserido no rooming',
      'Responsaveis',
      'Solicitante',
      'Email',
      'WhatsApp',
      'Diretor',
      'Transporte',
      'Modal',
      'Origem',
      'Destino aereo',
      'Locacao carro',
      'Custo total',
      'Criada em',
    ]
    const linhas = filtrados.map((d) => [
      d.protocolo,
      STATUS_LABEL[d.status],
      nomeDestino(d),
      d.edicoes?.hotel ?? '',
      d.data_entrada,
      d.data_saida,
      equipeLabel(d.equipe, d.equipe_outro),
      d.colaboradores?.length ?? 0,
      (d.servicos ?? []).map((sv) => etiquetaServico(sv)).join(' + '),
      // Vazio (e não "Nao") onde não há hospedagem: numa solicitação de carro
      // a pergunta não existe, e "Nao" na planilha pareceria pendência.
      (d.servicos ?? []).some((sv) => SERVICOS_HOSPEDAGEM.includes(sv))
        ? d.rooming_ok
          ? 'Sim'
          : 'Nao'
        : '',
      (d.responsaveis ?? []).join(' + '),
      d.solicitante_nome,
      d.solicitante_email,
      d.solicitante_whatsapp,
      d.diretores?.nome ?? '',
      d.precisa_transporte ? 'Sim' : 'Nao',
      d.modal ?? '',
      d.aeroporto_saida ?? '',
      d.aeroporto_chegada ?? '',
      d.precisa_locacao_carro ? 'Sim' : 'Nao',
      d.custo_total_manual ?? d.custo_total ?? '',
      d.created_at,
    ])
    const csv = [cab, ...linhas]
      .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `solicitacoes-forma9-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const alternarStatus = (s: string) =>
    setFStatus((f) => (f.includes(s) ? f.filter((x) => x !== s) : [...f, s]))

  /**
   * Manda para a lixeira — não apaga.
   *
   * O DELETE de antes levava junto colaboradores, voos, hospedagem e o
   * próprio histórico, e não havia backup para trazer de volta. Agora a
   * linha só é marcada: some das telas e volta com um clique.
   */
  async function excluir(d: Linha) {
    const ok = confirm(
      `Mover a solicitação ${d.protocolo} (${nomeDestino(d)}) para a lixeira?\n\n` +
        'Ela sai da lista, mas continua guardada e pode ser restaurada.\n' +
        'Se a ideia é apenas encerrar, use Cancelar dentro da solicitação.',
    )
    if (!ok) return
    const { error } = await supabase
      .from('solicitacoes')
      .update({ excluida_em: new Date().toISOString(), excluida_por: admin?.nome ?? null })
      .eq('id', d.id)
    if (error) return alert(`Não foi possível excluir: ${error.message}`)
    setDados((ds) =>
      ds.map((x) => (x.id === d.id ? { ...x, excluida_em: new Date().toISOString() } : x)),
    )
  }

  /**
   * Marca que as pessoas já entraram no rooming do hotel.
   *
   * Controle da equipe, não etapa do processo: não mexe em status, não avisa
   * ninguém, não precisa de aprovação. Atualiza a tela na hora e só desfaz se
   * o banco recusar — marcar rooming é o tipo de clique que se dá em série,
   * e esperar ida e volta de rede a cada um travaria o trabalho.
   */
  async function alternarRooming(d: Linha) {
    const novo = !d.rooming_ok
    setDados((ds) => ds.map((x) => (x.id === d.id ? { ...x, rooming_ok: novo } : x)))
    const { error } = await supabase
      .from('solicitacoes')
      .update({ rooming_ok: novo })
      .eq('id', d.id)
    if (error) {
      setDados((ds) => ds.map((x) => (x.id === d.id ? { ...x, rooming_ok: !novo } : x)))
      alert(`Não foi possível marcar o rooming: ${error.message}`)
    }
  }

  /** Devolve para a lista. */
  async function restaurar(d: Linha) {
    const { error } = await supabase
      .from('solicitacoes')
      .update({ excluida_em: null, excluida_por: null })
      .eq('id', d.id)
    if (error) return alert(`Não foi possível restaurar: ${error.message}`)
    setDados((ds) => ds.map((x) => (x.id === d.id ? { ...x, excluida_em: null } : x)))
  }

  return (
    <div className="-mx-2 space-y-4 xl:-mx-6 2xl:-mx-12">
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <h1 className="text-lg font-bold">
          {verLixeira ? 'Lixeira' : 'Solicitações'}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Botao
            variante="secundario"
            onClick={() => setVerLixeira((v) => !v)}
            className={verLixeira ? 'ring-2 ring-neutral-900' : undefined}
          >
            {verLixeira ? '← Voltar às solicitações' : `Lixeira (${naLixeira})`}
          </Botao>
          <Botao variante="secundario" onClick={exportarCsv} disabled={!filtrados.length}>
            Exportar CSV ({filtrados.length})
          </Botao>
        </div>
      </div>

      {/* chips de status */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTROS.map((s) => (
          <button
            key={s}
            onClick={() => alternarStatus(s)}
            className={
              'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ' +
              (fStatus.includes(s)
                ? 'bg-neutral-900 text-white ring-neutral-900'
                : `${STATUS_CLASS[s]} hover:brightness-95`)
            }
          >
            {STATUS_LABEL[s]}
            <span className="ml-1.5 opacity-60">{contagem[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Input
            placeholder="Buscar por protocolo, nome, e-mail ou CPF…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="sm:col-span-2 xl:col-span-2"
          />
          <Select value={fDestino} onChange={(e) => setFDestino(e.target.value)}>
            <option value="">Todos os destinos</option>
            {destinos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select value={fEquipe} onChange={(e) => setFEquipe(e.target.value)}>
            <option value="">Todas as equipes</option>
            {EQUIPES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
          <Select value={fServico} onChange={(e) => setFServico(e.target.value)}>
            <option value="">Todos os serviços</option>
            {SERVICOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            value={fResponsavel}
            onChange={(e) => setFResponsavel(e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {responsaveisDisponiveis.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            value={fDiretor}
            onChange={(e) => setFDiretor(e.target.value)}
          >
            <option value="">Todos os diretores</option>
            {diretores.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {carregando ? (
          <Vazio>Carregando…</Vazio>
        ) : filtrados.length === 0 ? (
          <Vazio>Nenhuma solicitação encontrada com esses filtros.</Vazio>
        ) : (
          <div className="-m-4 divide-y divide-neutral-100">
            {filtrados.map((d) => {
              const temHosp = (d.servicos ?? []).some((sv) =>
                SERVICOS_HOSPEDAGEM.includes(sv),
              )
              return (
                <div
                  key={d.id}
                  className={
                    'group relative flex flex-col gap-3 px-4 py-3.5 pl-5 transition lg:flex-row lg:items-center lg:gap-5 ' +
                    (d.rooming_ok ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-neutral-50')
                  }
                >
                  {/* Faixa de status na borda: dá para varrer a coluna e ver
                      onde cada solicitação está sem ler uma palavra. */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1.5 ${FAIXA_STATUS[d.status] ?? 'bg-neutral-200'}`}
                  />

                  {/* ---- Identificação e destino ---- */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        to={`/admin/solicitacoes/${d.id}`}
                        className="font-mono text-xs font-semibold text-neutral-500 hover:text-neutral-900 hover:underline"
                      >
                        {d.protocolo}
                      </Link>
                      {/* Mais de uma operação: são dois períodos dentro de um
                          pedido só, com voucher e lista próprios. */}
                      {(d.qtd_operacoes ?? 0) > 1 && (
                        <span className="rounded bg-marca-100 px-1.5 py-0.5 text-[11px] font-bold text-neutral-800 ring-1 ring-inset ring-marca-400">
                          {d.qtd_operacoes} operações
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/admin/solicitacoes/${d.id}`}
                      className="mt-1 block truncate text-base font-bold text-neutral-900 hover:underline"
                      title={`${nomeDestino(d)}${d.edicoes?.hotel ? ` — ${d.edicoes.hotel}` : ''}`}
                    >
                      {nomeDestino(d)}
                      {d.edicoes?.hotel && (
                        <span className="ml-1.5 text-sm font-normal text-neutral-500">
                          {d.edicoes.hotel}
                        </span>
                      )}
                    </Link>

                    <p className="mt-0.5 text-xs text-neutral-600">
                      {dataCurta(d.data_entrada)} a {dataCurta(d.data_saida)}
                      {' · '}
                      {equipeLabel(d.equipe, d.equipe_outro)}
                      {' · '}
                      {d.colaboradores?.length ?? 0} pax
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {(d.servicos ?? []).map((sv) => (
                        <span
                          key={sv}
                          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${corServico(sv)}`}
                        >
                          {etiquetaServico(sv)}
                        </span>
                      ))}
                      {(d.servicos ?? []).length === 0 && (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                      {/* Rooming ao lado das etiquetas: é sobre a hospedagem,
                          e é aqui que o olho já está quando procura por ela. */}
                      {temHosp && (
                        <label
                          className={
                            'ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition ' +
                            (d.rooming_ok
                              ? 'bg-emerald-100 text-emerald-800 ring-emerald-400'
                              : 'bg-white text-neutral-500 ring-neutral-300 hover:ring-neutral-400')
                          }
                          title={
                            d.rooming_ok
                              ? 'Inserido no rooming — clique para desmarcar'
                              : 'Marcar como inserido no rooming do hotel'
                          }
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                            checked={!!d.rooming_ok}
                            onChange={() => alternarRooming(d)}
                          />
                          {d.rooming_ok ? 'No rooming' : 'Rooming'}
                        </label>
                      )}
                    </div>
                  </div>

                  {/* ---- Status ----
                      No meio da linha, centralizado: fica na mesma coluna em
                      todas as linhas, então a coluna inteira se lê de uma vez.
                      Junto do protocolo ele dançava conforme o tamanho do
                      número e do badge de operações. */}
                  <div className="flex shrink-0 justify-center lg:w-44">
                    <Etiqueta className={STATUS_CLASS[d.status]}>
                      {STATUS_LABEL[d.status]}
                    </Etiqueta>
                  </div>

                  {/* ---- Pessoas ---- */}
                  <div className="min-w-0 lg:w-56">
                    <p className="truncate text-sm text-neutral-800" title={d.solicitante_nome}>
                      {d.solicitante_nome}
                    </p>
                    <p
                      className="truncate text-xs text-neutral-500"
                      title={d.solicitante_email}
                    >
                      {d.solicitante_email}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      Diretor: {d.diretores?.nome ?? '—'}
                    </p>
                  </div>

                  {/* ---- Responsáveis ---- */}
                  <div className="lg:w-40">
                    {d.responsaveis && d.responsaveis.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {d.responsaveis.map((n) => (
                          <span
                            key={n}
                            title={n}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${corResponsavel(n)}`}
                          >
                            {n.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">ninguém assumiu</span>
                    )}
                  </div>

                  {/* ---- Custo e ação ---- */}
                  <div className="flex items-center justify-between gap-3 lg:w-36 lg:justify-end">
                    <span className="whitespace-nowrap text-base font-bold text-neutral-900">
                      {moeda(d.custo_total_manual ?? d.custo_total)}
                    </span>
                    {verLixeira ? (
                      <button
                        onClick={() => restaurar(d)}
                        title="Restaurar solicitação"
                        aria-label={`Restaurar ${d.protocolo}`}
                        className="rounded px-2 py-1 text-xs font-semibold text-neutral-700 underline decoration-marca-400 decoration-2 underline-offset-2 transition hover:bg-marca-50"
                      >
                        Restaurar
                      </button>
                    ) : (
                      <button
                        onClick={() => excluir(d)}
                        title="Mover para a lixeira"
                        aria-label={`Excluir ${d.protocolo}`}
                        className="rounded p-1.5 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                      >
                        <svg viewBox="0 0 16 16" className="size-4 fill-current">
                          <path d="M6.5 1a.5.5 0 00-.5.5V2H3.5a.5.5 0 000 1H4v9.5A1.5 1.5 0 005.5 14h5a1.5 1.5 0 001.5-1.5V3h.5a.5.5 0 000-1H10v-.5a.5.5 0 00-.5-.5h-3zM5 3h6v9.5a.5.5 0 01-.5.5h-5a.5.5 0 01-.5-.5V3zm1.5 1.5v6h1v-6h-1zm2 0v6h1v-6h-1z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {!carregando && dados.length > 0 && (
        <p className="text-center text-xs text-neutral-400">
          Próximas edições com solicitação pendente:{' '}
          {[
            ...new Set(
              dados
                .filter(
                  (d) =>
                    !['CONCLUIDA', 'CANCELADA', 'REPROVADA'].includes(d.status) &&
                    d.edicoes,
                )
                .sort((a, b) =>
                  a.edicoes.data_inicio.localeCompare(b.edicoes.data_inicio),
                )
                .slice(0, 3)
                .map((d) => `${d.edicoes.destino} (${dataBR(d.edicoes.data_inicio)})`),
            ),
          ].join(' · ') || '—'}
        </p>
      )}
    </div>
  )
}
