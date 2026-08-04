-- =====================================================================
-- Equipe "Outros" com campo livre + bagagem despachada na solicitação.
--
-- ATENÇÃO: rode em DUAS PARTES. O Postgres não deixa usar um valor de
-- enum recém-criado na mesma transação em que ele foi adicionado.
-- =====================================================================

-- ---------- PARTE 1 (rode sozinha, primeiro) -------------------------

alter type equipe_tipo add value if not exists 'OUTROS';

-- ---------- PARTE 2 (rode depois que a parte 1 terminar) -------------

alter table solicitacoes
  add column if not exists equipe_outro text;

comment on column solicitacoes.equipe_outro is
  'Área informada pelo solicitante quando equipe = OUTROS.';

alter table solicitacoes
  add column if not exists precisa_bagagem boolean;

comment on column solicitacoes.precisa_bagagem is
  'Bagagem despachada solicitada. Só se aplica quando modal = AEREO.';

-- Quem escolhe "Outros" precisa dizer qual é a área.
alter table solicitacoes
  drop constraint if exists equipe_outro_obrigatorio;
alter table solicitacoes
  add constraint equipe_outro_obrigatorio
  check (equipe <> 'OUTROS' or coalesce(btrim(equipe_outro), '') <> '');

-- A área do diretor precisa enxergar os dois campos novos.
create or replace view v_aprovacao_solicitacoes
with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.precisa_bagagem,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.solicitante_nome, s.solicitante_email,
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
