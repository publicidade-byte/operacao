export const EQUIPES = [
  { value: 'EQUIPE_MEDICA', label: 'Equipe Médica' },
  { value: 'EQUIPE_TECNICA', label: 'Equipe Técnica' },
  { value: 'DIRETORIA', label: 'Diretoria' },
  { value: 'LOJINHA_FORMA', label: 'Lojinha da Forma' },
  { value: 'FOTIX', label: 'Fotix' },
  { value: 'COMERCIAL', label: 'Comercial' },
  { value: 'CONSELHO', label: 'Conselho' },
  { value: 'RE', label: 'R.E.' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'MONITORIA', label: 'Monitoria' },
  { value: 'SEGURANCA', label: 'Segurança' },
  { value: 'SALVA_VIDAS', label: 'Salva-Vidas' },
  { value: 'DJ', label: 'DJ' },
  { value: 'OPERACIONAL', label: 'Operacional' },
  { value: 'OUTROS', label: 'Outros — informar a área' },
] as const

export type EquipeValue = (typeof EQUIPES)[number]['value']

/**
 * Rótulo da equipe. Para OUTROS, mostra o que a pessoa escreveu — é a
 * informação útil; "Outros" sozinho não diz nada a quem lê depois.
 */
export const equipeLabel = (v: string, outro?: string | null) => {
  if (v === 'OUTROS') return outro?.trim() ? `Outros — ${outro.trim()}` : 'Outros'
  return EQUIPES.find((e) => e.value === v)?.label ?? v
}

export const STATUS_LABEL: Record<string, string> = {
  RECEBIDA: 'Recebida',
  EM_PREENCHIMENTO: 'Em preenchimento',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

/**
 * Cada status com sua cor, para bater o olho e entender a fila.
 * Roxo = acabou de chegar · Azul = operação trabalhando · Amarelo = com o
 * diretor · Verde = aprovado · Vermelho = cancelado ou reprovado.
 */
export const STATUS_CLASS: Record<string, string> = {
  RECEBIDA: 'bg-purple-100 text-purple-800 ring-purple-300',
  EM_PREENCHIMENTO: 'bg-blue-100 text-blue-800 ring-blue-300',
  AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-900 ring-amber-400',
  APROVADA: 'bg-emerald-100 text-emerald-800 ring-emerald-400',
  REPROVADA: 'bg-red-100 text-red-800 ring-red-300',
  CONCLUIDA: 'bg-neutral-900 text-white ring-neutral-900',
  CANCELADA: 'bg-red-600 text-white ring-red-700',
}

/** Cores fixas por pessoa, para reconhecer o responsável de relance. */
const CORES_RESPONSAVEL = [
  'bg-sky-100 text-sky-900 ring-sky-300',
  'bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-300',
  'bg-lime-100 text-lime-900 ring-lime-300',
  'bg-orange-100 text-orange-900 ring-orange-300',
  'bg-teal-100 text-teal-900 ring-teal-300',
  'bg-violet-100 text-violet-900 ring-violet-300',
  'bg-rose-100 text-rose-900 ring-rose-300',
  'bg-cyan-100 text-cyan-900 ring-cyan-300',
]

/** Mesma pessoa sempre na mesma cor, derivada do nome. */
export function corResponsavel(nome: string) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return CORES_RESPONSAVEL[h % CORES_RESPONSAVEL.length]
}

/**
 * Cada serviço sempre na mesma cor, para bater o olho na tabela e saber do
 * que se trata sem ler. Diferente de `corResponsavel`, que sorteia a cor a
 * partir do nome: aqui são cinco valores fixos, então a escolha é explícita
 * — aéreo verde e carro vermelho foram pedidos assim.
 *
 * Mesmo formato visual das etiquetas de responsável (fundo claro, texto
 * escuro, anel) para não competir com as cores de status.
 */
const CORES_SERVICO: Record<string, string> = {
  AEREO: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  CARRO: 'bg-red-100 text-red-900 ring-red-300',
  HOSPEDAGEM: 'bg-sky-100 text-sky-900 ring-sky-300',
  VAN: 'bg-violet-100 text-violet-900 ring-violet-300',
  RODOVIARIO: 'bg-amber-100 text-amber-900 ring-amber-300',
}

export const corServico = (v: string) =>
  CORES_SERVICO[v] ?? 'bg-neutral-100 text-neutral-700 ring-neutral-300'

/**
 * Quando a operação reserva fora do hotel dos passageiros, a lista de nomes
 * costuma demorar (a empresa de ônibus envia depois). Aí o que se reserva é
 * quarto, não pessoa — por isso estes dois campos.
 */
export const TIPOS_QUARTO = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'DUPLO', label: 'Duplo' },
  { value: 'TRIPLO', label: 'Triplo' },
  { value: 'QUADRUPLO', label: 'Quádruplo' },
  { value: 'QUINTUPLO', label: 'Quíntuplo' },
]

export const ALIMENTACAO = [
  { value: 'COM_CAFE', label: 'Com café' },
  { value: 'SEM_CAFE', label: 'Sem café' },
]

export const tipoQuartoLabel = (v?: string | null) =>
  TIPOS_QUARTO.find((t) => t.value === v)?.label ?? v ?? '—'

export const alimentacaoLabel = (v?: string | null) =>
  ALIMENTACAO.find((a) => a.value === v)?.label ?? v ?? '—'

/**
 * Como a solicitação se identifica na tela.
 *
 * A "operação avulsa" (Colab, Universidade Forma, Porto Seguro…) é uma linha
 * de fachada no calendário: mostrar o nome dela e o período fictício não diz
 * nada a quem lê. O que identifica essas demandas é o centro de custo.
 */
