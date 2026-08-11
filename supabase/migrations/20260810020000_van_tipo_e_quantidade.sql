-- Porte e quantidade do fretamento.
--
-- O mesmo serviço atende van e ônibus, e o grupo pode precisar de mais de um
-- veículo. Sem esses dois campos a operação tinha que deduzir pelo número de
-- passageiros — que não diz se são duas vans ou um ônibus.

alter table solicitacoes add column if not exists van_tipo_veiculo text;
alter table solicitacoes add column if not exists van_qtd_veiculos int;

comment on column solicitacoes.van_tipo_veiculo is
  'VAN ou ONIBUS: o porte do veiculo fretado, escolhido por quem solicita.';
comment on column solicitacoes.van_qtd_veiculos is
  'Quantos veiculos a operacao precisa contratar.';

alter table solicitacoes drop constraint if exists van_tipo_veiculo_valido;
alter table solicitacoes add constraint van_tipo_veiculo_valido check (
  van_tipo_veiculo is null or van_tipo_veiculo in ('VAN', 'ONIBUS')
);

alter table solicitacoes drop constraint if exists van_qtd_veiculos_positiva;
alter table solicitacoes add constraint van_qtd_veiculos_positiva check (
  van_qtd_veiculos is null or (van_qtd_veiculos > 0 and van_qtd_veiculos <= 50)
);

-- A visão do diretor também mostra o que foi pedido.
drop view if exists v_aprovacao_solicitacoes;
create view v_aprovacao_solicitacoes with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.servicos, s.centro_custo,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.precisa_bagagem, s.tipo_voo, s.voo_data_ida, s.voo_data_volta,
  s.van_local_saida, s.van_horario_saida, s.van_destino, s.van_qtd_passageiros,
  s.van_tipo_veiculo, s.van_qtd_veiculos,
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
  e.destino, e.hotel, e.avulsa, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax,
  (select count(*) from solicitacao_edicoes se where se.solicitacao_id = s.id)
    as qtd_operacoes
from solicitacoes s
join edicoes e on e.id = s.edicao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_solicitacoes to authenticated;
