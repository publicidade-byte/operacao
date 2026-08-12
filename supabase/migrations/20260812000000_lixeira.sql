-- Excluir deixa de apagar: passa a mandar para a lixeira.
--
-- POR QUE: o botão de excluir fazia DELETE, e o cascade levava junto
-- colaboradores, voos, hospedagem, aprovações E o histórico de eventos —
-- ou seja, apagava até o rastro de que a solicitação existiu. Sem backup
-- no plano gratuito (PITR desligado, zero backups), não havia de onde
-- trazer de volta. Foi assim que se perdeu tudo em 12/08/2026.
--
-- Agora `excluida_em` marca a linha. Ela some das telas, mas continua no
-- banco e volta com um clique. Quem quiser apagar de verdade tem que
-- fazer isso pelo banco, deliberadamente.

alter table solicitacoes add column if not exists excluida_em   timestamptz;
alter table solicitacoes add column if not exists excluida_por  text;

comment on column solicitacoes.excluida_em is
  'Exclusao logica: a linha continua no banco e pode ser restaurada.';
comment on column solicitacoes.excluida_por is
  'Nome de quem mandou para a lixeira, para o historico dizer quem foi.';

create index if not exists solicitacoes_excluida_idx on solicitacoes (excluida_em);

-- O diretor não deve ver na fila dele o que a operação excluiu.
-- (A view completa é recriada aqui com a condição nova.)
drop view if exists v_aprovacao_solicitacoes;
create view v_aprovacao_solicitacoes with (security_invoker = false) as
select s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem, s.servicos, s.centro_custo,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.precisa_bagagem, s.tipo_voo, s.voo_data_ida, s.voo_data_volta,
  s.van_local_saida, s.van_horario_saida, s.van_destino, s.van_qtd_passageiros,
  s.van_data_saida, s.van_hora_saida, s.van_retorno_data, s.van_retorno_hora,
  s.van_tipo_veiculo, s.van_qtd_veiculos,
  s.van_retorno_local, s.van_retorno_destino,
  s.rodo_regiao_saida, s.rodo_cidade_estado,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.carro_condutor_nome, s.carro_transmissao,
  s.hosp_externa_operacao, s.hosp_externa_obs,
  s.hosp_qtd_quartos, s.hosp_tipo_quarto, s.hosp_alimentacao,
  s.solicitante_nome, s.solicitante_email, s.solicitante_whatsapp,
  coalesce(s.custo_total_manual, s.custo_total) as custo_total,
  s.observacoes_internas, s.created_at, s.updated_at,
  e.destino, e.hotel, e.avulsa, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax,
  (select count(*) from solicitacao_edicoes se where se.solicitacao_id = s.id) as qtd_operacoes
from solicitacoes s
join edicoes e on e.id = s.edicao_id
where s.diretor_id = diretor_atual() and s.excluida_em is null;

grant select on v_aprovacao_solicitacoes to authenticated;
