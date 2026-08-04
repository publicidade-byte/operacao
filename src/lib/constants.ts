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
 * Paleta: cinza para estados neutros, amarelo da marca para "precisa de ação",
 * e só verde/vermelho como sinal semântico de aprovado/reprovado.
 */
export const STATUS_CLASS: Record<string, string> = {
  RECEBIDA: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
  EM_PREENCHIMENTO: 'bg-white text-neutral-800 ring-neutral-400',
  AGUARDANDO_APROVACAO: 'bg-marca-100 text-neutral-900 ring-marca-400',
  APROVADA: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  REPROVADA: 'bg-red-50 text-red-800 ring-red-300',
  CONCLUIDA: 'bg-neutral-900 text-white ring-neutral-900',
  CANCELADA: 'bg-neutral-100 text-neutral-400 ring-neutral-200',
}

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
