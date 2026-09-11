import { useCallback, useEffect, useMemo, useState } from 'react'
import { invocar } from '../lib/supabase'
import {
  EQUIPES,
  STATUS_CLASS,
  STATUS_LABEL,
  aeroportoLabel,
  equipeLabel,
  servicoLabel,
} from '../lib/constants'
import { dataBR, dataHora, dataHoraBR, mascaraCpf } from '../lib/format'
import {
  Aviso,
  Botao,
  Campo,
  Card,
  Etiqueta,
  Input,
  Marca,
  Select,
  Vazio,
} from '../components/ui'

/**
 * Painel de consulta compartilhado.
 *
 * Senha única, sem usuário: várias pessoas da Forma acompanham o andamento
 * e pegam os dados da viagem. A senha fica guardada na sessão do navegador —
 * fechou a aba, pede de novo.
 */

type Resumo = {
  id: string
  protocolo: string
  status: string
  servicos: string[]
  equipe: string
  equipe_outro: string | null
  data_entrada: string
  data_saida: string
  solicitante_nome: string
  destino: string
  hotel: string
  qtd_pax: number
  /** Nomes de quem viaja — só para a busca. */
  colaboradores?: string[]
  /** Marcado no painel quando a passagem é emitida. */
  aereo_emitido?: boolean
}

const CHAVE = 'f9:consulta'

