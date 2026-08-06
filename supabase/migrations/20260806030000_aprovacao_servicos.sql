-- A tela do diretor precisa mostrar O QUE foi pedido.
--
-- A visão entregava `modal` e `precisa_locacao_carro`, que são os campos
-- antigos — `modal` guarda um serviço só. O diretor que recebia um pedido
-- de aéreo + van via "Aéreo" e mais nada. Agora vai `servicos`, que é a
-- lista completa e a fonte de verdade desde a mudança do formulário.
--
-- Também entram `solicitante_whatsapp` e `rodo_cidade_estado`: o diretor
-- decide olhando para quem pediu e para onde vai.
--
-- Continua sem CPF e sem data de nascimento — dado sensível não sai do
-- servidor para a área do diretor.

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
