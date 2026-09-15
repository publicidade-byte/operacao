-- =====================================================================
-- DAY USE EM VÁRIOS DIAS
--
-- A mesma pessoa faz day use mais de uma vez na mesma operação: vai ao
-- destino, passa o dia e volta, em dias diferentes. O pedido guardava um
-- dia só, e o painel oferecia um bloco só — os outros dias não tinham
-- onde ser registrados nem cobrados.
--
-- `day_use_data` continua existindo com o PRIMEIRO dia: é o que as
-- telas e mensagens antigas leem, e continuar preenchido é o que evita
-- quebrá-las.
-- =====================================================================

alter table solicitacoes
  add column if not exists day_use_datas date[] not null default '{}';

comment on column solicitacoes.day_use_datas is
  'Todos os dias de day use pedidos. A mesma pessoa pode fazer varios na mesma operacao.';

comment on column solicitacoes.day_use_data is
  'Primeiro dia de day use. Mantido para leitura antiga; a lista esta em day_use_datas.';

update solicitacoes
   set day_use_datas = array[day_use_data]
 where day_use_data is not null and cardinality(day_use_datas) = 0;

-- Uma linha por pessoa E por dia. Sem a data na chave, gravar o segundo
-- dia sobrescrevia o primeiro.
update day_use_detalhe du
   set data = s.day_use_data
  from colaboradores c, solicitacoes s
 where c.id = du.colaborador_id and s.id = c.solicitacao_id
   and du.data is null and s.day_use_data is not null;

alter table day_use_detalhe drop constraint if exists day_use_detalhe_colaborador_id_key;
create unique index if not exists day_use_detalhe_colab_data_idx
  on day_use_detalhe (colaborador_id, data);

comment on table day_use_detalhe is
  'Um day use por pessoa e por dia: quem vai ao destino varias vezes sem dormir tem uma linha por dia.';
