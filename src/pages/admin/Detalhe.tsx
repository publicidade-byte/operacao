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
  Rodoviario,
  Solicitacao,
  Status,
  Voo,
} from '../../lib/types'
import { STATUS_CLASS, STATUS_LABEL, aeroportoLabel, equipeLabel } from '../../lib/constants'
import {
  cpfMascarado,
  dataBR,
  dataHoraBR,
  mascaraCpf,
  mascaraTelefone,
  moeda,
  paraInputDateTime,
} from '../../lib/format'
import { Aviso, Botao, Campo, Card, Etiqueta, Input, Select, Textarea } from '../../components/ui'

type Cheia = Solicitacao & {
  edicoes: Edicao
  diretores: Diretor
  colaboradores: Colaborador[]
}

const ABAS = ['Solicitação', 'Operacional', 'Aprovação', 'Histórico'] as const

export default function Detalhe() {
  const { id } = useParams()
  const admin = useAdmin()
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Solicitação')
  const [s, setS] = useState<Cheia | null>(null)
  const [voos, setVoos] = useState<Record<string, Partial<Voo>>>({})
  const [rodo, setRodo] = useState<Record<string, Partial<Rodoviario>>>({})
  const [hosp, setHosp] = useState<Record<string, Partial<HospedagemDetalhe>>>({})
  const [carro, setCarro] = useState<Partial<LocacaoCarro>>({})
  const [eventos, setEventos] = useState<Evento[]>([])
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([])
  const [operacoes, setOperacoes] = useState<Edicao[]>([])
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
    const [v, r, h, l, ev, ap] = await Promise.all([
      supabase.from('voos').select('*').in('colaborador_id', ids),
      supabase.from('transporte_rodoviario').select('*').in('colaborador_id', ids),
      supabase.from('hospedagem_detalhe').select('*').in('colaborador_id', ids),
      supabase.from('locacao_carro').select('*').eq('solicitacao_id', id).maybeSingle(),
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
    ])

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
    setVoos(mv)
    const mr: Record<string, Partial<Rodoviario>> = {}
    ;(r.data ?? []).forEach((x: Rodoviario) => (mr[x.colaborador_id] = x))
    setRodo(mr)
    const mh: Record<string, Partial<HospedagemDetalhe>> = {}
    ;(h.data ?? []).forEach((x: HospedagemDetalhe) => (mh[x.colaborador_id] = x))
    setHosp(mh)
    setCarro((l.data as LocacaoCarro) ?? {})
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

  async function mudarStatus(novo: Status, descricao: string) {
    const { error } = await supabase
      .from('solicitacoes')
      .update({ status: novo, responsavel_id: admin?.id ?? null })
      .eq('id', id)
    if (error) return setMsg({ tom: 'erro', texto: error.message })
    await registrarEvento('STATUS', descricao, { status: novo })
    setMsg({ tom: 'sucesso', texto: descricao })
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
        .map(([colaborador_id, v]) => {
          const { id: _i, ...resto } = v as HospedagemDetalhe
          return { ...limpar(resto), colaborador_id }
        })
      if (upHosp.length)
        await erro(
          supabase
            .from('hospedagem_detalhe')
            .upsert(upHosp, { onConflict: 'colaborador_id' }),
        )

      if (s.precisa_locacao_carro && Object.keys(carro).length) {
        const { id: _i, ...resto } = carro as LocacaoCarro
        await erro(
          supabase
            .from('locacao_carro')
            .upsert({ ...limpar(resto), solicitacao_id: s.id }, {
              onConflict: 'solicitacao_id',
            }),
        )
      }

      // recalcula o custo total no banco
      const { data: custo } = await supabase.rpc('recalcular_custo', {
        p_solicitacao: s.id,
      })
      await supabase.from('solicitacoes').update({ custo_total: custo }).eq('id', s.id)

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

  function revelarCpf(cid: string) {
    setCpfsVisiveis((p) => new Set(p).add(cid))
    registrarEvento('CPF_REVELADO', 'CPF visualizado no painel', { colaborador_id: cid })
  }

  if (!s)
    return <p className="py-16 text-center text-sm text-neutral-500">Carregando…</p>

  const podeEditar = !['AGUARDANDO_APROVACAO', 'CONCLUIDA', 'CANCELADA'].includes(s.status)
  const custo = s.custo_total_manual ?? s.custo_total

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
            {s.edicoes.destino} — {s.edicoes.hotel} · {dataBR(s.data_entrada)} a{' '}
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
          {s.status === 'EM_PREENCHIMENTO' && (
            <Botao
              onClick={async () => {
                setSalvando(true)
                try {
                  await invocar('notificar-slack', { solicitacao_id: s.id })
                  await mudarStatus(
                    'AGUARDANDO_APROVACAO',
                    `Enviada para aprovação de ${s.diretores.nome} via Slack`,
                  )
                } catch (e) {
                  setMsg({
                    tom: 'erro',
                    texto:
                      (e instanceof Error ? e.message : 'Falha no Slack') +
                      ' — o status não foi alterado.',
                  })
                } finally {
                  setSalvando(false)
                }
              }}
              carregando={salvando}
            >
              Enviar para aprovação ({s.diretores.nome})
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
                try {
                  await invocar('enviar-confirmacao', { solicitacao_id: s.id })
                  await mudarStatus('CONCLUIDA', 'Confirmação enviada ao solicitante')
                } catch (e) {
                  setMsg({
                    tom: 'erro',
                    texto: e instanceof Error ? e.message : 'Falha ao enviar e-mail',
                  })
                } finally {
                  setSalvando(false)
                }
              }}
              carregando={salvando}
            >
              Enviar confirmação por e-mail
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
                {s.edicoes.destino} — {s.edicoes.hotel}
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
              <L t="Tipo de hospedagem">
                {s.tipo_hospedagem === 'HOTEL_PAX' ? 'Hotel do pax' : 'Fora do hotel do pax'}
              </L>
              <L t="Equipe">{equipeLabel(s.equipe, s.equipe_outro)}</L>
              <L t="Transporte">
                {!s.precisa_transporte
                  ? 'Não solicitado'
                  : s.modal === 'AEREO'
                    ? 'Aéreo'
                    : 'Rodoviário'}
              </L>
              {s.modal === 'AEREO' && (
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
              <L t="Locação de carro">
                {s.precisa_locacao_carro ? `Sim — ${s.obs_locacao_carro ?? ''}` : 'Não'}
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
          {s.colaboradores.map((c, idx) => (
            <Card
              key={c.id}
              titulo={`${idx + 1}. ${c.nome_completo}`}
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
                {s.precisa_transporte && s.modal === 'AEREO' && (
                  <>
                    <BlocoVoo
                      titulo="Voo de ida"
                      valor={voos[`${c.id}:IDA`] ?? {}}
                      editavel={podeEditar}
                      onChange={(v) => setVoos((p) => ({ ...p, [`${c.id}:IDA`]: v }))}
                    />
                    <BlocoVoo
                      titulo="Voo de volta"
                      valor={voos[`${c.id}:VOLTA`] ?? {}}
                      editavel={podeEditar}
                      onChange={(v) => setVoos((p) => ({ ...p, [`${c.id}:VOLTA`]: v }))}
                    />
                  </>
                )}

                {s.precisa_transporte && s.modal === 'RODOVIARIO' && (
                  <BlocoRodoviario
                    valor={rodo[c.id] ?? {}}
                    editavel={podeEditar}
                    onChange={(v) => setRodo((p) => ({ ...p, [c.id]: v }))}
                  />
                )}

                <BlocoHospedagem
                  valor={hosp[c.id] ?? {}}
                  editavel={podeEditar}
                  padraoHotel={s.edicoes.hotel}
                  padraoIn={s.data_entrada}
                  padraoOut={s.data_saida}
                  onChange={(v) => setHosp((p) => ({ ...p, [c.id]: v }))}
                />
              </div>
            </Card>
          ))}

          {s.precisa_locacao_carro && (
            <Card titulo="Locação de carro">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Campo label="Locadora" obrigatorio={false}>
                  <Input
                    disabled={!podeEditar}
                    value={carro.locadora ?? ''}
                    onChange={(e) => setCarro({ ...carro, locadora: e.target.value })}
                  />
                </Campo>
                <Campo label="Categoria" obrigatorio={false}>
                  <Input
                    disabled={!podeEditar}
                    value={carro.categoria ?? ''}
                    onChange={(e) => setCarro({ ...carro, categoria: e.target.value })}
                  />
                </Campo>
                <Campo label="Condutor" obrigatorio={false}>
                  <Select
                    disabled={!podeEditar}
                    value={carro.condutor_colaborador_id ?? ''}
                    onChange={(e) =>
                      setCarro({ ...carro, condutor_colaborador_id: e.target.value || null })
                    }
                  >
                    <option value="">Selecione…</option>
                    {s.colaboradores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome_completo}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Local de retirada" obrigatorio={false}>
                  <Input
                    disabled={!podeEditar}
                    value={carro.retirada_local ?? ''}
                    onChange={(e) => setCarro({ ...carro, retirada_local: e.target.value })}
                  />
                </Campo>
                <Campo label="Retirada em" obrigatorio={false}>
                  <Input
                    type="datetime-local"
                    disabled={!podeEditar}
                    value={paraInputDateTime(carro.retirada_em)}
                    onChange={(e) =>
                      setCarro({ ...carro, retirada_em: e.target.value || null })
                    }
                  />
                </Campo>
                <Campo label="Preço (R$)" obrigatorio={false}>
                  <Input
                    type="number"
                    step="0.01"
                    disabled={!podeEditar}
                    value={carro.preco ?? ''}
                    onChange={(e) =>
                      setCarro({ ...carro, preco: e.target.value ? +e.target.value : null })
                    }
                  />
                </Campo>
                <Campo label="Local de devolução" obrigatorio={false}>
                  <Input
                    disabled={!podeEditar}
                    value={carro.devolucao_local ?? ''}
                    onChange={(e) => setCarro({ ...carro, devolucao_local: e.target.value })}
                  />
                </Campo>
                <Campo label="Devolução em" obrigatorio={false}>
                  <Input
                    type="datetime-local"
                    disabled={!podeEditar}
                    value={paraInputDateTime(carro.devolucao_em)}
                    onChange={(e) =>
                      setCarro({ ...carro, devolucao_em: e.target.value || null })
                    }
                  />
                </Campo>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Campo label="Observações" obrigatorio={false}>
                    <Textarea
                      rows={2}
                      disabled={!podeEditar}
                      value={carro.observacoes ?? ''}
                      onChange={(e) => setCarro({ ...carro, observacoes: e.target.value })}
                    />
                  </Campo>
                </div>
              </div>
            </Card>
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
      const base = p[origemId]
      if (!base) return p
      const n = { ...p }
      alvos.forEach((c) => {
        const { id: _i, codigo_reserva: _r, dividindo_com: _d, ...resto } = base as HospedagemDetalhe
        n[c.id] = { ...resto, colaborador_id: c.id }
      })
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
        <Campo label="Partida" obrigatorio={false}>
          <Input
            type="datetime-local"
            disabled={!editavel}
            value={paraInputDateTime(valor.partida)}
            onChange={(e) => up('partida', e.target.value || null)}
          />
        </Campo>
        <Campo label="Chegada" obrigatorio={false}>
          <Input
            type="datetime-local"
            disabled={!editavel}
            value={paraInputDateTime(valor.chegada)}
            onChange={(e) => up('chegada', e.target.value || null)}
          />
        </Campo>
        <Campo label="Localizador" obrigatorio={false}>
          <Input
            disabled={!editavel}
            value={valor.localizador ?? ''}
            onChange={(e) => up('localizador', e.target.value.toUpperCase())}
            className="font-mono"
          />
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
        <Campo label="Horário de ida" obrigatorio={false}>
          <Input
            type="datetime-local"
            disabled={!editavel}
            value={paraInputDateTime(valor.horario_ida)}
            onChange={(e) => up('horario_ida', e.target.value || null)}
          />
        </Campo>
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
        <Campo label="Horário de volta" obrigatorio={false}>
          <Input
            type="datetime-local"
            disabled={!editavel}
            value={paraInputDateTime(valor.horario_volta)}
            onChange={(e) => up('horario_volta', e.target.value || null)}
          />
        </Campo>
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

function BlocoHospedagem({
  valor,
  editavel,
  padraoHotel,
  padraoIn,
  padraoOut,
  onChange,
}: {
  valor: Partial<HospedagemDetalhe>
  editavel: boolean
  padraoHotel: string
  padraoIn: string
  padraoOut: string
  onChange: (v: Partial<HospedagemDetalhe>) => void
}) {
  const up = (k: keyof HospedagemDetalhe, v: unknown) => onChange({ ...valor, [k]: v })
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-3.5">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Hospedagem
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Campo label="Hotel" obrigatorio={false}>
            <Input
              disabled={!editavel}
              value={valor.hotel ?? ''}
              placeholder={padraoHotel}
              onChange={(e) => up('hotel', e.target.value)}
            />
          </Campo>
        </div>
        <Campo label="Tipo de quarto" obrigatorio={false}>
          <Input disabled={!editavel} value={valor.tipo_quarto ?? ''} onChange={(e) => up('tipo_quarto', e.target.value)} />
        </Campo>
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
        <Campo label="Valor da diária (R$)" obrigatorio={false}>
          <Input
            type="number"
            step="0.01"
            disabled={!editavel}
            value={valor.valor_diaria ?? ''}
            onChange={(e) => up('valor_diaria', e.target.value ? +e.target.value : null)}
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
            <p className="text-sm text-neutral-600">
              Enquanto estiver neste status, os dados ficam travados para edição. Se
              precisar corrigir algo, use <strong>Reabrir para edição</strong> — isso
              cancela a pendência e exige um novo envio.
            </p>
          </div>
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
                <p className="mt-1.5 text-xs text-neutral-500">
                  {solicitacao.diretores.nome} · {dataHoraBR(a.decidido_em)}
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
