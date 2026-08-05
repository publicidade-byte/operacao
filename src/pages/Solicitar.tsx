import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, invocar } from '../lib/supabase'
import type { Edicao, Diretor } from '../lib/types'
import {
  AEROPORTOS,
  EQUIPES,
  SERVICOS,
  SERVICOS_TRANSPORTE,
  equipeLabel,
  servicoLabel,
} from '../lib/constants'
import {
  cpfValido,
  dataBR,
  dataCurta,
  emailValido,
  idade,
  mascaraCpf,
  mascaraTelefone,
  soDigitos,
  telefoneValido,
} from '../lib/format'
import {
  Aviso,
  Botao,
  Campo,
  Card,
  Input,
  Marca,
  Radios,
  Select,
  Textarea,
} from '../components/ui'
import { DIRETORES_DEMO, EDICOES_DEMO, ehDemo } from '../lib/demo'

type ColabForm = { nome_completo: string; cpf: string; data_nascimento: string }

type Form = {
  destino: string // destino escolhido; abre o toggle com as datas
  edicao_ids: string[] // uma solicitação pode cobrir várias operações
  data_entrada: string
  data_saida: string
  tipo_hospedagem: string
  servicos: string[]
  aeroporto_saida: string
  aeroporto_chegada: string
  precisa_bagagem: string
  van_local_saida: string
  van_horario_saida: string
  van_destino: string
  van_qtd_passageiros: string
  obs_transporte: string
  obs_locacao_carro: string
  carro_condutor_nome: string
  carro_condutor_cpf: string
  carro_transmissao: string
  equipe: string
  equipe_outro: string
  colaboradores: ColabForm[]
  solicitante_nome: string
  solicitante_email: string
  solicitante_whatsapp: string
  diretor_id: string
  consentimento: boolean
}

const VAZIO: Form = {
  destino: '',
  edicao_ids: [],
  data_entrada: '',
  data_saida: '',
  tipo_hospedagem: '',
  servicos: [],
  aeroporto_saida: '',
  aeroporto_chegada: '',
  precisa_bagagem: '',
  van_local_saida: '',
  van_horario_saida: '',
  van_destino: '',
  van_qtd_passageiros: '',
  obs_transporte: '',
  obs_locacao_carro: '',
  carro_condutor_nome: '',
  carro_condutor_cpf: '',
  carro_transmissao: '',
  equipe: '',
  equipe_outro: '',
  colaboradores: [{ nome_completo: '', cpf: '', data_nascimento: '' }],
  solicitante_nome: '',
  solicitante_email: '',
  solicitante_whatsapp: '',
  diretor_id: '',
  consentimento: false,
}

const PASSOS = ['Destino', 'Serviços', 'Equipe', 'Solicitante', 'Revisão']
const RASCUNHO = 'f9:rascunho'

type Erros = Record<string, string>

