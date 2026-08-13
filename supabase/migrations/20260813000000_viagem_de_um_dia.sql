-- Viagem de um dia passa a ser válida.
--
-- A regra exigia `data_saida > data_entrada`, o que barrava as operações em
-- que o grupo vai de manhã e volta à noite — que existem e são comuns.
-- O que continua barrado é a saída ANTES da entrada, que é erro de digitação.

alter table solicitacoes drop constraint if exists datas_ok;
alter table solicitacoes add constraint datas_ok check (data_saida >= data_entrada);
