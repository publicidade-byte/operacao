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
}

/** Rótulos curtos, para caber na coluna da tabela. */
const SERVICO_CURTO: Record<string, string> = {
  AEREO: 'Aéreo',
  HOSPEDAGEM: 'Hospedagem',
  CARRO: 'Carro',
  VAN: 'Van/Ônibus',
  RODOVIARIO: 'Rodoviário',
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
      (d.servicos ?? []).map((sv) => SERVICO_CURTO[sv] ?? sv).join(' + '),
      // Vazio (e não "Nao") onde não há hospedagem: numa solicitação de carro
      // a pergunta não existe, e "Nao" na planilha pareceria pendência.
      (d.servicos ?? []).includes('HOSPEDAGEM') ? (d.rooming_ok ? 'Sim' : 'Nao') : '',
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
          <div className="scroll-fino -m-4 overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Protocolo</th>
                  <th className="px-4 py-2.5 font-medium">Destino</th>
                  <th className="px-4 py-2.5 font-medium">Período</th>
                  <th className="px-4 py-2.5 font-medium">Equipe</th>
                  <th className="px-4 py-2.5 text-center font-medium">Pax</th>
                  <th className="px-4 py-2.5 font-medium">Solicitado</th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    Inserido no
                    <br />
                    Rooming
                  </th>
                  <th className="px-4 py-2.5 font-medium">Solicitante</th>
                  <th className="px-4 py-2.5 font-medium">Diretor</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Responsáveis</th>
                  <th className="px-4 py-2.5 text-right font-medium">Custo</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtrados.map((d) => (
                  <tr
                    key={d.id}
                    className={
                      // Verde discreto e uma faixa na borda: dá para varrer a
                      // lista e ver o que já foi feito sem ler linha por linha,
                      // e o texto continua legível por cima.
                      d.rooming_ok
                        ? 'bg-emerald-50 hover:bg-emerald-100/70 border-l-2 border-l-emerald-500'
                        : 'hover:bg-neutral-50'
                    }
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/admin/solicitacoes/${d.id}`}
                        className="font-mono text-xs font-semibold text-neutral-700 hover:underline"
                      >
                        {d.protocolo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{nomeDestino(d)}</span>
                      <span className="block text-xs text-neutral-500">
                        {d.edicoes?.hotel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-600">
                      {dataCurta(d.data_entrada)} a {dataCurta(d.data_saida)}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{equipeLabel(d.equipe, d.equipe_outro)}</td>
                    <td className="px-4 py-2.5 text-center text-neutral-600">
                      {d.colaboradores?.length ?? 0}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(d.servicos ?? []).map((sv) => (
                          <span
                            key={sv}
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${corServico(sv)}`}
                          >
                            {SERVICO_CURTO[sv] ?? sv}
                          </span>
                        ))}
                        {(d.servicos ?? []).length === 0 && (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </div>
                    </td>
                    {/* Controle de rooming.
                        Só existe onde há hospedagem — numa solicitação de
                        carro não há hotel em que inserir ninguém, e uma
                        caixinha marcável ali só convidaria a marcar errado. */}
                    <td className="px-3 py-2.5 text-center">
                      {(d.servicos ?? []).includes('HOSPEDAGEM') ? (
                        <label
                          className="inline-flex cursor-pointer items-center justify-center"
                          title={
                            d.rooming_ok
                              ? 'Inserido no rooming — clique para desmarcar'
                              : 'Marcar como inserido no rooming do hotel'
                          }
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-emerald-600"
                            checked={!!d.rooming_ok}
                            onChange={() => alternarRooming(d)}
                          />
                          <span className="sr-only">
                            Inserido no rooming — {d.protocolo}
                          </span>
                        </label>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-neutral-700">{d.solicitante_nome}</span>
                      <span className="block text-xs text-neutral-500">
                        {d.solicitante_email}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{d.diretores?.nome}</td>
                    <td className="px-4 py-2.5">
                      <Etiqueta className={STATUS_CLASS[d.status]}>
                        {STATUS_LABEL[d.status]}
                      </Etiqueta>
                    </td>
                    <td className="px-4 py-2.5">
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
                        <span className="text-xs text-neutral-400">ninguém</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-neutral-700">
                      {moeda(d.custo_total_manual ?? d.custo_total)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
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
                        className="rounded p-1.5 text-neutral-300 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <svg viewBox="0 0 16 16" className="size-4 fill-current">
                          <path d="M6.5 1a.5.5 0 00-.5.5V2H3.5a.5.5 0 000 1H4v9.5A1.5 1.5 0 005.5 14h5a1.5 1.5 0 001.5-1.5V3h.5a.5.5 0 000-1H10v-.5a.5.5 0 00-.5-.5h-3zM5 3h6v9.5a.5.5 0 01-.5.5h-5a.5.5 0 01-.5-.5V3zm1.5 1.5v6h1v-6h-1zm2 0v6h1v-6h-1z" />
                        </svg>
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
