-- Cada hospedagem com as suas próprias datas.
--
-- Quando as duas hospedagens viraram serviços separados, as datas não foram
-- junto: continuou existindo UM par de datas no pedido — a estadia —, e ele
-- não consegue descrever duas estadias diferentes. O caso que expôs isso foi
-- a F9-2026-0197: hotel da operação de 01 a 07/10, e hotel fora em SP de 30/09
-- para 01/10, para seguir cedo para o CAMP SP. A segunda data só existia
-- escrita na observação, e a operação teve de catar no texto.
--
-- Agora cada hospedagem tem o seu par. A estadia (`data_entrada`/`data_saida`)
-- continua existindo — é o período da solicitação inteira, usado para
-- ordenar, filtrar e calcular o resto —, mas deixa de ser a data de hotel.

alter table solicitacoes
  add column if not exists hosp_op_entrada   date,
  add column if not exists hosp_op_saida     date,
  add column if not exists hosp_fora_entrada date,
  add column if not exists hosp_fora_saida   date;

comment on column solicitacoes.hosp_op_entrada is
  'Check-in pedido no hotel da operacao. Pode diferir da estadia da solicitacao.';
comment on column solicitacoes.hosp_fora_entrada is
  'Check-in pedido no hotel fora do pax — em geral antes ou depois da operacao.';

-- Saída antes da entrada é erro de digitação em qualquer das duas. Mesmo dia
-- vale: há quem só precise de um pernoite de passagem.
alter table solicitacoes drop constraint if exists hosp_op_datas_ok;
alter table solicitacoes add constraint hosp_op_datas_ok
  check (hosp_op_entrada is null or hosp_op_saida is null or hosp_op_saida >= hosp_op_entrada);

alter table solicitacoes drop constraint if exists hosp_fora_datas_ok;
alter table solicitacoes add constraint hosp_fora_datas_ok
  check (hosp_fora_entrada is null or hosp_fora_saida is null or hosp_fora_saida >= hosp_fora_entrada);
