import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Diretor, Edicao, Solicitacao } from '../../lib/types'
import {
  EQUIPES,
  STATUS_CLASS,
  STATUS_LABEL,
  equipeLabel,
} from '../../lib/constants'
import { dataBR, dataCurta, moeda, soDigitos } from '../../lib/format'
import { Botao, Card, Etiqueta, Input, Select, Vazio } from '../../components/ui'

type Linha = Solicitacao & {
  edicoes: Edicao
  diretores: Diretor
  colaboradores: { id: string; nome_completo: string; cpf: string }[]
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
  const [dados, setDados] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState<string[]>([])
  const [fEquipe, setFEquipe] = useState('')
  const [fDestino, setFDestino] = useState('')
  const [fDiretor, setFDiretor] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('solicitacoes')
        .select(
          '*, edicoes(*), diretores(*), colaboradores(id, nome_completo, cpf)',
        )
        .order('created_at', { ascending: false })
      setDados((data ?? []) as Linha[])
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
      if (fStatus.length && !fStatus.includes(d.status)) return false
      if (fEquipe && d.equipe !== fEquipe) return false
      if (fDestino && d.edicoes?.destino !== fDestino) return false
      if (fDiretor && d.diretor_id !== fDiretor) return false
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
  }, [dados, busca, fStatus, fEquipe, fDestino, fDiretor])

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    dados.forEach((d) => (c[d.status] = (c[d.status] ?? 0) + 1))
    return c
  }, [dados])

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
      d.edicoes?.destino ?? '',
      d.edicoes?.hotel ?? '',
      d.data_entrada,
      d.data_saida,
      equipeLabel(d.equipe),
      d.colaboradores?.length ?? 0,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Solicitações</h1>
        <Botao variante="secundario" onClick={exportarCsv} disabled={!filtrados.length}>
          Exportar CSV ({filtrados.length})
        </Botao>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Buscar por protocolo, nome, e-mail ou CPF…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="lg:col-span-2"
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
          <Select
            value={fDiretor}
            onChange={(e) => setFDiretor(e.target.value)}
            className="lg:col-span-2"
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
          <div className="-m-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Protocolo</th>
                  <th className="px-4 py-2.5 font-medium">Destino</th>
                  <th className="px-4 py-2.5 font-medium">Período</th>
                  <th className="px-4 py-2.5 font-medium">Equipe</th>
                  <th className="px-4 py-2.5 text-center font-medium">Pax</th>
                  <th className="px-4 py-2.5 font-medium">Solicitante</th>
                  <th className="px-4 py-2.5 font-medium">Diretor</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtrados.map((d) => (
                  <tr key={d.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/admin/solicitacoes/${d.id}`}
                        className="font-mono text-xs font-semibold text-neutral-700 hover:underline"
                      >
                        {d.protocolo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{d.edicoes?.destino}</span>
                      <span className="block text-xs text-neutral-500">
                        {d.edicoes?.hotel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-600">
                      {dataCurta(d.data_entrada)} a {dataCurta(d.data_saida)}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{equipeLabel(d.equipe)}</td>
                    <td className="px-4 py-2.5 text-center text-neutral-600">
                      {d.colaboradores?.length ?? 0}
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
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-neutral-700">
                      {moeda(d.custo_total_manual ?? d.custo_total)}
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
