export type Edicao = {
  id: string
  codigo: string
  destino: string
  hotel: string
  data_inicio: string
  data_fim: string
  noites: number
  ativa: boolean
  /** Operação fora do calendário — o solicitante informa centro de custo e datas. */
  avulsa?: boolean
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
  numero_onibus: string | null
  apresentacao_em: string | null
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
  /** Fora do hotel do pax: onde a operação de fato hospedou a pessoa. */
  hotel_hospedagem: string | null
  endereco: string | null
  tipo_quarto: string | null
  alimentacao: string | null
  dividindo_com: string | null
  check_in: string | null
  check_out: string | null
  /** Valor fechado da hospedagem. Substituiu `valor_diaria`, que era multiplicado por noites. */
  valor_total: number | null
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
  modal: 'AEREO' | 'RODOVIARIO' | 'VAN' | null
  aeroporto_saida: string | null
  aeroporto_chegada: string | null
  precisa_bagagem: boolean | null
  van_local_saida: string | null
  van_horario_saida: string | null
  van_destino: string | null
  van_qtd_passageiros: number | null
  hosp_externa_operacao: boolean | null
  hosp_externa_obs: string | null
  centro_custo: string | null
  hosp_qtd_quartos: number | null
  hosp_tipo_quarto: string | null
  hosp_alimentacao: string | null
  tipo_voo: string | null
  aeroporto_saida_volta: string | null
  aeroporto_chegada_volta: string | null
  voo_data_ida: string | null
  voo_data_volta: string | null
  rodo_regiao_saida: string | null
  rodo_cidade_estado: string | null
  van_retorno_local: string | null
  van_retorno_horario: string | null
  van_retorno_destino: string | null
  carro_condutor_nascimento: string | null
  servicos: string[]
  carro_condutor_nome: string | null
  carro_condutor_cpf: string | null
  carro_transmissao: string | null
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

export type LocacaoVan = {
  id?: string
  solicitacao_id: string
  empresa: string | null
  motorista: string | null
  telefone: string | null
  placa: string | null
  local_saida: string | null
  saida_em: string | null
  local_chegada: string | null
  chegada_em: string | null
  qtd_passageiros: number | null
  preco: number | null
  observacoes: string | null
}
