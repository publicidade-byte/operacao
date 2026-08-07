-- Hospedagem fora do hotel dos passageiros, reservada pela operação.
--
-- Nesse caso a lista de nomes quase nunca existe na hora do pedido: a
-- empresa de ônibus demora para mandar os dados dos passageiros. O que se
-- sabe é quantos quartos, de que tipo e se inclui café.
--
-- Então a solicitação passa a poder nascer sem colaborador nenhum — mas
-- SÓ nesse caso. Nos demais, nome/CPF/nascimento continuam obrigatórios,
-- e quem garante isso é a Edge Function `criar-solicitacao`, que valida
-- na entrada (um CHECK aqui não enxerga a tabela de colaboradores).

alter table solicitacoes add column if not exists hosp_qtd_quartos int;
alter table solicitacoes add column if not exists hosp_tipo_quarto text;
alter table solicitacoes add column if not exists hosp_alimentacao text;

comment on column solicitacoes.hosp_qtd_quartos is
  'Quantos quartos a operacao precisa reservar, quando a lista de pessoas ainda nao existe.';

alter table solicitacoes drop constraint if exists hosp_tipo_quarto_valido;
alter table solicitacoes add constraint hosp_tipo_quarto_valido check (
  hosp_tipo_quarto is null
  or hosp_tipo_quarto in ('SINGLE', 'DUPLO', 'TRIPLO', 'QUADRUPLO', 'QUINTUPLO')
);

alter table solicitacoes drop constraint if exists hosp_alimentacao_valida;
alter table solicitacoes add constraint hosp_alimentacao_valida check (
  hosp_alimentacao is null or hosp_alimentacao in ('COM_CAFE', 'SEM_CAFE')
);

alter table solicitacoes drop constraint if exists hosp_qtd_quartos_positiva;
alter table solicitacoes add constraint hosp_qtd_quartos_positiva check (
  hosp_qtd_quartos is null or (hosp_qtd_quartos > 0 and hosp_qtd_quartos <= 200)
);