export function nomeDestino(s: {
  centro_custo?: string | null
  edicoes?: { destino?: string; avulsa?: boolean } | null
}) {
  if (s.edicoes?.avulsa) return s.centro_custo || 'Outras operações'
  return s.edicoes?.destino ?? '—'
}

export const TIPOS_CARRO = [
  { value: 'HATCH', label: 'Hatch' },
  { value: 'SEDAN', label: 'Sedan' },
  { value: 'SUV', label: 'SUV' },
]

export const STATUS_ORDEM = [
  'RECEBIDA',
  'EM_PREENCHIMENTO',
  'AGUARDANDO_APROVACAO',
  'APROVADA',
  'CONCLUIDA',
]

/**
 * Aeroportos brasileiros mais usados nas rotas do Forma 9.
 *
 * São Paulo e Rio usam o código de cidade (SAO, RIO) em vez do aeroporto
 * específico: quem solicita raramente sabe de qual terminal vai sair, e a
 * escolha entre Guarulhos/Congonhas/Viracopos é da operação, na cotação.
 */
export const AEROPORTOS = [
  { iata: 'SAO', nome: 'São Paulo — qualquer aeroporto' },
  { iata: 'RIO', nome: 'Rio de Janeiro — qualquer aeroporto' },
  { iata: 'BSB', nome: 'Brasília' },
  { iata: 'CNF', nome: 'Belo Horizonte — Confins' },
  { iata: 'CWB', nome: 'Curitiba' },
  { iata: 'FLN', nome: 'Florianópolis' },
  { iata: 'POA', nome: 'Porto Alegre' },
  { iata: 'NVT', nome: 'Navegantes' },
  { iata: 'CGB', nome: 'Cuiabá' },
  { iata: 'CGR', nome: 'Campo Grande' },
  { iata: 'GYN', nome: 'Goiânia' },
  { iata: 'SSA', nome: 'Salvador' },
  { iata: 'REC', nome: 'Recife' },
  { iata: 'FOR', nome: 'Fortaleza' },
  { iata: 'MCZ', nome: 'Maceió' },
  { iata: 'NAT', nome: 'Natal' },
  { iata: 'JPA', nome: 'João Pessoa' },
  { iata: 'AJU', nome: 'Aracaju' },
  { iata: 'THE', nome: 'Teresina' },
  { iata: 'SLZ', nome: 'São Luís' },
  { iata: 'BEL', nome: 'Belém' },
  { iata: 'MAO', nome: 'Manaus' },
  { iata: 'VIX', nome: 'Vitória' },
  { iata: 'IGU', nome: 'Foz do Iguaçu' },
  { iata: 'UDI', nome: 'Uberlândia' },
  { iata: 'RAO', nome: 'Ribeirão Preto' },
  { iata: 'SJP', nome: 'São José do Rio Preto' },
  { iata: 'LDB', nome: 'Londrina' },
  { iata: 'MGF', nome: 'Maringá' },
  { iata: 'JOI', nome: 'Joinville' },
  { iata: 'PLU', nome: 'Belo Horizonte — Pampulha' },
  { iata: 'PMW', nome: 'Palmas' },
  { iata: 'BPS', nome: 'Porto Seguro' },
  { iata: 'IOS', nome: 'Ilhéus' },
  { iata: 'JJD', nome: 'Jericoacoara' },
]

export const aeroportoLabel = (iata?: string | null) => {
  if (!iata) return '—'
  const a = AEROPORTOS.find((x) => x.iata === iata)
  return a ? `${a.iata} — ${a.nome}` : iata
}

/**
 * Serviços que o solicitante pode pedir. Substitui o antigo "modal" único —
 * uma mesma viagem pode precisar de aéreo, carro e hospedagem ao mesmo tempo.
 */
export const SERVICOS = [
  {
    value: 'AEREO',
    label: 'Solicitação de aéreo',
    descricao: 'Passagem de avião, ida e/ou volta',
  },
  {
    value: 'HOSPEDAGEM',
    label: 'Solicitação de hospedagem',
    descricao: 'Reserva de hotel para o período da operação',
  },
  {
    value: 'CARRO',
    label: 'Solicitação de aluguel de carro',
    descricao: 'Carro alugado, com condutor identificado',
  },
  {
    value: 'VAN',
    label: 'Solicitação de aluguel de van ou ônibus',
    descricao: 'Van ou ônibus fretado para levar o grupo',
  },
  {
    value: 'RODOVIARIO',
    label: 'Solicitação de rodoviário',
    descricao: 'Passagem de ônibus',
  },
] as const

export const servicoLabel = (v: string) =>
  SERVICOS.find((s) => s.value === v)?.label ?? v

/**
 * Versão curta, para listas: "Aéreo · Hospedagem · Aluguel de van".
 * O rótulo longo ("Solicitação de aéreo") faz sentido no formulário, onde a
 * pessoa está escolhendo; numa linha de lista ele só repete a palavra
 * "Solicitação" três vezes e empurra o resto para fora da tela.
 */
export const servicoCurto = (v: string) => {
  const l = SERVICOS.find((s) => s.value === v)?.label ?? v
  const sem = l.replace(/^Solicitação de\s+/i, '')
  return sem.charAt(0).toUpperCase() + sem.slice(1)
}

/** Serviços que envolvem deslocamento — usados para exigir observações. */
export const SERVICOS_TRANSPORTE = ['AEREO', 'RODOVIARIO', 'VAN']
