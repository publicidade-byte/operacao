import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { EtapaEdicao, EtapaModelo, PainelEtapas } from '../../lib/types'
import { dataCurta } from '../../lib/format'
import { corResponsavel } from '../../lib/constants'
import { Card, Etiqueta, Input, Select, Vazio } from '../../components/ui'

type Situacao = 'concluida' | 'atrasada' | 'aberta'

/** Dias entre hoje e a data, negativo se já passou. */
const diasAte = (iso: string) =>
  Math.round((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86_400_000)

/**
 * Uma etapa só é cobrada se tem prazo. `prazo_dias` conta a partir do início
 * da viagem: voucher com prazo 7 vence uma semana antes do embarque.
 */
function situacao(
  etapa: EtapaEdicao,
  modelo: EtapaModelo,
  dataInicio: string,
): Situacao {
  if (etapa.concluida) return 'concluida'
  if (modelo.prazo_dias == null) return 'aberta'
  return diasAte(dataInicio) <= modelo.prazo_dias ? 'atrasada' : 'aberta'
}

const COR: Record<Situacao, string> = {
  concluida: 'bg-emerald-500',
  atrasada: 'bg-red-500',
  aberta: 'bg-neutral-200',
}

export default function Painel() {
  const [modelos, setModelos] = useState<EtapaModelo[]>([])
  const [etapas, setEtapas] = useState<EtapaEdicao[]>([])
  const [operacoes, setOperacoes] = useState<PainelEtapas[]>([])
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [fSituacao, setFSituacao] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [m, ee, p, eq] = await Promise.all([
        supabase.from('etapas_modelo').select('*').eq('ativa', true).order('ordem'),
        supabase.from('etapas_edicao').select('*'),
        supabase.from('v_painel_etapas').select('*').order('data_inicio'),
        supabase.from('v_equipe').select('id, nome'),
      ])
      if (!vivo) return
      const falha = m.error ?? ee.error ?? p.error
      if (falha) {
        setErro(falha.message)
        return setCarregando(false)
      }
      setModelos((m.data ?? []) as EtapaModelo[])
      setEtapas((ee.data ?? []) as EtapaEdicao[])
      setOperacoes((p.data ?? []) as PainelEtapas[])
      setNomes(new Map((eq.data ?? []).map((u) => [u.id as string, u.nome as string])))
      setCarregando(false)
    })()

    // Duas pessoas marcando ao mesmo tempo: o que uma conclui aparece na tela
    // da outra sem recarregar. É o que a planilha compartilhada já dava e o
    // painel não podia perder.
    const canal = supabase
      .channel('etapas-do-painel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'etapas_edicao' },
        ({ new: nova }) => {
          const linha = nova as EtapaEdicao
          setEtapas((es) => es.map((e) => (e.id === linha.id ? linha : e)))
        },
      )
      .subscribe()

    return () => {
      vivo = false
      supabase.removeChannel(canal)
    }
  }, [])

  const modeloPor = useMemo(
    () => new Map(modelos.map((m) => [m.codigo, m])),
    [modelos],
  )
  const porEdicao = useMemo(() => {
    const m = new Map<string, EtapaEdicao[]>()
    for (const e of etapas) {
      const lista = m.get(e.edicao_id) ?? []
      lista.push(e)
      m.set(e.edicao_id, lista)
    }
    return m
  }, [etapas])

  /** Recontagem no cliente: a view dá o número certo na carga, mas depois de
   *  um clique quem está atualizado é o estado local. */
  const linhas = useMemo(
    () =>
      operacoes.map((op) => {
        const lista = (porEdicao.get(op.edicao_id) ?? [])
          .filter((e) => modeloPor.has(e.etapa_codigo))
          .sort(
            (a, b) =>
              modeloPor.get(a.etapa_codigo)!.ordem -
              modeloPor.get(b.etapa_codigo)!.ordem,
          )
        const sit = lista.map((e) =>
          situacao(e, modeloPor.get(e.etapa_codigo)!, op.data_inicio),
        )
        return {
          op,
          lista,
          sit,
          concluidas: sit.filter((s) => s === 'concluida').length,
          atrasadas: sit.filter((s) => s === 'atrasada').length,
          voucher: lista.find((e) => e.etapa_codigo === 'VOUCHER')?.concluida ?? false,
        }
      }),
    [operacoes, porEdicao, modeloPor],
  )

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (fSituacao === 'atrasadas' && !l.atrasadas) return false
      if (fSituacao === 'abertas' && l.concluidas === l.lista.length) return false
      if (fSituacao === 'sem_voucher' && l.voucher) return false
      if (!q) return true
      return (
        l.op.destino.toLowerCase().includes(q) || l.op.hotel.toLowerCase().includes(q)
      )
    })
  }, [linhas, busca, fSituacao])

  const resumo = useMemo(
    () => ({
      operacoes: linhas.length,
      atrasadas: linhas.filter((l) => l.atrasadas > 0).length,
      semVoucher: linhas.filter((l) => !l.voucher).length,
      fechadas: linhas.filter((l) => l.concluidas === l.lista.length).length,
    }),
    [linhas],
  )

  async function alternar(etapa: EtapaEdicao) {
    setSalvando(etapa.id)
    const { data, error } = await supabase
      .from('etapas_edicao')
      .update({ concluida: !etapa.concluida })
      .eq('id', etapa.id)
      .select()
      .single()
    setSalvando(null)
    if (error) return alert(`Não foi possível marcar a etapa: ${error.message}`)
    setEtapas((es) => es.map((e) => (e.id === etapa.id ? (data as EtapaEdicao) : e)))
  }

  if (carregando) return <Vazio>Carregando o painel…</Vazio>
  if (erro)
    return (
      <Card>
        <p className="text-sm text-red-700">
          Não foi possível carregar as etapas: {erro}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Se a mensagem fala em tabela inexistente, falta rodar a migration
          <code className="mx-1 rounded bg-neutral-100 px-1">
            20260811000000_etapas_da_operacao.sql
          </code>
          no Supabase.
        </p>
      </Card>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Painel da operação</h1>
        <span className="text-xs text-neutral-500">
          Atualiza sozinho quando alguém da equipe marca uma etapa.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { rotulo: 'Operações no período', valor: resumo.operacoes, tom: '' },
          { rotulo: 'Com etapa atrasada', valor: resumo.atrasadas, tom: 'text-red-600' },
          { rotulo: 'Sem voucher enviado', valor: resumo.semVoucher, tom: '' },
          { rotulo: 'Checklist completo', valor: resumo.fechadas, tom: 'text-emerald-600' },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-xl bg-neutral-50 px-4 py-3">
            <p className="text-xs text-neutral-500">{c.rotulo}</p>
            <p className={`text-2xl font-semibold ${c.tom}`}>{c.valor}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="Buscar por operação ou hotel…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="sm:col-span-2"
          />
          <Select value={fSituacao} onChange={(e) => setFSituacao(e.target.value)}>
            <option value="">Todas as operações</option>
            <option value="atrasadas">Só as atrasadas</option>
            <option value="abertas">Com etapa pendente</option>
            <option value="sem_voucher">Voucher não enviado</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtradas.length === 0 ? (
          <Vazio>Nenhuma operação com esses filtros.</Vazio>
        ) : (
          <div className="-m-4 divide-y divide-neutral-100">
            {filtradas.map(({ op, lista, sit, concluidas, atrasadas }) => (
              <div key={op.edicao_id}>
                <button
                  onClick={() =>
                    setAberta((a) => (a === op.edicao_id ? null : op.edicao_id))
                  }
                  className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-neutral-50"
                >
                  <div className="w-52 shrink-0">
                    <span className="text-sm font-medium">{op.destino}</span>
                    <span className="block text-xs text-neutral-500">
                      {dataCurta(op.data_inicio)} a {dataCurta(op.data_fim)} ·{' '}
                      {op.hotel}
                    </span>
                  </div>

                  {/* A barra é a linha da planilha: um quadradinho por etapa,
                      na mesma ordem, com o voucher partindo as duas fases. */}
                  <div className="flex flex-1 items-center gap-[3px]">
                    {sit.map((s, i) => (
                      <span
                        key={lista[i].id}
                        title={`${modeloPor.get(lista[i].etapa_codigo)?.nome}: ${
                          s === 'concluida'
                            ? 'concluída'
                            : s === 'atrasada'
                              ? 'atrasada'
                              : 'não iniciada'
                        }`}
                        className={
                          'h-2.5 flex-1 rounded-sm ' +
                          COR[s] +
                          (lista[i].etapa_codigo === 'VOUCHER'
                            ? ' ring-2 ring-inset ring-neutral-900/30'
                            : '')
                        }
                      />
                    ))}
                  </div>

                  <div className="w-28 shrink-0 text-right">
                    {atrasadas > 0 ? (
                      <Etiqueta className="bg-red-50 text-red-700 ring-red-200">
                        {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}
                      </Etiqueta>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        {concluidas}/{lista.length}
                      </span>
                    )}
                  </div>
                </button>

                {aberta === op.edicao_id && (
                  <ul className="divide-y divide-neutral-100 border-t border-neutral-100 bg-neutral-50/60">
                    {lista.map((e, i) => {
                      const modelo = modeloPor.get(e.etapa_codigo)!
                      const quem = e.concluida_por ? nomes.get(e.concluida_por) : null
                      return (
                        <li key={e.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-white">
                            <input
                              type="checkbox"
                              checked={e.concluida}
                              disabled={salvando === e.id}
                              onChange={() => alternar(e)}
                              className="size-4 rounded border-neutral-300 accent-neutral-900"
                            />
                            <span
                              className={
                                'flex-1 text-sm ' +
                                (e.concluida
                                  ? 'text-neutral-400 line-through'
                                  : sit[i] === 'atrasada'
                                    ? 'font-medium text-red-700'
                                    : 'text-neutral-700')
                              }
                            >
                              {modelo.nome}
                              {modelo.prazo_dias != null && !e.concluida && (
                                <span className="ml-2 text-xs text-neutral-400">
                                  até {modelo.prazo_dias} dias antes da viagem
                                </span>
                              )}
                            </span>
                            {quem ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${corResponsavel(quem)}`}
                              >
                                {quem.split(' ')[0]}
                              </span>
                            ) : null}
                            <span className="w-24 text-right text-xs text-neutral-400">
                              {e.concluida_em ? dataCurta(e.concluida_em.slice(0, 10)) : '—'}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500" /> concluída
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-500" /> atrasada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-neutral-200" /> não iniciada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-neutral-200 ring-2 ring-inset ring-neutral-900/30" />{' '}
          voucher (divide as duas fases)
        </span>
      </div>
    </div>
  )
}
