export type Edicao = {
  id: string
  codigo: string
  destino: string
  hotel: string
  data_inicio: string
  data_fim: string
  noites: number
  ativa: boolean
}

export type Diretor = {
  id: string
  nome: string
  email: string | null
  slack_user_id: string | null
  ativo: boolean
  ordem: number
}

export type Status =
  | 'RECEBIDA'
  | 'EM_PREENCHIMENTO'
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADA'
  | 'REPROVADA'
  | 'CONCLUIDA'
  | 'CANCELADA'

export type Colaborador = {
  id: string
  solicitacao_id: string
  nome_completo: string
  cpf: string
  data_nascimento: string
  ordem: number
}

export type Voo = {
  id?: string
  colaborador_id: string
  trecho: 'IDA' | 'VOLTA'
  companhia: string | null
  numero_voo: string | null
  aeroporto_origem: string | null
  aeroporto_destino: string | null
  partida: string | null
  chegada: string | null
  localizador: string | null
  bagagem_despachada: boolean | null
  preco: number | null
  observacoes: string | null
}

export type Rodoviario = {
  id?: string
  colaborador_id: string
  empresa: string | null
  horario_ida: string | null
  local_embarque_ida: string | null
  horario_volta: string | null
  local_embarque_volta: string | null
  preco: number | null
  observacoes: string | null
}

export type HospedagemDetalhe = {
  id?: string
  colaborador_id: string
  hotel: string | null
  tipo_quarto: string | null
  dividindo_com: string | null
  check_in: string | null
  check_out: string | null
  valor_diaria: number | null
  codigo_reserva: string | null
  observacoes: string | null
}

export type LocacaoCarro = {
  id?: string
  solicitacao_id: string
  locadora: string | null
  categoria: string | null
  retirada_local: string | null
  retirada_em: string | null
  devolucao_local: string | null
  devolucao_em: string | null
  condutor_colaborador_id: string | null
  preco: number | null
  observacoes: string | null
}

export type Solicitacao = {
  id: string
  protocolo: string
  token_acompanhamento: string
  edicao_id: string
  equipe: string
  equipe_outro: string | null
  diretor_id: string
  solicitante_nome: string
  solicitante_email: string
  solicitante_whatsapp: string
  data_entrada: string
  data_saida: string
  tipo_hospedagem: 'HOTEL_PAX' | 'FORA_HOTEL_PAX'
  precisa_transporte: boolean
  modal: 'AEREO' | 'RODOVIARIO' | null
  aeroporto_saida: string | null
  aeroporto_chegada: string | null
  precisa_bagagem: boolean | null
  obs_transporte: string
  precisa_locacao_carro: boolean
  obs_locacao_carro: string | null
  status: Status
  custo_total: number | null
  custo_total_manual: number | null
  observacoes_internas: string | null
  responsavel_id: string | null
  created_at: string
  updated_at: string
  edicoes?: Edicao
  diretores?: Diretor
  colaboradores?: Colaborador[]
}

export type Evento = {
  id: number
  solicitacao_id: string
  tipo: string
  autor_nome: string | null
  descricao: string
  payload: unknown
  created_at: string
}

export type Aprovacao = {
  id: string
  solicitacao_id: string
  diretor_id: string
  aprovado: boolean
  decidido_em: string
  slack_message_url: string | null
  evidencia_path: string | null
  observacao: string | null
  created_at: string
}

export type AdminUser = {
  id: string
  nome: string
  email: string
  role: 'OPERACIONAL' | 'GESTOR'
  ativo: boolean
  super_admin?: boolean
}
