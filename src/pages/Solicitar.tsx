import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, invocar } from '../lib/supabase'
import type { Edicao, Diretor } from '../lib/types'
import {
  AEROPORTOS,
  EQUIPES,
  SERVICOS,
  SERVICOS_TRANSPORTE,
  TIPOS_CARRO,
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

type CarroForm = {
  nome: string
  cpf: string
  nascimento: string
  transmissao: string
  tipo: string
  retirada: string
  retirada_data: string
  devolucao_data: string
}

type Form = {
  destino: string // destino escolhido; abre o toggle com as datas
  edicao_ids: string[] // uma solicitação pode cobrir várias operações
  data_entrada: string
  data_saida: string
  tipo_hospedagem: string
  hosp_externa_operacao: string
  hosp_externa_obs: string
  servicos: string[]
  aeroporto_saida: string
  aeroporto_chegada: string
  tipo_voo: string
  voo_data_ida: string
  voo_data_volta: string
  aeroporto_saida_volta: string
  aeroporto_chegada_volta: string
  precisa_bagagem: string
  van_local_saida: string
  van_horario_saida: string
  van_destino: string
  van_qtd_passageiros: string
  obs_transporte: string
  obs_locacao_carro: string
  carros: CarroForm[]
  rodo_regiao_saida: string
  rodo_cidade_estado: string
  van_retorno_local: string
  van_retorno_horario: string
  van_retorno_destino: string
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
  hosp_externa_operacao: '',
  hosp_externa_obs: '',
  servicos: [],
  aeroporto_saida: '',
  aeroporto_chegada: '',
  tipo_voo: '',
  voo_data_ida: '',
  voo_data_volta: '',
  aeroporto_saida_volta: '',
  aeroporto_chegada_volta: '',
  precisa_bagagem: '',
  van_local_saida: '',
  van_horario_saida: '',
  van_destino: '',
  van_qtd_passageiros: '',
  obs_transporte: '',
  obs_locacao_carro: '',
  carros: [{ nome: '', cpf: '', nascimento: '', transmissao: '', tipo: '', retirada: '', retirada_data: '', devolucao_data: '' }],
  rodo_regiao_saida: '',
  rodo_cidade_estado: '',
  van_retorno_local: '',
  van_retorno_horario: '',
  van_retorno_destino: '',
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
      const entrada = sel[0]?.data_inicio ?? ''
      const saida = sel[sel.length - 1]?.data_fim ?? ''
      return {
        ...f,
        edicao_ids: ids,
        data_entrada: entrada,
        data_saida: saida,
        // As datas do voo acompanham a estadia; o solicitante ajusta se
        // precisar chegar antes ou voltar depois.
        voo_data_ida: entrada,
        voo_data_volta: saida,
        // O carro segue a mesma lógica: por padrão pega na chegada e
        // devolve na saída.
        carros: f.carros.map((c) => ({
          ...c,
          retirada_data: entrada,
          devolucao_data: saida,
        })),
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

  const setCarro = (i: number, k: keyof CarroForm, v: string) => {
    setForm((f) => {
      const cs = [...f.carros]
      cs[i] = { ...cs[i], [k]: v }
      return { ...f, carros: cs }
    })
    setErros((e) => {
      const { [`carro.${i}.${k}`]: _, ...resto } = e
      return resto
    })
  }

  /** Atalho: o retorno da van costuma ser o inverso da ida. */
  function inverterVanRetorno() {
    setForm((f) => ({
      ...f,
      van_retorno_local: f.van_destino,
      van_retorno_destino: f.van_local_saida,
    }))
    setErros((e) => ({ ...e, van_retorno_local: '', van_retorno_destino: '' }))
  }

  /** Atalho: na volta os aeroportos costumam ser os mesmos, invertidos. */
  function inverterTrechoVolta() {
    setForm((f) => ({
      ...f,
      aeroporto_saida_volta: f.aeroporto_chegada,
      aeroporto_chegada_volta: f.aeroporto_saida,
    }))
    setErros((e) => ({ ...e, aeroporto_saida_volta: '', aeroporto_chegada_volta: '' }))
  }

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
      if (form.tipo_hospedagem === 'FORA_HOTEL_PAX') {
        if (!form.hosp_externa_operacao)
          e.hosp_externa_operacao = 'Informe se a operação precisa reservar.'
        if (form.hosp_externa_operacao === 'SIM' && !form.hosp_externa_obs.trim())
          e.hosp_externa_obs = 'Descreva o que a operação precisa reservar.'
      }
    }
    if (p === 1) {
      if (form.servicos.length === 0)
        e.servicos = 'Selecione ao menos um serviço.'

      if (form.servicos.includes('AEREO')) {
        if (!form.tipo_voo) e.tipo_voo = 'Selecione o tipo de voo.'
        if (form.tipo_voo === 'IDA_VOLTA') {
          if (!form.aeroporto_saida_volta)
            e.aeroporto_saida_volta = 'Selecione o aeroporto de saída da volta.'
          if (!form.aeroporto_chegada_volta)
            e.aeroporto_chegada_volta = 'Selecione o aeroporto de chegada da volta.'
          if (
            form.aeroporto_saida_volta &&
            form.aeroporto_saida_volta === form.aeroporto_chegada_volta
          )
            e.aeroporto_chegada_volta = 'Saída e chegada não podem ser iguais.'
        }
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
        if (!form.van_retorno_local.trim())
          e.van_retorno_local = 'Informe o endereço de saída do retorno.'
        if (!form.van_retorno_horario.trim())
          e.van_retorno_horario = 'Informe o horário do retorno.'
        if (!form.van_retorno_destino.trim())
          e.van_retorno_destino = 'Informe o destino do retorno.'
      }

      if (form.servicos.includes('CARRO')) {
        form.carros.forEach((c, i) => {
          if (c.nome.trim().split(/\s+/).length < 2)
            e[`carro.${i}.nome`] = 'Informe o nome completo do condutor.'
          if (!cpfValido(c.cpf)) e[`carro.${i}.cpf`] = 'CPF inválido.'
          if (!c.nascimento) e[`carro.${i}.nascimento`] = 'Informe a data de nascimento.'
          else {
            const a = idade(c.nascimento)
            if (a < 18 || a > 90)
              e[`carro.${i}.nascimento`] = 'O condutor precisa ter ao menos 18 anos.'
          }
          if (!c.tipo) e[`carro.${i}.tipo`] = 'Selecione o tipo de carro.'
          if (!c.transmissao) e[`carro.${i}.transmissao`] = 'Selecione o câmbio.'
          if (!c.retirada.trim())
            e[`carro.${i}.retirada`] = 'Informe o local de retirada.'
          if (!c.retirada_data) e[`carro.${i}.retirada_data`] = 'Informe a data de retirada.'
          if (!c.devolucao_data)
            e[`carro.${i}.devolucao_data`] = 'Informe a data de devolução.'
          else if (c.retirada_data && c.devolucao_data < c.retirada_data)
            e[`carro.${i}.devolucao_data`] = 'A devolução não pode ser antes da retirada.'
        })
      }

      if (form.servicos.includes('RODOVIARIO')) {
        if (!form.rodo_regiao_saida.trim())
          e.rodo_regiao_saida = 'Informe a região de saída.'
        if (!form.rodo_cidade_estado.trim())
          e.rodo_cidade_estado = 'Informe a cidade e o estado.'
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
          hosp_externa_operacao:
            form.tipo_hospedagem === 'FORA_HOTEL_PAX'
              ? form.hosp_externa_operacao === 'SIM'
              : null,
          hosp_externa_obs:
            form.hosp_externa_operacao === 'SIM' ? form.hosp_externa_obs.trim() : null,
          tipo_voo: form.servicos.includes('AEREO') ? form.tipo_voo : null,
          aeroporto_saida_volta:
            form.servicos.includes('AEREO') && form.tipo_voo === 'IDA_VOLTA'
              ? form.aeroporto_saida_volta
              : null,
          aeroporto_chegada_volta:
            form.servicos.includes('AEREO') && form.tipo_voo === 'IDA_VOLTA'
              ? form.aeroporto_chegada_volta
              : null,
          voo_data_ida: form.servicos.includes('AEREO') ? form.voo_data_ida : null,
          voo_data_volta:
            form.servicos.includes('AEREO') && form.tipo_voo === 'IDA_VOLTA'
              ? form.voo_data_volta
              : null,
          rodo_regiao_saida: form.servicos.includes('RODOVIARIO')
            ? form.rodo_regiao_saida.trim()
            : null,
          rodo_cidade_estado: form.servicos.includes('RODOVIARIO')
            ? form.rodo_cidade_estado.trim()
            : null,
          van_retorno_local: form.servicos.includes('VAN')
            ? form.van_retorno_local.trim()
            : null,
          van_retorno_horario: form.servicos.includes('VAN')
            ? form.van_retorno_horario.trim()
            : null,
          van_retorno_destino: form.servicos.includes('VAN')
            ? form.van_retorno_destino.trim()
            : null,
          carros: form.servicos.includes('CARRO')
            ? form.carros.map((c, i) => ({
                condutor_nome: c.nome.trim(),
                condutor_cpf: soDigitos(c.cpf),
                condutor_nascimento: c.nascimento,
                transmissao: c.transmissao,
                tipo_carro: c.tipo,
                local_retirada: c.retirada.trim(),
                retirada_data: c.retirada_data,
                devolucao_data: c.devolucao_data,
                ordem: i + 1,
              }))
            : [],
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
          : k === 'servicos' || k.startsWith('carro.') ||
              ['aeroporto_saida','aeroporto_chegada','precisa_bagagem','obs_transporte','obs_locacao_carro','van_local_saida','van_horario_saida','van_destino','van_qtd_passageiros','rodo_regiao_saida','rodo_cidade_estado','van_retorno_local','van_retorno_horario','van_retorno_destino','voo_data_ida','voo_data_volta'].includes(k)
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
                                      onChange={(ev) => {
                                        set('data_entrada', ev.target.value)
                                        if (!form.voo_data_ida)
                                          set('voo_data_ida', ev.target.value)
                                      }}
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

                                {/* Fora do hotel do pax pode ser reserva da
                                    operação ou por conta própria — muda quem
                                    faz o trabalho e quem paga. */}
                                {form.tipo_hospedagem === 'FORA_HOTEL_PAX' && (
                                  <div className="mt-4">
                                    <Campo
                                      label="A operação precisa reservar essa hospedagem?"
                                      erro={erros.hosp_externa_operacao}
                                    >
                                      <Radios
                                        valor={form.hosp_externa_operacao}
                                        erro={!!erros.hosp_externa_operacao}
                                        onChange={(v) =>
                                          set('hosp_externa_operacao', v)
                                        }
                                        opcoes={[
                                          {
                                            value: 'SIM',
                                            label: 'Sim, a operação reserva',
                                          },
                                          {
                                            value: 'NAO',
                                            label: 'Não, já está resolvido',
                                          },
                                        ]}
                                      />
                                    </Campo>

                                    {form.hosp_externa_operacao === 'SIM' && (
                                      <div className="mt-3">
                                        <Campo
                                          label="Observações sobre a hospedagem"
                                          erro={erros.hosp_externa_obs}
                                          dica="Região, preferência de hotel, quantos quartos, quem divide."
                                        >
                                          <Textarea
                                            rows={3}
                                            maxLength={1000}
                                            value={form.hosp_externa_obs}
                                            erro={!!erros.hosp_externa_obs}
                                            onChange={(ev) =>
                                              set('hosp_externa_obs', ev.target.value)
                                            }
                                          />
                                        </Campo>
                                      </div>
                                    )}
                                  </div>
                                )}
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
                    <Campo label="Tipo de voo" erro={erros.tipo_voo}>
                      <Radios
                        valor={form.tipo_voo}
                        erro={!!erros.tipo_voo}
                        colunas={1}
                        onChange={(v) => set('tipo_voo', v)}
                        opcoes={[
                          {
                            value: 'IDA_VOLTA',
                            label: 'Ida e volta',
                            descricao: 'Os dois trechos serão emitidos',
                          },
                          { value: 'IDA', label: 'Somente ida' },
                          { value: 'VOLTA', label: 'Somente volta' },
                        ]}
                      />
                    </Campo>

                    <div className="rounded-lg border border-neutral-200 p-3.5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {form.tipo_voo === 'IDA_VOLTA'
                          ? 'Trecho de ida'
                          : form.tipo_voo === 'VOLTA'
                            ? 'Trecho de volta'
                            : 'Trecho'}
                      </p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Campo
                        label="Data do voo"
                        erro={erros.voo_data_ida}
                        dica="Preenchida com sua entrada. Ajuste se precisar."
                      >
                        <Input
                          type="date"
                          value={form.voo_data_ida}
                          erro={!!erros.voo_data_ida}
                          onChange={(e) => set('voo_data_ida', e.target.value)}
                        />
                      </Campo>
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
                    </div>

                    {form.tipo_voo === 'IDA_VOLTA' && (
                      <div className="rounded-lg border border-neutral-200 p-3.5">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Trecho de volta
                          </p>
                          <button
                            type="button"
                            onClick={inverterTrechoVolta}
                            className="text-xs font-semibold text-neutral-700 underline decoration-marca-500 decoration-2 underline-offset-2"
                          >
                            inverter a ida
                          </button>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Campo
                            label="Data do voo"
                            erro={erros.voo_data_volta}
                            dica="Preenchida com sua saída. Ajuste se precisar."
                          >
                            <Input
                              type="date"
                              value={form.voo_data_volta}
                              erro={!!erros.voo_data_volta}
                              onChange={(e) => set('voo_data_volta', e.target.value)}
                            />
                          </Campo>
                          <Campo
                            label="Aeroporto de saída"
                            erro={erros.aeroporto_saida_volta}
                          >
                            <Select
                              value={form.aeroporto_saida_volta}
                              erro={!!erros.aeroporto_saida_volta}
                              onChange={(e) =>
                                set('aeroporto_saida_volta', e.target.value)
                              }
                            >
                              <option value="">Selecione…</option>
                              {AEROPORTOS.map((a) => (
                                <option key={a.iata} value={a.iata}>
                                  {a.iata} — {a.nome}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                          <Campo
                            label="Aeroporto de chegada"
                            erro={erros.aeroporto_chegada_volta}
                          >
                            <Select
                              value={form.aeroporto_chegada_volta}
                              erro={!!erros.aeroporto_chegada_volta}
                              onChange={(e) =>
                                set('aeroporto_chegada_volta', e.target.value)
                              }
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
                      </div>
                    )}

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
                  <div className="mb-4 rounded-lg bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-800 ring-1 ring-red-200">
                    ⚠ A lista de passageiros precisa ser enviada com até uma semana de
                    antecedência do embarque.
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-neutral-200 p-3.5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Ida
                      </p>
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
                    </div>

                    <div className="rounded-lg border border-neutral-200 p-3.5">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Retorno
                        </p>
                        <button
                          type="button"
                          onClick={inverterVanRetorno}
                          className="text-xs font-semibold text-neutral-700 underline decoration-marca-500 decoration-2 underline-offset-2"
                        >
                          inverter a ida
                        </button>
                      </div>
                      <div className="space-y-4">
                        <Campo label="Endereço de saída" erro={erros.van_retorno_local}>
                          <Input
                            value={form.van_retorno_local}
                            erro={!!erros.van_retorno_local}
                            maxLength={200}
                            onChange={(e) => set('van_retorno_local', e.target.value)}
                            placeholder="De onde a van sai na volta"
                          />
                        </Campo>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Campo
                            label="Horário de saída"
                            erro={erros.van_retorno_horario}
                          >
                            <Input
                              value={form.van_retorno_horario}
                              erro={!!erros.van_retorno_horario}
                              maxLength={60}
                              onChange={(e) => set('van_retorno_horario', e.target.value)}
                              placeholder="Ex.: 08/10 às 18h"
                            />
                          </Campo>
                          <Campo label="Destino do retorno" erro={erros.van_retorno_destino}>
                            <Input
                              value={form.van_retorno_destino}
                              erro={!!erros.van_retorno_destino}
                              maxLength={200}
                              onChange={(e) => set('van_retorno_destino', e.target.value)}
                              placeholder="Para onde a van leva na volta"
                            />
                          </Campo>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {form.servicos.includes('RODOVIARIO') && (
                <Card
                  titulo="Rodoviário"
                  descricao="A operação define terminal, horários e empresa. Aqui só precisamos saber de onde você sai."
                >
                  <div className="space-y-4">
                    <Campo
                      label="De qual região você sai?"
                      erro={erros.rodo_regiao_saida}
                      dica="Ex.: zona sul de SP, região do ABC, centro."
                    >
                      <Input
                        value={form.rodo_regiao_saida}
                        erro={!!erros.rodo_regiao_saida}
                        maxLength={120}
                        onChange={(e) => set('rodo_regiao_saida', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Cidade / estado" erro={erros.rodo_cidade_estado}>
                      <Input
                        value={form.rodo_cidade_estado}
                        erro={!!erros.rodo_cidade_estado}
                        maxLength={120}
                        onChange={(e) => set('rodo_cidade_estado', e.target.value)}
                        placeholder="Ex.: São Paulo / SP"
                      />
                    </Campo>
                  </div>
                </Card>
              )}

              {form.servicos.includes('CARRO') && (
                <>
                  {form.carros.map((c, i) => (
                    <Card
                      key={i}
                      titulo={`Aluguel de carro ${form.carros.length > 1 ? i + 1 : ''}`.trim()}
                      acao={
                        form.carros.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                'carros',
                                form.carros.filter((_, j) => j !== i),
                              )
                            }
                            className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remover
                          </button>
                        ) : undefined
                      }
                    >
                      <div className="space-y-4">
                        <Campo
                          label="Nome do condutor"
                          erro={erros[`carro.${i}.nome`]}
                          dica="A locadora exige CNH em nome dessa pessoa."
                        >
                          <Input
                            value={c.nome}
                            erro={!!erros[`carro.${i}.nome`]}
                            onChange={(e) => setCarro(i, 'nome', e.target.value)}
                          />
                        </Campo>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Campo label="CPF do condutor" erro={erros[`carro.${i}.cpf`]}>
                            <Input
                              value={c.cpf}
                              inputMode="numeric"
                              erro={!!erros[`carro.${i}.cpf`]}
                              autoComplete="off"
                              onChange={(e) =>
                                setCarro(i, 'cpf', mascaraCpf(e.target.value))
                              }
                              placeholder="000.000.000-00"
                            />
                          </Campo>
                          <Campo
                            label="Data de nascimento"
                            erro={erros[`carro.${i}.nascimento`]}
                            dica="Locadoras exigem idade mínima."
                          >
                            <Input
                              type="date"
                              value={c.nascimento}
                              erro={!!erros[`carro.${i}.nascimento`]}
                              onChange={(e) => setCarro(i, 'nascimento', e.target.value)}
                            />
                          </Campo>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Campo label="Tipo de carro" erro={erros[`carro.${i}.tipo`]}>
                            <Select
                              value={c.tipo}
                              erro={!!erros[`carro.${i}.tipo`]}
                              onChange={(e) => setCarro(i, 'tipo', e.target.value)}
                            >
                              <option value="">Selecione…</option>
                              {TIPOS_CARRO.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                          <Campo label="Câmbio" erro={erros[`carro.${i}.transmissao`]}>
                            <Select
                              value={c.transmissao}
                              erro={!!erros[`carro.${i}.transmissao`]}
                              onChange={(e) =>
                                setCarro(i, 'transmissao', e.target.value)
                              }
                            >
                              <option value="">Selecione…</option>
                              <option value="MANUAL">Manual</option>
                              <option value="AUTOMATICO">Automático</option>
                            </Select>
                          </Campo>
                        </div>
                        <Campo
                          label="Local de preferência para retirada"
                          erro={erros[`carro.${i}.retirada`]}
                          dica="Ex.: aeroporto de Cuiabá, centro de Goiânia, no hotel."
                        >
                          <Input
                            value={c.retirada}
                            erro={!!erros[`carro.${i}.retirada`]}
                            maxLength={200}
                            onChange={(e) => setCarro(i, 'retirada', e.target.value)}
                          />
                        </Campo>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Campo
                            label="Data de retirada"
                            erro={erros[`carro.${i}.retirada_data`]}
                            dica="Sugerimos a entrada; ajuste se pegar o carro antes."
                          >
                            <Input
                              type="date"
                              value={c.retirada_data}
                              erro={!!erros[`carro.${i}.retirada_data`]}
                              onChange={(e) => setCarro(i, 'retirada_data', e.target.value)}
                            />
                          </Campo>
                          <Campo
                            label="Data de devolução"
                            erro={erros[`carro.${i}.devolucao_data`]}
                            dica="Sugerimos a saída; ajuste se devolver depois."
                          >
                            <Input
                              type="date"
                              value={c.devolucao_data}
                              erro={!!erros[`carro.${i}.devolucao_data`]}
                              onChange={(e) => setCarro(i, 'devolucao_data', e.target.value)}
                            />
                          </Campo>
                        </div>
                      </div>
                    </Card>
                  ))}

                  <Botao
                    variante="secundario"
                    className="w-full border-dashed"
                    onClick={() =>
                      set('carros', [
                        ...form.carros,
                        {
                          nome: '',
                          cpf: '',
                          nascimento: '',
                          transmissao: '',
                          tipo: '',
                          retirada: '',
                          retirada_data: form.data_entrada,
                          devolucao_data: form.data_saida,
                        },
                      ])
                    }
                  >
                    + Adicionar outra reserva de carro
                  </Botao>

                  <Card titulo="Observações da locação">
                    <Campo
                      label="Alguma particularidade?"
                      erro={erros.obs_locacao_carro}
                      dica="Período, devolução em local diferente, exigências da equipe."
                    >
                      <Textarea
                        maxLength={1000}
                        value={form.obs_locacao_carro}
                        erro={!!erros.obs_locacao_carro}
                        onChange={(e) => set('obs_locacao_carro', e.target.value)}
                      />
                    </Campo>
                  </Card>
                </>
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
                      {form.tipo_voo === 'IDA_VOLTA'
                        ? 'Ida e volta'
                        : form.tipo_voo === 'VOLTA'
                          ? 'Somente volta'
                          : 'Somente ida'}
                      <br />
                      {form.tipo_voo === 'IDA_VOLTA' ? 'Ida: ' : ''}
                      {form.aeroporto_saida} → {form.aeroporto_chegada}
                      {form.tipo_voo === 'IDA_VOLTA' && (
                        <>
                          <br />
                          Volta: {form.aeroporto_saida_volta} →{' '}
                          {form.aeroporto_chegada_volta}
                        </>
                      )}
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
                    <Linha
                      rotulo={`Carro (${form.carros.length})`}
                      onEditar={() => setPasso(1)}
                    >
                      <ul className="space-y-1.5">
                        {form.carros.map((c, i) => (
                          <li key={i}>
                            <span className="block font-medium">{c.nome}</span>
                            <span className="block text-xs text-neutral-500">
                              {c.cpf} · nasc. {dataBR(c.nascimento)} ·{' '}
                              {TIPOS_CARRO.find((t) => t.value === c.tipo)?.label ?? '—'}{' '}
                              · {c.transmissao === 'AUTOMATICO' ? 'automático' : 'manual'}
                              <br />
                              retirada: {c.retirada}
                              <br />
                              {dataBR(c.retirada_data)} a {dataBR(c.devolucao_data)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {form.obs_locacao_carro && (
                        <span className="mt-1 block text-neutral-500">
                          {form.obs_locacao_carro}
                        </span>
                      )}
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
