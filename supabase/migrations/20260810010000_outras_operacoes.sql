-- "OUTRAS OPERAÇÕES": pedidos que não pertencem a nenhum destino do Forma 9.
--
-- Colab, Universidade Forma, Porto Seguro e afins usam os mesmos serviços,
-- mas não estão no calendário. O que identifica esses pedidos é o CENTRO DE
-- CUSTO, informado por quem solicita.
--
-- Por que uma edição de mentira em vez de deixar `edicao_id` nulo: a
-- solicitação é ligada à edição em toda parte — nas views do diretor, no
-- painel, na consulta pública e nas notificações, que leem `edicoes.destino`
-- sem checar nulo. Tornar a coluna opcional espalharia `if` por tudo e
-- quebraria calado em algum canto. Uma linha marcada como avulsa mantém o
-- modelo inteiro de pé e concentra a exceção em um lugar só.

alter table edicoes add column if not exists avulsa boolean not null default false;

comment on column edicoes.avulsa is
  'Operacao fora do calendario: o solicitante informa o centro de custo e as datas na mao.';

alter table solicitacoes add column if not exists centro_custo text;

comment on column solicitacoes.centro_custo is
  'Colab, Universidade Forma, Porto Seguro... Só existe quando a edicao e avulsa.';

insert into edicoes (codigo, destino, hotel, data_inicio, data_fim, noites, ativa, avulsa)
select 'OUTRAS-OPERACOES', 'OUTRAS OPERAÇÕES',
       'Colab, Universidade Forma, Porto Seguro e outros',
       date '2026-01-01', date '2026-12-31', 0, true, true
where not exists (select 1 from edicoes where codigo = 'OUTRAS-OPERACOES');
