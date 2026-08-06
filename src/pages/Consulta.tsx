import { useCallback, useEffect, useMemo, useState } from 'react'
import { invocar } from '../lib/supabase'
import {
  STATUS_CLASS,
  STATUS_LABEL,
  aeroportoLabel,
  equipeLabel,
  servicoLabel,
} from '../lib/constants'
import { dataBR, dataHoraBR, mascaraCpf } from '../lib/format'
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
    const q = busca.trim().toLowerCase()
    return lista.filter((d) => {
      if (fStatus && d.status !== fStatus) return false
      if (!q) return true
      return (
        d.protocolo.toLowerCase().includes(q) ||
        d.destino?.toLowerCase().includes(q) ||
        d.solicitante_nome.toLowerCase().includes(q)
      )
    })
  }, [lista, busca, fStatus])

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
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="Buscar por protocolo, destino ou solicitante…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="sm:col-span-2"
            />
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
              <span className="font-medium text-neutral-900">{c.nome_completo}</span>
              <span className="ml-2 text-xs text-neutral-500">
                CPF {mascaraCpf(c.cpf)} · nasc. {dataBR(c.data_nascimento)}
              </span>
            </li>
          ))}
        </ul>
      </Bloco>

      {voos.length > 0 && (
        <Bloco titulo="Voos">
          {(s.colaboradores ?? []).map((c: any) => {
            const meus = voos.filter((v: any) => v.colaborador_id === c.id)
            if (meus.length === 0) return null
            return (
              <div key={c.id} className="mb-2">
                <p className="font-medium text-neutral-900">{c.nome_completo}</p>
                {meus
                  .sort((a: any) => (a.trecho === 'IDA' ? -1 : 1))
                  .map((v: any, i: number) => (
                    <p key={i} className="text-neutral-700">
                      <span className="font-semibold">{v.trecho}</span> {v.companhia}{' '}
                      {v.numero_voo} · {dataHoraBR(v.partida)}{' '}
                      {aeroportoLabel(v.aeroporto_origem)} → {dataHoraBR(v.chegada)}{' '}
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

      {hosp.some((h: any) => h.hotel) && (
        <Bloco titulo="Hospedagem">
          {(s.colaboradores ?? []).map((c: any) => {
            const h = hosp.find((x: any) => x.colaborador_id === c.id)
            if (!h?.hotel) return null
            return (
              <p key={c.id} className="text-neutral-700">
                <span className="font-medium text-neutral-900">{c.nome_completo}</span>
                {' — '}
                {h.hotel}
                {h.endereco && ` · ${h.endereco}`}
                {' · '}
                {dataBR(h.check_in)} a {dataBR(h.check_out)}
                {h.codigo_reserva && ` · reserva ${h.codigo_reserva}`}
              </p>
            )
          })}
        </Bloco>
      )}

      {rodo.some((r: any) => r.empresa || r.horario_ida) && (
        <Bloco titulo="Rodoviário">
          {(s.colaboradores ?? []).map((c: any) => {
            const r = rodo.find((x: any) => x.colaborador_id === c.id)
            if (!r?.empresa && !r?.horario_ida) return null
            return (
              <p key={c.id} className="text-neutral-700">
                <span className="font-medium text-neutral-900">{c.nome_completo}</span>
                {' — '}
                {r.empresa}
                {r.numero_onibus && ` · ônibus ${r.numero_onibus}`}
                <br />
                Apresentação {dataHoraBR(r.apresentacao_em)} · saída{' '}
                {dataHoraBR(r.horario_ida)}
                {r.local_embarque_ida && ` — ${r.local_embarque_ida}`}
              </p>
            )
          })}
        </Bloco>
      )}

      {dados.van && (dados.van.empresa || dados.van.saida_em) && (
        <Bloco titulo="Van">
          <p className="text-neutral-700">
            {dados.van.empresa}
            {dados.van.motorista && ` · motorista ${dados.van.motorista}`}
            {dados.van.telefone && ` · ${dados.van.telefone}`}
            {dados.van.placa && ` · placa ${dados.van.placa}`}
            <br />
            Saída {dataHoraBR(dados.van.saida_em)}
            {dados.van.local_saida && ` — ${dados.van.local_saida}`}
          </p>
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
