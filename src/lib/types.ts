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

/** Catálogo das etapas do processo da operação — o cabeçalho da planilha. */
export type EtapaModelo = {
  codigo: string
  nome: string
  fase: 'PRE_VOUCHER' | 'POS_VOUCHER'
  ordem: number
  /** Dias antes de `Edicao.data_inicio`. Nulo = etapa sem prazo cobrado. */
  prazo_dias: number | null
  ativa: boolean
}

/** Uma etapa de uma operação específica: a célula da planilha, com carimbo. */
export type EtapaEdicao = {
  id: string
  edicao_id: string
  etapa_codigo: string
  concluida: boolean
  concluida_por: string | null
  concluida_em: string | null
  observacao: string | null
  updated_at: string
}

/** Contagens por operação, vindas da view `v_painel_etapas`. */
export type PainelEtapas = {
  edicao_id: string
  codigo: string
  destino: string
  hotel: string
  data_inicio: string
  data_fim: string
  total: number
  concluidas: number
  concluidas_pre: number
  total_pre: number
  concluidas_pos: number
  total_pos: number
  atrasadas: number
  voucher_enviado: boolean
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
  /**
   * Decisão do diretor sobre esta pessoa na rodada em curso.
   * Nulo = ainda não decidido, ou a rodada nem começou.
   */
  aprovacao: boolean | null
  aprovacao_em: string | null
  aprovacao_obs: string | null
}

export type Voo = {
  id?: string
  colaborador_id: string
  trecho: 'IDA' | 'VOLTA'
  companhia: string | null
  numero_voo: string | null
  aeroporto_origem: string | null
  aeroporto_destino: string | null
  /** OBSOLETOS: eram timestamptz e deslocavam a hora. Use os pares abaixo. */
  partida: string | null
  chegada: string | null
  partida_data: string | null
  partida_hora: string | null
  chegada_data: string | null
  chegada_hora: string | null
  localizador: string | null
  /** Até quando a reserva pode ser emitida. Passou disso, a tarifa cai. */
  emissao_prazo_data: string | null
  emissao_prazo_hora: string | null
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
  horario_volta: string | null
  apresentacao_data: string | null
  apresentacao_hora: string | null
  ida_data: string | null
  ida_hora: string | null
  volta_data: string | null
  volta_hora: string | null
  local_embarque_ida: string | null
  local_embarque_volta: string | null
  preco: number | null
  observacoes: string | null
}

export type HospedagemDetalhe = {
  id?: string
  colaborador_id: string
  /**
   * Qual das duas hospedagens esta linha responde. A mesma pessoa pode ter as
   * duas: o hotel da operação e um hotel fora, para chegar antes ou sair depois.
   */
  tipo?: 'HOTEL_PAX' | 'FORA_HOTEL_PAX'
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

export type DayUseDetalhe = {
  id?: string
  colaborador_id: string
  hotel: string | null
  /** O dia vem da solicitação; fica aqui para a operação poder ajustar. */
  data: string | null
  /** Por pessoa, que é como o hotel cobra day use. */
  valor: number | null
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
  retirada_data: string | null
  retirada_hora: string | null
  devolucao_data: string | null
  devolucao_hora: string | null
  condutor_colaborador_id: string | null
  /** A qual condutor pedido (`solicitacao_carros`) esta locação responde. */
  pedido_id?: string | null
  /** Código pelo qual a locadora acha o carro no balcão. */
  codigo_reserva?: string | null
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
  /** OBSOLETO: texto livre antigo. Use van_data_saida + van_hora_saida. */
  van_horario_saida: string | null
  van_data_saida: string | null
  van_hora_saida: string | null
  van_retorno_data: string | null
  van_retorno_hora: string | null
  van_destino: string | null
  van_qtd_passageiros: number | null
  van_tipo_veiculo: string | null
  van_qtd_veiculos: number | null
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
  /** Serviços da rodada de aprovação em curso. Nulo quando não há rodada. */
  escopo_aprovacao: string[] | null
  /** Serviços que o diretor já aprovou, acumulado entre rodadas. */
  servicos_aprovados: string[]
  /** Dados mexidos depois da decisão do diretor. Sai ao reenviar. */
  alterada_apos_aprovacao: boolean
  /**
   * Controle interno da operação: as pessoas já entraram no rooming do hotel.
   * Não é etapa de aprovação e não mexe no status.
   */
  rooming_ok: boolean
  rooming_em: string | null
  rooming_por: string | null
  /** Dia do day use. Um só: quem faz day use não dorme no destino. */
  day_use_data: string | null
  /** Controle da operação: a passagem aérea já foi emitida. */
  aereo_emitido: boolean
  aereo_emitido_em: string | null
  /** Controle da operação: a passagem do ônibus da operação já foi comprada. */
  rodoviario_ok: boolean
  rodoviario_em: string | null
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
  /** Lixeira: preenchido = fora das telas, mas guardado e restaurável. */
  excluida_em: string | null
  excluida_por: string | null
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
  /** Serviços que esta decisão cobriu. Nulo nas decisões antigas, sempre integrais. */
  escopo: string[] | null
  /** Preenchido quando quem decidiu foi o super admin, e não o diretor. */
  registrado_por: string | null
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
  saida_data: string | null
  saida_hora: string | null
  chegada_data: string | null
  chegada_hora: string | null
  qtd_passageiros: number | null
  preco: number | null
  observacoes: string | null
}