export default function Solicitar() {
  const navigate = useNavigate()
  const [passo, setPasso] = useState(0)
  const [form, setForm] = useState<Form>(() => {
    try {
      const salvo = localStorage.getItem(RASCUNHO)
      return salvo ? { ...VAZIO, ...JSON.parse(salvo), consentimento: false } : VAZIO
    } catch {
      return VAZIO
    }
  })
  const [edicoes, setEdicoes] = useState<Edicao[]>([])
  const [diretores, setDiretores] = useState<Pick<Diretor, 'id' | 'nome'>[]>([])
  const [erros, setErros] = useState<Erros>({})
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [buscaDestino, setBuscaDestino] = useState('')
  const topo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      if (ehDemo) {
        setEdicoes(EDICOES_DEMO)
        setDiretores(DIRETORES_DEMO)
        setCarregando(false)
        return
      }
      try {
        const [e, d] = await Promise.all([
          supabase.from('edicoes').select('*').eq('ativa', true).order('data_inicio'),
          supabase.from('v_diretores_publicos').select('id, nome'),
        ])
        if (e.error || d.error) throw new Error(e.error?.message ?? d.error?.message)
        setEdicoes((e.data ?? []) as Edicao[])
        setDiretores((d.data ?? []) as Pick<Diretor, 'id' | 'nome'>[])
      } catch (err) {
        setErroCarga(
          err instanceof Error ? err.message : 'Não foi possível carregar os destinos.',
        )
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  useEffect(() => {
    localStorage.setItem(RASCUNHO, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [passo])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErros((e) => {
      const { [k as string]: _, ...resto } = e
      return resto
    })
  }

  const setColab = (i: number, k: keyof ColabForm, v: string) => {
    setForm((f) => {
      const cs = [...f.colaboradores]
      cs[i] = { ...cs[i], [k]: v }
      return { ...f, colaboradores: cs }
    })
    setErros((e) => {
      const { [`colab.${i}.${k}`]: _, ...resto } = e
      return resto
    })
  }

  /** Destinos únicos, com a quantidade de datas disponíveis em cada um. */
  const destinos = useMemo(() => {
    const m = new Map<string, { destino: string; hotel: string; quantas: number }>()
    for (const e of edicoes) {
      const atual = m.get(e.destino)
      if (atual) atual.quantas++
      else m.set(e.destino, { destino: e.destino, hotel: e.hotel, quantas: 1 })
    }
    return [...m.values()].sort((a, b) => a.destino.localeCompare(b.destino, 'pt-BR'))
  }, [edicoes])

  const destinosFiltrados = useMemo(() => {
    const q = buscaDestino.trim().toLowerCase()
    if (!q) return destinos
    return destinos.filter(
      (d) =>
        d.destino.toLowerCase().includes(q) || d.hotel.toLowerCase().includes(q),
    )
  }, [destinos, buscaDestino])

  /** Datas da operação disponíveis para o destino escolhido. */
  const datasDoDestino = useMemo(
    () =>
      edicoes
        .filter((e) => e.destino === form.destino)
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
    [edicoes, form.destino],
  )

  /** Operações escolhidas, em ordem cronológica. */
  const selecionadas = useMemo(
    () =>
      edicoes
        .filter((e) => form.edicao_ids.includes(e.id))
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
    [edicoes, form.edicao_ids],
  )
  const edicao = selecionadas[0]
  const diretor = diretores.find((d) => d.id === form.diretor_id)

  /** Abre/fecha o toggle de datas do destino. Trocar de destino limpa a seleção. */
  function alternarDestino(destino: string) {
    setForm((f) =>
      f.destino === destino
        ? { ...f, destino: '' }
        : { ...f, destino, edicao_ids: [], data_entrada: '', data_saida: '' },
    )
    setErros((e) => ({ ...e, destino: '', edicao_ids: '' }))
  }

  /**
   * Marca/desmarca uma operação. As datas de entrada e saída acompanham o
   * conjunto: entrada = início da primeira, saída = fim da última. O usuário
   * pode ajustar depois (chega antes para montagem, sai depois etc.).
   */
  function alternarEdicao(id: string) {
    setForm((f) => {
      const ids = f.edicao_ids.includes(id)
        ? f.edicao_ids.filter((x) => x !== id)
        : [...f.edicao_ids, id]
      const sel = edicoes
        .filter((e) => ids.includes(e.id))
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
      return {
        ...f,
        edicao_ids: ids,
        data_entrada: sel[0]?.data_inicio ?? '',
        data_saida: sel[sel.length - 1]?.data_fim ?? '',
      }
    })
    setErros((e) => ({ ...e, edicao_ids: '', data_entrada: '', data_saida: '' }))
  }

  /** Marca/desmarca um serviço. Vários podem coexistir na mesma viagem. */
  function alternarServico(valor: string) {
    setForm((f) => ({
      ...f,
      servicos: f.servicos.includes(valor)
        ? f.servicos.filter((s) => s !== valor)
        : [...f.servicos, valor],
    }))
    setErros((e) => ({ ...e, servicos: '' }))
  }

  const temTransporte = form.servicos.some((s) => SERVICOS_TRANSPORTE.includes(s))

  function marcarTodasDoDestino() {
    const ids = datasDoDestino.map((e) => e.id)
    setForm((f) => ({
      ...f,
      edicao_ids: ids,
      data_entrada: datasDoDestino[0]?.data_inicio ?? '',
      data_saida: datasDoDestino[datasDoDestino.length - 1]?.data_fim ?? '',
    }))
    setErros((e) => ({ ...e, edicao_ids: '' }))
  }

  function validar(p: number): Erros {
    const e: Erros = {}
    if (p === 0) {
      if (!form.destino) e.destino = 'Selecione o destino.'
      else if (form.edicao_ids.length === 0)
        e.edicao_ids = 'Selecione ao menos uma data da operação.'
      if (!form.data_entrada) e.data_entrada = 'Informe a data de entrada.'
      if (!form.data_saida) e.data_saida = 'Informe a data de saída.'
      if (form.data_entrada && form.data_saida && form.data_saida <= form.data_entrada)
        e.data_saida = 'A saída precisa ser depois da entrada.'
      if (!form.tipo_hospedagem) e.tipo_hospedagem = 'Selecione o tipo de hospedagem.'
    }
    if (p === 1) {
      if (form.servicos.length === 0)
        e.servicos = 'Selecione ao menos um serviço.'

      if (form.servicos.includes('AEREO')) {
        if (!form.aeroporto_saida) e.aeroporto_saida = 'Selecione o aeroporto de saída.'
        if (!form.aeroporto_chegada)
          e.aeroporto_chegada = 'Selecione o aeroporto de chegada.'
        if (form.aeroporto_saida && form.aeroporto_saida === form.aeroporto_chegada)
          e.aeroporto_chegada = 'Saída e chegada não podem ser o mesmo aeroporto.'
        if (!form.precisa_bagagem)
          e.precisa_bagagem = 'Informe se precisa de bagagem despachada.'
      }

      if (form.servicos.includes('VAN')) {
        if (!form.van_local_saida.trim())
          e.van_local_saida = 'Informe o endereço de saída.'
        if (!form.van_horario_saida.trim())
          e.van_horario_saida = 'Informe o horário de saída.'
        if (!form.van_destino.trim()) e.van_destino = 'Informe o destino.'
        const n = Number(form.van_qtd_passageiros)
        if (!form.van_qtd_passageiros || !Number.isInteger(n) || n < 1 || n > 60)
          e.van_qtd_passageiros = 'Informe a quantidade de passageiros (1 a 60).'
      }

      if (form.servicos.includes('CARRO')) {
        if (!form.obs_locacao_carro.trim())
          e.obs_locacao_carro = 'Descreva a necessidade do carro.'
        if (form.carro_condutor_nome.trim().split(/\s+/).length < 2)
          e.carro_condutor_nome = 'Informe o nome completo do condutor.'
        if (!cpfValido(form.carro_condutor_cpf))
          e.carro_condutor_cpf = 'CPF do condutor inválido.'
        if (!form.carro_transmissao) e.carro_transmissao = 'Selecione o tipo de câmbio.'
      }

      if (
        form.servicos.some((s) => SERVICOS_TRANSPORTE.includes(s)) &&
        !form.obs_transporte.trim()
      )
        e.obs_transporte = 'Descreva a necessidade de transporte.'
    }
    if (p === 2) {
      if (!form.equipe) e.equipe = 'Selecione a equipe.'
      if (form.equipe === 'OUTROS' && !form.equipe_outro.trim())
        e.equipe_outro = 'Informe qual é a sua área ou departamento.'
      const cpfs = new Set<string>()
      form.colaboradores.forEach((c, i) => {
        if (c.nome_completo.trim().split(/\s+/).length < 2)
          e[`colab.${i}.nome_completo`] = 'Informe nome e sobrenome.'
        const d = soDigitos(c.cpf)
        if (!cpfValido(c.cpf)) e[`colab.${i}.cpf`] = 'CPF inválido.'
        else if (cpfs.has(d)) e[`colab.${i}.cpf`] = 'CPF repetido nesta solicitação.'
        else cpfs.add(d)
        if (!c.data_nascimento)
          e[`colab.${i}.data_nascimento`] = 'Informe a data de nascimento.'
        else {
          const a = idade(c.data_nascimento)
          if (a < 16 || a > 90)
            e[`colab.${i}.data_nascimento`] = 'Data de nascimento improvável.'
        }
      })
    }
    if (p === 3) {
      if (form.solicitante_nome.trim().split(/\s+/).length < 2)
        e.solicitante_nome = 'Informe seu nome completo.'
      if (!emailValido(form.solicitante_email)) e.solicitante_email = 'E-mail inválido.'
      if (!telefoneValido(form.solicitante_whatsapp))
        e.solicitante_whatsapp = 'WhatsApp inválido (com DDD).'
      if (!form.diretor_id) e.diretor_id = 'Selecione o diretor aprovador.'
    }
    if (p === 4 && !form.consentimento)
      e.consentimento = 'É necessário confirmar para enviar.'
    return e
  }

  function avancar() {
    const e = validar(passo)
    setErros(e)
    if (Object.keys(e).length === 0) setPasso((p) => Math.min(p + 1, PASSOS.length - 1))
    else
      document
        .querySelector('[aria-invalid="true"], [role="alert"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function enviar() {
    const todos = [0, 1, 2, 3, 4].reduce<Erros>(
      (acc, p) => ({ ...acc, ...validar(p) }),
      {},
    )
    setErros(todos)
    if (Object.keys(todos).length > 0) {
      setErroEnvio('Há campos pendentes. Revise os passos indicados acima.')
      return
    }
    setEnviando(true)
    setErroEnvio('')
    if (ehDemo) {
      localStorage.removeItem(RASCUNHO)
      navigate('/enviado/F9-2026-DEMO?t=demonstracao-sem-banco-de-dados')
      return
    }
    try {
      const resp = await invocar<{ protocolo: string; token: string }>(
        'criar-solicitacao',
        {
          website: honeypot,
          edicao_ids: form.edicao_ids,
          equipe: form.equipe,
          equipe_outro: form.equipe === 'OUTROS' ? form.equipe_outro.trim() : null,
          diretor_id: form.diretor_id,
          solicitante_nome: form.solicitante_nome.trim(),
          solicitante_email: form.solicitante_email.trim().toLowerCase(),
          solicitante_whatsapp: soDigitos(form.solicitante_whatsapp),
          data_entrada: form.data_entrada,
          data_saida: form.data_saida,
          tipo_hospedagem: form.tipo_hospedagem,
          servicos: form.servicos,
          aeroporto_saida: form.servicos.includes('AEREO')
            ? form.aeroporto_saida
            : null,
          aeroporto_chegada: form.servicos.includes('AEREO')
            ? form.aeroporto_chegada
            : null,
          precisa_bagagem: form.servicos.includes('AEREO')
            ? form.precisa_bagagem === 'SIM'
            : null,
          obs_transporte: temTransporte
            ? form.obs_transporte.trim()
            : 'Não se aplica — sem transporte.',
          van_local_saida: form.servicos.includes('VAN')
            ? form.van_local_saida.trim()
            : null,
          van_horario_saida: form.servicos.includes('VAN')
            ? form.van_horario_saida.trim()
            : null,
          van_destino: form.servicos.includes('VAN') ? form.van_destino.trim() : null,
          van_qtd_passageiros: form.servicos.includes('VAN')
            ? Number(form.van_qtd_passageiros)
            : null,
          obs_locacao_carro: form.servicos.includes('CARRO')
            ? form.obs_locacao_carro.trim()
            : null,
          carro_condutor_nome: form.servicos.includes('CARRO')
            ? form.carro_condutor_nome.trim()
            : null,
          carro_condutor_cpf: form.servicos.includes('CARRO')
            ? soDigitos(form.carro_condutor_cpf)
            : null,
          carro_transmissao: form.servicos.includes('CARRO')
            ? form.carro_transmissao
            : null,
          colaboradores: form.colaboradores.map((c, i) => ({
            nome_completo: c.nome_completo.trim(),
            cpf: soDigitos(c.cpf),
            data_nascimento: c.data_nascimento,
            ordem: i + 1,
          })),
        },
      )
      localStorage.removeItem(RASCUNHO)
      navigate(`/enviado/${resp.protocolo}?t=${resp.token}`)
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Erro inesperado ao enviar.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando)
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span className="size-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800" />
          Carregando destinos…
        </div>
      </div>
    )

  if (erroCarga || edicoes.length === 0)
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <Aviso tom="erro">
          Não foi possível carregar a lista de destinos. Verifique a conexão com o
          Supabase (arquivo <code>.env</code>) e se o <code>seed.sql</code> foi executado.
          {erroCarga && <span className="mt-1 block text-xs opacity-70">{erroCarga}</span>}
        </Aviso>
      </div>
    )

  const passosComErro = new Set<number>(
    Object.keys(erros)
      .filter((k) => erros[k])
      .map((k) =>
        ['destino', 'edicao_ids', 'data_entrada', 'data_saida', 'tipo_hospedagem'].includes(
          k,
        )
          ? 0
          : k === 'servicos' ||
              ['aeroporto_saida','aeroporto_chegada','precisa_bagagem','obs_transporte','obs_locacao_carro','van_local_saida','van_horario_saida','van_destino','van_qtd_passageiros','carro_condutor_nome','carro_condutor_cpf','carro_transmissao'].includes(k)
            ? 1
            : k.startsWith('colab.') || k === 'equipe'
              ? 2
              : ['solicitante_nome', 'solicitante_email', 'solicitante_whatsapp', 'diretor_id'].includes(k)
                ? 3
                : 4,
      ),
  )

  return (
    <div className="min-h-screen">
      <div ref={topo} />

      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <Marca sub="Solicitação de viagem" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-7">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Hospedagem e transporte
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Preencha os dados abaixo. Todos os campos são obrigatórios e você pode
            solicitar para várias pessoas de uma vez. Ao final você recebe um protocolo
            por e-mail.
          </p>
        </div>

        {ehDemo && (
          <div className="mb-5">
            <Aviso tom="destaque">
              <strong>Modo demonstração.</strong> Os destinos são uma amostra local e nada
              é gravado no banco. Serve só para ver a interface.
            </Aviso>
          </div>
        )}

        {/* Passos */}
        <nav className="mb-6" aria-label="Progresso do formulário">
          <ol className="flex items-center gap-1">
            {PASSOS.map((nome, i) => {
              const atual = i === passo
              const feito = i < passo
              const comErro = passosComErro.has(i) && i !== passo
              return (
                <li key={nome} className="flex-1">
                  <button
                    type="button"
                    onClick={() => i < passo && setPasso(i)}
                    disabled={i > passo}
                    aria-current={atual ? 'step' : undefined}
                    className={
                      'w-full rounded-md px-1 py-2 text-center text-[11px] font-semibold transition sm:text-xs ' +
                      (atual
                        ? 'bg-neutral-900 text-white'
                        : comErro
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                          : feito
                            ? 'bg-marca-100 text-neutral-800 hover:bg-marca-200'
                            : 'bg-neutral-100 text-neutral-400')
                    }
                  >
                    <span className="hidden sm:inline">{i + 1}. </span>
                    {nome}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="space-y-5">
          {/* ---------------- PASSO 1: DESTINO ---------------- */}
          {passo === 0 && (
            <>
              <Card
                titulo="1. Para qual destino?"
                descricao="Clique no destino para abrir as datas. Você pode marcar mais de uma operação."
              >
                {destinos.length > 8 && (
                  <div className="mb-3">
                    <Input
                      placeholder="Buscar destino ou hotel…"
                      value={buscaDestino}
                      onChange={(e) => setBuscaDestino(e.target.value)}
                    />
                  </div>
                )}

                <div className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-300">
                  {destinosFiltrados.map((d) => {
                    const aberto = form.destino === d.destino
                    const marcadas = aberto ? form.edicao_ids.length : 0
                    return (
                      <div key={d.destino}>
                        {/* Cabeçalho do destino — clique abre o toggle de datas */}
                        <button
                          type="button"
                          onClick={() => alternarDestino(d.destino)}
                          aria-expanded={aberto}
                          className={
                            'flex w-full items-center gap-3 px-3.5 py-3 text-left transition ' +
                            (aberto
                              ? 'bg-marca-50'
                              : 'bg-white hover:bg-neutral-50')
                          }
                        >
                          <span
                            className={
                              'grid size-5 shrink-0 place-items-center rounded text-xs font-bold transition ' +
                              (aberto
                                ? 'rotate-90 bg-marca-400 text-neutral-900'
                                : 'bg-neutral-100 text-neutral-500')
                            }
                          >
                            ›
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-neutral-900">
                              {d.destino}
                            </span>
                            <span className="block truncate text-xs text-neutral-500">
                              {d.hotel}
                            </span>
                          </span>
                          <span
                            className={
                              'shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ' +
                              (marcadas > 0
                                ? 'bg-neutral-900 text-white'
                                : 'bg-neutral-100 text-neutral-600')
                            }
                          >
                            {marcadas > 0
                              ? `${marcadas} de ${d.quantas}`
                              : `${d.quantas} ${d.quantas === 1 ? 'data' : 'datas'}`}
                          </span>
                        </button>

                        {/* Toggle aberto: datas em multiseleção */}
                        {aberto && (
                          <div className="border-t border-marca-200 bg-marca-50/50 px-3.5 py-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs text-neutral-600">
                                Marque todas as operações desta solicitação.
                              </p>
                              {datasDoDestino.length > 1 && (
                                <button
                                  type="button"
                                  onClick={
                                    form.edicao_ids.length === datasDoDestino.length
                                      ? () => alternarDestino(d.destino)
                                      : marcarTodasDoDestino
                                  }
                                  className="shrink-0 text-xs font-semibold text-neutral-700 underline decoration-marca-500 decoration-2 underline-offset-2"
                                >
                                  {form.edicao_ids.length === datasDoDestino.length
                                    ? 'limpar'
                                    : 'marcar todas'}
                                </button>
                              )}
                            </div>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {datasDoDestino.map((e) => {
                                const marcada = form.edicao_ids.includes(e.id)
                                return (
                                  <button
                                    key={e.id}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={marcada}
                                    onClick={() => alternarEdicao(e.id)}
                                    className={
                                      'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ' +
                                      (marcada
                                        ? 'border-marca-500 bg-white ring-2 ring-marca-500/40'
                                        : 'border-neutral-300 bg-white hover:border-neutral-400')
                                    }
                                  >
                                    <span
                                      className={
                                        'grid size-4 shrink-0 place-items-center rounded border-2 text-[10px] font-bold ' +
                                        (marcada
                                          ? 'border-marca-600 bg-marca-400 text-neutral-900'
                                          : 'border-neutral-400 text-transparent')
                                      }
                                    >
                                      ✓
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold text-neutral-900">
                                        {dataCurta(e.data_inicio)} a{' '}
                                        {dataCurta(e.data_fim)}
                                      </span>
                                      <span className="block text-xs text-neutral-500">
                                        {e.noites} {e.noites === 1 ? 'dia' : 'dias'}
                                      </span>
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                            {erros.edicao_ids && (
                              <p role="alert" className="mt-2 text-xs text-red-600">
                                {erros.edicao_ids}
                              </p>
                            )}

                            {/* Período e hospedagem ficam aqui dentro: a pessoa
                                acabou de escolher a data e responde na sequência,
                                sem precisar procurar outro bloco na página. */}
                            {selecionadas.length > 0 && (
                              <div className="mt-4 border-t border-marca-200 pt-4">
                                <div className="mb-3 rounded-lg bg-white px-3.5 py-2.5 text-sm ring-1 ring-neutral-200">
                                  <span className="font-semibold text-neutral-900">
                                    {selecionadas.length}{' '}
                                    {selecionadas.length === 1
                                      ? 'operação marcada'
                                      : 'operações marcadas'}
                                  </span>
                                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                                    {selecionadas.map((e) => (
                                      <li key={e.id}>
                                        {dataBR(e.data_inicio)} a {dataBR(e.data_fim)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <p className="mb-2 text-xs text-neutral-600">
                                  Preenchemos com as datas da operação. Ajuste se você
                                  chega antes ou sai depois.
                                </p>

                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Campo
                                    label="Data de entrada"
                                    erro={erros.data_entrada}
                                  >
                                    <Input
                                      type="date"
                                      value={form.data_entrada}
                                      erro={!!erros.data_entrada}
                                      onChange={(ev) =>
                                        set('data_entrada', ev.target.value)
                                      }
                                    />
                                  </Campo>
                                  <Campo label="Data de saída" erro={erros.data_saida}>
                                    <Input
                                      type="date"
                                      value={form.data_saida}
                                      erro={!!erros.data_saida}
                                      onChange={(ev) =>
                                        set('data_saida', ev.target.value)
                                      }
                                    />
                                  </Campo>
                                </div>

                                <div className="mt-4">
                                  <Campo
                                    label="Onde será a hospedagem?"
                                    erro={erros.tipo_hospedagem}
                                  >
                                    <Radios
                                      valor={form.tipo_hospedagem}
                                      erro={!!erros.tipo_hospedagem}
                                      onChange={(v) => set('tipo_hospedagem', v)}
                                      opcoes={[
                                        {
                                          value: 'HOTEL_PAX',
                                          label: 'Hotel do pax',
                                          descricao: 'Mesmo hotel dos passageiros',
                                        },
                                        {
                                          value: 'FORA_HOTEL_PAX',
                                          label: 'Fora do hotel do pax',
                                          descricao:
                                            'Hotel separado, a definir pela operação',
                                        },
                                      ]}
                                    />
                                  </Campo>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {destinosFiltrados.length === 0 && (
                  <p className="py-6 text-center text-sm text-neutral-500">
                    Nenhum destino encontrado para “{buscaDestino}”.
                  </p>
                )}

                {erros.destino && (
                  <p role="alert" className="mt-3 text-xs text-red-600">
                    {erros.destino}
                  </p>
                )}
              </Card>

            </>
          )}

          {/* ---------------- PASSO 2: SERVIÇOS ---------------- */}
          {passo === 1 && (
            <>
              <Card
                titulo="O que você deseja solicitar?"
                descricao="Marque tudo o que precisa. Pode ser mais de um."
              >
                <div className="grid gap-2">
                  {SERVICOS.map((s) => {
                    const marcado = form.servicos.includes(s.value)
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="checkbox"
                        aria-checked={marcado}
                        onClick={() => alternarServico(s.value)}
                        className={
                          'flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition ' +
                          (marcado
                            ? 'border-marca-500 bg-marca-50 ring-2 ring-marca-500/40'
                            : 'border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50')
                        }
                      >
                        <span
                          className={
                            'mt-0.5 grid size-5 shrink-0 place-items-center rounded border-2 text-xs font-bold ' +
                            (marcado
                              ? 'border-marca-600 bg-marca-400 text-neutral-900'
                              : 'border-neutral-400 text-transparent')
                          }
                        >
                          ✓
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-neutral-900">
                            {s.label}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {s.descricao}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {erros.servicos && (
                  <p role="alert" className="mt-3 text-xs text-red-600">
                    {erros.servicos}
                  </p>
                )}
              </Card>

              {/* Cada serviço marcado abre só os campos que ele precisa. */}
              {form.servicos.includes('AEREO') && (
                <Card titulo="Aéreo">
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo label="Aeroporto de saída" erro={erros.aeroporto_saida}>
                        <Select
                          value={form.aeroporto_saida}
                          erro={!!erros.aeroporto_saida}
                          onChange={(e) => set('aeroporto_saida', e.target.value)}
                        >
                          <option value="">Selecione…</option>
                          {AEROPORTOS.map((a) => (
                            <option key={a.iata} value={a.iata}>
                              {a.iata} — {a.nome}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                      <Campo label="Aeroporto de chegada" erro={erros.aeroporto_chegada}>
                        <Select
                          value={form.aeroporto_chegada}
                          erro={!!erros.aeroporto_chegada}
                          onChange={(e) => set('aeroporto_chegada', e.target.value)}
                        >
                          <option value="">Selecione…</option>
                          {AEROPORTOS.map((a) => (
                            <option key={a.iata} value={a.iata}>
                              {a.iata} — {a.nome}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                    </div>
                    <Campo
                      label="Precisa de bagagem despachada?"
                      erro={erros.precisa_bagagem}
                      dica="Bagagem de porão, além da de mão. Costuma ter custo extra."
                    >
                      <Radios
                        valor={form.precisa_bagagem}
                        erro={!!erros.precisa_bagagem}
                        onChange={(v) => set('precisa_bagagem', v)}
                        opcoes={[
                          { value: 'SIM', label: 'Sim' },
                          { value: 'NAO', label: 'Não, só bagagem de mão' },
                        ]}
                      />
                    </Campo>
                  </div>
                </Card>
              )}

              {form.servicos.includes('VAN') && (
                <Card titulo="Aluguel de van">
                  <div className="space-y-4">
                    <Campo label="Endereço de saída" erro={erros.van_local_saida}>
                      <Input
                        value={form.van_local_saida}
                        erro={!!erros.van_local_saida}
                        maxLength={200}
                        onChange={(e) => set('van_local_saida', e.target.value)}
                        placeholder="Rua, número, bairro, cidade"
                      />
                    </Campo>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo
                        label="Horário de saída"
                        erro={erros.van_horario_saida}
                        dica="Pode ser aproximado, ex.: 06h ou madrugada"
                      >
                        <Input
                          value={form.van_horario_saida}
                          erro={!!erros.van_horario_saida}
                          maxLength={60}
                          onChange={(e) => set('van_horario_saida', e.target.value)}
                          placeholder="Ex.: 05/10 às 06h"
                        />
                      </Campo>
                      <Campo
                        label="Quantidade de passageiros"
                        erro={erros.van_qtd_passageiros}
                      >
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          inputMode="numeric"
                          value={form.van_qtd_passageiros}
                          erro={!!erros.van_qtd_passageiros}
                          onChange={(e) => set('van_qtd_passageiros', e.target.value)}
                        />
                      </Campo>
                    </div>
                    <Campo label="Destino da van" erro={erros.van_destino}>
                      <Input
                        value={form.van_destino}
                        erro={!!erros.van_destino}
                        maxLength={200}
                        onChange={(e) => set('van_destino', e.target.value)}
                        placeholder="Para onde a van vai levar o grupo"
                      />
                    </Campo>
                  </div>
                </Card>
              )}

              {form.servicos.includes('CARRO') && (
                <Card titulo="Aluguel de carro">
                  <div className="space-y-4">
                    <Campo
                      label="Nome do condutor"
                      erro={erros.carro_condutor_nome}
                      dica="Quem vai dirigir. A locadora exige CNH em nome dessa pessoa."
                    >
                      <Input
                        value={form.carro_condutor_nome}
                        erro={!!erros.carro_condutor_nome}
                        onChange={(e) => set('carro_condutor_nome', e.target.value)}
                      />
                    </Campo>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo label="CPF do condutor" erro={erros.carro_condutor_cpf}>
                        <Input
                          value={form.carro_condutor_cpf}
                          inputMode="numeric"
                          erro={!!erros.carro_condutor_cpf}
                          autoComplete="off"
                          onChange={(e) =>
                            set('carro_condutor_cpf', mascaraCpf(e.target.value))
                          }
                          placeholder="000.000.000-00"
                        />
                      </Campo>
                      <Campo label="Câmbio" erro={erros.carro_transmissao}>
                        <Select
                          value={form.carro_transmissao}
                          erro={!!erros.carro_transmissao}
                          onChange={(e) => set('carro_transmissao', e.target.value)}
                        >
                          <option value="">Selecione…</option>
                          <option value="MANUAL">Manual</option>
                          <option value="AUTOMATICO">Automático</option>
                        </Select>
                      </Campo>
                    </div>
                    <Campo
                      label="Observações sobre a locação"
                      erro={erros.obs_locacao_carro}
                      dica="Categoria desejada, período, local de retirada e devolução."
                    >
                      <Textarea
                        maxLength={1000}
                        value={form.obs_locacao_carro}
                        erro={!!erros.obs_locacao_carro}
                        onChange={(e) => set('obs_locacao_carro', e.target.value)}
                      />
                    </Campo>
                  </div>
                </Card>
              )}

              {temTransporte && (
                <Card titulo="Observações do transporte">
                  <Campo
                    label="Alguma particularidade?"
                    erro={erros.obs_transporte}
                    dica={`${form.obs_transporte.length}/1000 caracteres`}
                  >
                    <Textarea
                      rows={4}
                      maxLength={1000}
                      value={form.obs_transporte}
                      erro={!!erros.obs_transporte}
                      onChange={(e) => set('obs_transporte', e.target.value)}
                      placeholder="Ex.: equipe de vídeo precisa de transfer até Cuiabá e depois entrar no embarque do pax."
                    />
                  </Campo>
                </Card>
              )}
            </>
          )}

          {/* ---------------- PASSO 3: EQUIPE ---------------- */}
          {passo === 2 && (
            <>
              <Card titulo="Equipe">
                <Campo label="A qual equipe pertence?" erro={erros.equipe}>
                  <Select
                    value={form.equipe}
                    erro={!!erros.equipe}
                    onChange={(e) => set('equipe', e.target.value)}
                  >
                    <option value="">Selecione a equipe…</option>
                    {EQUIPES.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </Select>
                </Campo>

                {form.equipe === 'OUTROS' && (
                  <div className="mt-4">
                    <Campo
                      label="Qual é a sua área ou departamento?"
                      erro={erros.equipe_outro}
                      dica="Ex.: Operacional, Financeiro, T.I., Jurídico."
                    >
                      <Input
                        value={form.equipe_outro}
                        erro={!!erros.equipe_outro}
                        maxLength={60}
                        onChange={(e) => set('equipe_outro', e.target.value)}
                        placeholder="Escreva o nome da área"
                      />
                    </Campo>
                  </div>
                )}
              </Card>

              {form.colaboradores.map((c, i) => (
                <Card
                  key={i}
                  titulo={`Colaborador ${i + 1}${c.nome_completo ? ` — ${c.nome_completo}` : ''}`}
                  acao={
                    form.colaboradores.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            'colaboradores',
                            form.colaboradores.filter((_, j) => j !== i),
                          )
                        }
                        className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    ) : undefined
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Campo label="Nome completo" erro={erros[`colab.${i}.nome_completo`]}>
                        <Input
                          value={c.nome_completo}
                          erro={!!erros[`colab.${i}.nome_completo`]}
                          autoComplete="off"
                          onChange={(e) => setColab(i, 'nome_completo', e.target.value)}
                          placeholder="Como está no documento de identificação"
                        />
                      </Campo>
                    </div>
                    <Campo label="CPF" erro={erros[`colab.${i}.cpf`]}>
                      <Input
                        value={c.cpf}
                        inputMode="numeric"
                        erro={!!erros[`colab.${i}.cpf`]}
                        autoComplete="off"
                        onChange={(e) => setColab(i, 'cpf', mascaraCpf(e.target.value))}
                        placeholder="000.000.000-00"
                      />
                    </Campo>
                    <Campo
                      label="Data de nascimento"
                      erro={erros[`colab.${i}.data_nascimento`]}
                    >
                      <Input
                        type="date"
                        value={c.data_nascimento}
                        erro={!!erros[`colab.${i}.data_nascimento`]}
                        onChange={(e) => setColab(i, 'data_nascimento', e.target.value)}
                      />
                    </Campo>
                  </div>
                </Card>
              ))}

              <Botao
                variante="secundario"
                className="w-full border-dashed"
                onClick={() =>
                  set('colaboradores', [
                    ...form.colaboradores,
                    { nome_completo: '', cpf: '', data_nascimento: '' },
                  ])
                }
              >
                + Adicionar novo colaborador
              </Botao>
            </>
          )}

          {/* ---------------- PASSO 4: SOLICITANTE ---------------- */}
          {passo === 3 && (
            <Card titulo="Seus dados e aprovação">
              <div className="space-y-5">
                <Campo label="Seu nome" erro={erros.solicitante_nome}>
                  <Input
                    value={form.solicitante_nome}
                    erro={!!erros.solicitante_nome}
                    onChange={(e) => set('solicitante_nome', e.target.value)}
                  />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    label="Seu e-mail"
                    erro={erros.solicitante_email}
                    dica="A confirmação da viagem será enviada para cá."
                  >
                    <Input
                      type="email"
                      value={form.solicitante_email}
                      erro={!!erros.solicitante_email}
                      onChange={(e) => set('solicitante_email', e.target.value)}
                      placeholder="voce@forma.com.br"
                    />
                  </Campo>
                  <Campo label="Seu WhatsApp" erro={erros.solicitante_whatsapp}>
                    <Input
                      value={form.solicitante_whatsapp}
                      inputMode="numeric"
                      erro={!!erros.solicitante_whatsapp}
                      onChange={(e) =>
                        set('solicitante_whatsapp', mascaraTelefone(e.target.value))
                      }
                      placeholder="(11) 99999-9999"
                    />
                  </Campo>
                </div>
                <Campo
                  label="Diretor aprovador"
                  erro={erros.diretor_id}
                  dica="Ele recebe a solicitação no sistema e aprova por lá."
                >
                  <Select
                    value={form.diretor_id}
                    erro={!!erros.diretor_id}
                    onChange={(e) => set('diretor_id', e.target.value)}
                  >
                    <option value="">Selecione o diretor…</option>
                    {diretores.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
            </Card>
          )}

          {/* ---------------- PASSO 5: REVISÃO ---------------- */}
          {passo === 4 && (
            <>
              <Card titulo="Revise antes de enviar">
                <dl className="divide-y divide-neutral-100 text-sm">
                  <Linha rotulo="Destino" onEditar={() => setPasso(0)}>
                    {edicao ? `${edicao.destino} — ${edicao.hotel}` : '—'}
                  </Linha>
                  <Linha
                    rotulo={
                      selecionadas.length > 1
                        ? `Operações (${selecionadas.length})`
                        : 'Operação'
                    }
                    onEditar={() => setPasso(0)}
                  >
                    <ul className="space-y-0.5">
                      {selecionadas.map((e) => (
                        <li key={e.id}>
                          {dataBR(e.data_inicio)} a {dataBR(e.data_fim)}
                        </li>
                      ))}
                    </ul>
                  </Linha>
                  <Linha rotulo="Sua estadia" onEditar={() => setPasso(0)}>
                    {dataBR(form.data_entrada)} a {dataBR(form.data_saida)}
                  </Linha>
                  <Linha rotulo="Hospedagem" onEditar={() => setPasso(0)}>
                    {form.tipo_hospedagem === 'HOTEL_PAX'
                      ? 'Hotel do pax'
                      : 'Fora do hotel do pax'}
                  </Linha>
                  <Linha
                    rotulo={`Serviços (${form.servicos.length})`}
                    onEditar={() => setPasso(1)}
                  >
                    {form.servicos.length === 0 ? (
                      '—'
                    ) : (
                      <ul className="space-y-0.5">
                        {form.servicos.map((s) => (
                          <li key={s}>{servicoLabel(s)}</li>
                        ))}
                      </ul>
                    )}
                  </Linha>
                  {form.servicos.includes('AEREO') && (
                    <Linha rotulo="Aéreo" onEditar={() => setPasso(1)}>
                      {form.aeroporto_saida} → {form.aeroporto_chegada}
                      <br />
                      Bagagem despachada:{' '}
                      {form.precisa_bagagem === 'SIM' ? 'sim' : 'não, só de mão'}
                    </Linha>
                  )}
                  {form.servicos.includes('VAN') && (
                    <Linha rotulo="Van" onEditar={() => setPasso(1)}>
                      Saída de {form.van_local_saida} · {form.van_horario_saida}
                      <br />
                      Destino: {form.van_destino} · {form.van_qtd_passageiros}{' '}
                      passageiro(s)
                    </Linha>
                  )}
                  {form.servicos.includes('CARRO') && (
                    <Linha rotulo="Carro" onEditar={() => setPasso(1)}>
                      Condutor: {form.carro_condutor_nome} · {form.carro_condutor_cpf}
                      <br />
                      Câmbio:{' '}
                      {form.carro_transmissao === 'AUTOMATICO' ? 'Automático' : 'Manual'}
                      <br />
                      <span className="text-neutral-500">{form.obs_locacao_carro}</span>
                    </Linha>
                  )}
                  {temTransporte && (
                    <Linha rotulo="Obs. transporte" onEditar={() => setPasso(1)}>
                      <span className="whitespace-pre-wrap">{form.obs_transporte}</span>
                    </Linha>
                  )}
                  <Linha rotulo="Equipe" onEditar={() => setPasso(2)}>
                    {form.equipe ? equipeLabel(form.equipe, form.equipe_outro) : '—'}
                  </Linha>
                  <Linha
                    rotulo={`Colaboradores (${form.colaboradores.length})`}
                    onEditar={() => setPasso(2)}
                  >
                    <ul className="space-y-1.5">
                      {form.colaboradores.map((c, i) => (
                        <li key={i}>
                          <span className="block font-medium">
                            {c.nome_completo || '—'}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            CPF {c.cpf || '—'} · nascimento{' '}
                            {c.data_nascimento ? dataBR(c.data_nascimento) : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Linha>
                  <Linha rotulo="Solicitante" onEditar={() => setPasso(3)}>
                    {form.solicitante_nome} · {form.solicitante_email} ·{' '}
                    {form.solicitante_whatsapp}
                  </Linha>
                  <Linha rotulo="Diretor aprovador" onEditar={() => setPasso(3)}>
                    {diretor?.nome ?? '—'}
                  </Linha>
                </dl>
              </Card>

              <Card titulo="Uso dos dados">
                <p className="text-sm leading-relaxed text-neutral-600">
                  Os dados informados (nome, CPF e data de nascimento) serão usados
                  exclusivamente para reserva de hospedagem, emissão de passagens e
                  locação de veículo desta viagem, e compartilhados apenas com hotéis,
                  companhias de transporte e locadoras envolvidas. Dentro da Forma, o
                  acesso é restrito à equipe operacional em área autenticada — o diretor
                  aprovador vê custos e logística, não vê CPF. Para correção ou exclusão,
                  escreva para a operação.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consentimento}
                    onChange={(e) => set('consentimento', e.target.checked)}
                    className="mt-0.5 size-4 rounded border-neutral-400 accent-marca-500"
                  />
                  <span className="text-neutral-700">
                    Confirmo que os dados estão corretos e que informei os colaboradores
                    sobre o uso das informações acima.
                  </span>
                </label>
                {erros.consentimento && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {erros.consentimento}
                  </p>
                )}
              </Card>

              {erroEnvio && <Aviso tom="erro">{erroEnvio}</Aviso>}
            </>
          )}

          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pointer-events-none absolute left-[-9999px] size-0 opacity-0"
          />

          <div className="flex items-center justify-between gap-3 pt-1">
            <Botao
              variante="secundario"
              onClick={() => setPasso((p) => Math.max(0, p - 1))}
              disabled={passo === 0}
            >
              Voltar
            </Botao>
            {passo < PASSOS.length - 1 ? (
              <Botao onClick={avancar}>Continuar</Botao>
            ) : (
              <Botao onClick={enviar} carregando={enviando}>
                Enviar solicitação
              </Botao>
            )}
          </div>
        </div>

        <footer className="mt-12 border-t border-neutral-200 pt-5 text-center text-xs text-neutral-400">
          <Link to="/login" className="hover:text-neutral-700">
            Área restrita — operação e diretoria
          </Link>
        </footer>
      </div>
    </div>
  )
}

function Linha({
  rotulo,
  onEditar,
  children,
}: {
  rotulo: string
  onEditar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="w-36 shrink-0 text-neutral-500">{rotulo}</dt>
      <dd className="flex-1 text-neutral-800">{children}</dd>
      <button
        type="button"
        onClick={onEditar}
        className="shrink-0 self-start rounded px-1.5 py-0.5 text-xs font-semibold text-neutral-600 underline decoration-marca-400 decoration-2 underline-offset-2 hover:bg-marca-50 hover:text-neutral-900"
      >
        editar
      </button>
    </div>
  )
}
