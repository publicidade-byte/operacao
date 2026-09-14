-- =====================================================================
-- HOSPEDAGEM POR OPERAÇÃO
--
-- Uma solicitação pode cobrir várias operações, e elas nem sempre são
-- seguidas: a MED LAKE tem quatro datas espalhadas. Quem vai às quatro
-- dorme quatro vezes, em quatro períodos diferentes — mas a hospedagem
-- era uma linha por pessoa e por tipo, então o painel só oferecia um
-- bloco, com as datas da primeira operação. As outras três não tinham
-- onde ser preenchidas.
--
-- Agora cada hospedagem aponta para a operação a que responde, e cada
-- operação da solicitação guarda a entrada e a saída pedidas para ela.
--
-- As linhas que já existem passam a pertencer à operação principal da
-- solicitação — é a ela que se referem. As demais operações aparecem
-- vazias no painel, com as datas do calendário como ponto de partida.
-- =====================================================================

-- ---------- 1. DATAS POR OPERAÇÃO -------------------------------------
alter table solicitacao_edicoes
  add column if not exists data_entrada date,
  add column if not exists data_saida date;

comment on column solicitacao_edicoes.data_entrada is
  'Chegada pedida para ESTA operação. Nulo = usar a data de início dela.';
comment on column solicitacao_edicoes.data_saida is
  'Saída pedida para ESTA operação. Nulo = usar a data de fim dela.';

-- ---------- 2. HOSPEDAGEM AMARRADA À OPERAÇÃO -------------------------
alter table hospedagem_detalhe
  add column if not exists edicao_id uuid references edicoes(id);

update hospedagem_detalhe h
   set edicao_id = s.edicao_id
  from colaboradores c, solicitacoes s
 where c.id = h.colaborador_id
   and s.id = c.solicitacao_id
   and h.edicao_id is null;

alter table hospedagem_detalhe alter column edicao_id set not null;

comment on column hospedagem_detalhe.edicao_id is
  'A operação desta estadia. Quem vai a várias dorme em várias, uma linha cada.';

-- O par pessoa+tipo deixa de ser único: o que identifica a estadia agora
-- é pessoa + tipo + operação. Sem isto, gravar a segunda operação
-- sobrescrevia a primeira.
drop index if exists hospedagem_detalhe_colab_tipo_idx;
create unique index if not exists hospedagem_detalhe_colab_tipo_edicao_idx
  on hospedagem_detalhe (colaborador_id, tipo, edicao_id);
