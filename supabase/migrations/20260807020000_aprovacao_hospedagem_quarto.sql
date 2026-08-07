-- O diretor também precisa ver a hospedagem fora do hotel dos passageiros.
--
-- A visão dele mostrava só `hotel` — que, nesse caso, é o hotel da operação,
-- e não onde a pessoa vai dormir. Ele aprovaria o custo sem saber quantos
-- quartos, de que tipo, com ou sem café, nem em que hotel.
--
-- Continua sem CPF e sem data de nascimento.

drop view if exists v_aprovacao_hospedagem;
create view v_aprovacao_hospedagem
with (security_invoker = false) as
select h.colaborador_id, h.hotel, h.hotel_hospedagem, h.endereco,
       h.tipo_quarto, h.alimentacao, h.dividindo_com,
       h.check_in, h.check_out, h.valor_diaria, h.codigo_reserva, h.observacoes,
       c.solicitacao_id
from hospedagem_detalhe h
join colaboradores c on c.id = h.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_hospedagem to authenticated;

-- E o pedido em si: quantidade de quartos, tipo e alimentação.
drop view if exists v_aprovacao_solicitacoes;
create view v_aprovacao_solicitacoes with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.servicos,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.precisa_bagagem, s.tipo_voo, s.voo_data_ida, s.voo_data_volta,
  s.van_local_saida, s.van_horario_saida, s.van_destino, s.van_qtd_passageiros,
  s.van_retorno_local, s.van_retorno_horario, s.van_retorno_destino,
  s.rodo_regiao_saida, s.rodo_cidade_estado,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.carro_condutor_nome, s.carro_transmissao,
  s.hosp_externa_operacao, s.hosp_externa_obs,
  s.hosp_qtd_quartos, s.hosp_tipo_quarto, s.hosp_alimentacao,
  s.solicitante_nome, s.solicitante_email, s.solicitante_whatsapp,
  coalesce(s.custo_total_manual, s.custo_total) as custo_total,
  s.observacoes_internas,
  s.created_at, s.updated_at,
  e.destino, e.hotel, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax,
  (select count(*) from solicitacao_edicoes se where se.solicitacao_id = s.id)
    as qtd_operacoes
from solicitacoes s
join edicoes e on e.id = s.edicao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_solicitacoes to authenticated;