export default function Consulta() {
  const [senha, setSenha] = useState(() => sessionStorage.getItem(CHAVE) ?? '')
  const [autenticado, setAutenticado] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [lista, setLista] = useState<Resumo[]>([])
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Record<string, unknown> | null>(null)

  const carregarLista = useCallback(
    async (s: string) => {
      setCarregando(true)
      setErro('')
      try {
        const r = await invocar<{ solicitacoes: Resumo[] }>('consulta-publica', {
          senha: s,
        })
        setLista(r.solicitacoes)
        setAutenticado(true)
        sessionStorage.setItem(CHAVE, s)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível consultar.')
        setAutenticado(false)
        sessionStorage.removeItem(CHAVE)
      } finally {
        setCarregando(false)
      }
    },
    [],
  )

  useEffect(() => {
    const guardada = sessionStorage.getItem(CHAVE)
    if (guardada) carregarLista(guardada)
  }, [carregarLista])

  async function abrir(id: string) {
    if (aberta === id) {
      setAberta(null)
      return
    }
    setAberta(id)
    setDetalhe(null)
    try {
      const r = await invocar<Record<string, unknown>>('consulta-publica', {
        senha,
        solicitacao_id: id,
      })
      setDetalhe(r)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir a solicitação.')
    }
  }

  const filtrados = useMemo(() => {
    // Busca sem acento e sem caixa: "joao" acha "João", que é como as pessoas
    // digitam na pressa.
    const norm = (x: string) =>
      x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const q = norm(busca.trim())
    return lista.filter((d) => {
      if (fStatus && d.status !== fStatus) return false
      if (fEquipe && d.equipe !== fEquipe) return false
      if (!q) return true
      return (
        norm(d.protocolo).includes(q) ||
        norm(d.destino ?? '').includes(q) ||
        norm(d.solicitante_nome).includes(q) ||
        // Quem viaja: é o nome que a pessoa lembra quando vem perguntar
        // "cadê a passagem do Fulano?" — raramente o protocolo.
        (d.colaboradores ?? []).some((n) => norm(n).includes(q))
      )
    })
  }, [lista, busca, fStatus, fEquipe])

  // ---------- tela de senha ----------
  if (!autenticado)
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-100 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <Marca sub="Consulta de solicitações" />
          </div>
          <Card>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                carregarLista(senha)
              }}
              className="space-y-4"
            >
              <Campo label="Senha de consulta">
                <Input
                  type="password"
                  value={senha}
                  autoComplete="off"
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </Campo>
              {erro && <Aviso tom="erro">{erro}</Aviso>}
              <Botao type="submit" className="w-full" carregando={carregando}>
                Consultar
              </Botao>
            </form>
          </Card>
          <p className="mt-4 text-center text-xs leading-relaxed text-neutral-500">
            Senha compartilhada da equipe. Aqui você acompanha o andamento e pega os
            dados da viagem — não é possível alterar nada.
          </p>
        </div>
      </div>
    )

  // ---------- painel ----------
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Marca sub="Consulta de solicitações" />
          <button
            onClick={() => {
              sessionStorage.removeItem(CHAVE)
              setAutenticado(false)
              setSenha('')
            }}
            className="rounded px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input
              placeholder="Buscar por protocolo, destino, solicitante ou colaborador…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="sm:col-span-2"
            />
            {/* Mesma lista de equipes do formulário: o filtro precisa
                oferecer exatamente o que o solicitante pôde escolher. */}
            <Select value={fEquipe} onChange={(e) => setFEquipe(e.target.value)}>
              <option value="">Todas as equipes</option>
              {EQUIPES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label.replace(/ — informar a área$/, '')}
                </option>
              ))}
            </Select>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        {filtrados.length === 0 ? (
          <Card>
            <Vazio>Nenhuma solicitação encontrada.</Vazio>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtrados.map((d) => (
              <Card key={d.id} className="overflow-hidden">
                <button
                  onClick={() => abrir(d.id)}
                  className="-m-4 flex w-[calc(100%+2rem)] flex-wrap items-center justify-between gap-3 p-4 text-left transition hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-neutral-500">
                        {d.protocolo}
                      </span>
                      <Etiqueta className={STATUS_CLASS[d.status]}>
                        {STATUS_LABEL[d.status]}
                      </Etiqueta>
                    </div>
                    <p className="mt-1 font-bold text-neutral-900">
                      {d.destino} — {d.hotel}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {equipeLabel(d.equipe, d.equipe_outro)} · {d.qtd_pax} pax ·{' '}
                      {dataBR(d.data_entrada)} a {dataBR(d.data_saida)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Solicitado por {d.solicitante_nome} ·{' '}
                      {(d.servicos ?? []).map((s) => servicoLabel(s)).join(' · ')}
                      {/* Emitido é o que quem consulta mais quer saber: a
                          passagem já existe? Mesma pílula verde do painel. */}
                      {d.aereo_emitido && (d.servicos ?? []).includes('AEREO') && (
                        <span className="ml-2 whitespace-nowrap rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-emerald-700">
                          AÉREO EMITIDO
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-neutral-600">
                    {aberta === d.id ? 'fechar ▴' : 'ver detalhes ▾'}
                  </span>
                </button>

                {aberta === d.id && (
                  <div className="mt-5 border-t border-neutral-100 pt-4">
                    {!detalhe ? (
                      <p className="text-sm text-neutral-500">Carregando…</p>
                    ) : (
                      <DetalheConsulta dados={detalhe} />
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Voo com alguma informação de verdade — não a linha vazia do pré-preenchimento. */
const temVoo = (v: any) =>
  !!(v.companhia || v.numero_voo || v.localizador || v.partida_hora || v.preco)

/** Rodoviário com alguma informação de verdade, de ida ou de volta. */
const temRodo = (r: any) =>
  !!(
    r.empresa ||
    r.numero_onibus ||
    r.ida_hora ||
    r.volta_hora ||
    r.local_embarque_ida ||
    r.local_embarque_volta
  )

function DetalheConsulta({ dados }: { dados: any }) {
  const s = dados.solicitacao
  const voos = dados.voos ?? []
  const hosp = dados.hospedagem ?? []
  const rodo = dados.rodoviario ?? []

  return (
    <div className="space-y-5 text-sm">
      <Bloco titulo="Pessoas">
        <ul className="space-y-1">
          {(s.colaboradores ?? []).map((c: any) => (
            <li key={c.id}>
              <span
                className={
                  'font-medium ' +
                  (c.aprovacao === false
                    ? 'text-red-700 line-through'
                    : 'text-neutral-900')
                }
              >
                {c.nome_completo}
              </span>
              {/* Reprovado pelo diretor: continua na lista porque a equipe
                  precisa saber que ele foi pedido e barrado, mas riscado para
                  ninguém emitir nada no nome dele. */}
              {c.aprovacao === false && (
                <span className="ml-2 text-xs font-semibold text-red-700">
                  não aprovado{c.aprovacao_obs ? ` — ${c.aprovacao_obs}` : ''}
                </span>
              )}
              <span className="ml-2 text-xs text-neutral-500">
                CPF {mascaraCpf(c.cpf)} · nasc. {dataBR(c.data_nascimento)}
              </span>
            </li>
          ))}
        </ul>
      </Bloco>

      {/* Só voo com alguma coisa preenchida. Linha vazia (sem companhia, número,
          data nem localizador) virava "IDA · — — → — —" — inclusive em
          solicitação que nem pediu aéreo, o que faz parecer que falta emitir
          uma passagem que ninguém pediu. */}
      {voos.some(temVoo) && (
        <Bloco titulo="Voos">
          {s.aereo_emitido && (
            <p className="mb-2">
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-emerald-700">
                AÉREO EMITIDO
              </span>
              {s.aereo_emitido_em && (
                <span className="ml-2 text-xs text-neutral-500">
                  em {dataHoraBR(s.aereo_emitido_em)}
                </span>
              )}
            </p>
          )}
          {(s.colaboradores ?? []).map((c: any) => {
            const meus = voos.filter((v: any) => v.colaborador_id === c.id && temVoo(v))
            if (meus.length === 0) return null
            return (
              <div key={c.id} className="mb-2">
                <p className="font-medium text-neutral-900">{c.nome_completo}</p>
                {meus
                  .sort((a: any) => (a.trecho === 'IDA' ? -1 : 1))
                  .map((v: any, i: number) => (
                    <p key={i} className="text-neutral-700">
                      <span className="font-semibold">{v.trecho}</span> {v.companhia}{' '}
                      {v.numero_voo} · {dataHora(v.partida_data, v.partida_hora)}{' '}
                      {aeroportoLabel(v.aeroporto_origem)} → {dataHora(v.chegada_data, v.chegada_hora)}{' '}
                      {aeroportoLabel(v.aeroporto_destino)}
                      {v.localizador && (
                        <>
                          {' · '}
                          <span className="font-mono font-semibold">
                            {v.localizador}
                          </span>
                        </>
                      )}
                    </p>
                  ))}
              </div>
            )
          })}
        </Bloco>
      )}

      {/* Uma pessoa pode ter as duas hospedagens (hotel da operação e hotel
          fora). Com `find`, só a primeira aparecia — e a pessoa chegaria na
          véspera sem saber onde dorme. Fora do hotel do pax, o hotel de
          verdade está em `hotel_hospedagem`; `hotel` é só a referência. */}
      {hosp.some((h: any) => h.hotel_hospedagem || h.hotel) && (
        <Bloco titulo="Hospedagem">
          {(s.colaboradores ?? []).map((c: any) => {
            const minhas = hosp.filter(
              (x: any) => x.colaborador_id === c.id && (x.hotel_hospedagem || x.hotel),
            )
            if (minhas.length === 0) return null
            return (
              <div key={c.id} className="mb-2 text-neutral-700">
                <p className="font-medium text-neutral-900">{c.nome_completo}</p>
                {minhas.map((h: any, i: number) => (
                  <p key={i}>
                    {minhas.length > 1 && (
                      <span className="font-semibold">
                        {h.tipo === 'FORA_HOTEL_PAX' ? 'FORA ' : 'OPERAÇÃO '}
                      </span>
                    )}
                    {h.hotel_hospedagem || h.hotel}
                    {h.endereco && ` · ${h.endereco}`}
                    {' · '}
                    {dataBR(h.check_in)} a {dataBR(h.check_out)}
                    {h.codigo_reserva && ` · reserva ${h.codigo_reserva}`}
                    {h.observacoes && (
                      <span className="block whitespace-pre-wrap text-xs text-neutral-500">
                        Obs.: {h.observacoes}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            )
          })}
        </Bloco>
      )}

      {/* Rodoviário: ida E volta.
          A volta nunca foi montada aqui — a consulta mostrava só apresentação
          e ida, e quem abria para saber a que horas o ônibus volta não achava.
          O filtro também deixou de olhar `horario_ida`, a coluna antiga de
          timestamp que parou de ser preenchida quando data e hora separaram:
          com ela, um trecho só de volta nem aparecia. */}
      {rodo.some((r: any) => temRodo(r)) && (
        <Bloco titulo="Rodoviário">
          {(s.colaboradores ?? []).map((c: any) => {
            const r = rodo.find((x: any) => x.colaborador_id === c.id)
            if (!r || !temRodo(r)) return null
            return (
              <div key={c.id} className="mb-2 text-neutral-700">
                <p>
                  <span className="font-medium text-neutral-900">{c.nome_completo}</span>
                  {r.empresa && <>{' — '}{r.empresa}</>}
                  {r.numero_onibus && ` · ônibus ${r.numero_onibus}`}
                </p>
                {(r.apresentacao_data || r.apresentacao_hora) && (
                  <p>Apresentação {dataHora(r.apresentacao_data, r.apresentacao_hora)}</p>
                )}
                {(r.ida_data || r.ida_hora || r.local_embarque_ida) && (
                  <p>
                    <span className="font-semibold">IDA</span>{' '}
                    {dataHora(r.ida_data, r.ida_hora)}
                    {r.local_embarque_ida && ` — ${r.local_embarque_ida}`}
                  </p>
                )}
                {(r.volta_data || r.volta_hora || r.local_embarque_volta) && (
                  <p>
                    <span className="font-semibold">VOLTA</span>{' '}
                    {dataHora(r.volta_data, r.volta_hora)}
                    {r.local_embarque_volta && ` — ${r.local_embarque_volta}`}
                  </p>
                )}
              </div>
            )
          })}
        </Bloco>
      )}

      {/* Van: lia `saida_em`, a coluna antiga de timestamp que parou de ser
          preenchida quando data e hora separaram — a saída aparecia vazia e o
          retorno nem existia na tela. */}
      {dados.van &&
        (dados.van.empresa || dados.van.saida_data || dados.van.chegada_data) && (
          <Bloco titulo="Van ou ônibus">
            <div className="text-neutral-700">
              <p>
                {dados.van.empresa}
                {dados.van.motorista && ` · motorista ${dados.van.motorista}`}
                {dados.van.telefone && ` · ${dados.van.telefone}`}
                {dados.van.placa && ` · placa ${dados.van.placa}`}
              </p>
              {(dados.van.saida_data || dados.van.local_saida) && (
                <p>
                  <span className="font-semibold">SAÍDA</span>{' '}
                  {dataHora(dados.van.saida_data, dados.van.saida_hora)}
                  {dados.van.local_saida && ` — ${dados.van.local_saida}`}
                </p>
              )}
              {(dados.van.chegada_data || dados.van.local_chegada) && (
                <p>
                  <span className="font-semibold">RETORNO</span>{' '}
                  {dataHora(dados.van.chegada_data, dados.van.chegada_hora)}
                  {dados.van.local_chegada && ` — ${dados.van.local_chegada}`}
                </p>
              )}
            </div>
          </Bloco>
        )}

      {dados.carro?.locadora && (
        <Bloco titulo="Locação de carro">
          <p className="text-neutral-700">
            {dados.carro.locadora}
            {dados.carro.categoria && ` · ${dados.carro.categoria}`}
            <br />
            Retirada {dataHoraBR(dados.carro.retirada_em)}
            {dados.carro.retirada_local && ` — ${dados.carro.retirada_local}`}
            <br />
            Devolução {dataHoraBR(dados.carro.devolucao_em)}
            {dados.carro.devolucao_local && ` — ${dados.carro.devolucao_local}`}
          </p>
        </Bloco>
      )}

      {(dados.carros_pedidos ?? []).length > 0 && (
        <Bloco titulo="Condutores solicitados">
          <ul className="space-y-1">
            {dados.carros_pedidos.map((c: any) => (
              <li key={c.id} className="text-neutral-700">
                <span className="font-medium text-neutral-900">{c.condutor_nome}</span> ·{' '}
                {mascaraCpf(c.condutor_cpf)} · {c.tipo_carro} ·{' '}
                {c.transmissao === 'AUTOMATICO' ? 'automático' : 'manual'}
                {c.local_retirada && ` · retirada: ${c.local_retirada}`}
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {s.obs_transporte && s.obs_transporte !== 'Não se aplica — sem transporte.' && (
        <Bloco titulo="Observações do solicitante">
          <p className="whitespace-pre-wrap text-neutral-700">{s.obs_transporte}</p>
        </Bloco>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {titulo}
      </h3>
      {children}
    </div>
  )
}
