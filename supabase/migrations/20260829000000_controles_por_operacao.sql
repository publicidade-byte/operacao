-- =====================================================================
-- ROOMING E RODOVIÁRIO POR OPERAÇÃO
--
-- A CAMP SP tem 17 datas na mesma solicitação. Rooming e rodoviário eram
-- um marcador só para a solicitação inteira: quem resolvia a data de
-- 01/10 não tinha como registrar isso sem dizer que resolveu as 17.
--
-- Agora cada operação tem os seus dois marcadores. O da solicitação
-- continua existindo e passa a significar "todas as datas resolvidas" —
-- é ele que pinta o card na lista.
-- =====================================================================

alter table solicitacao_edicoes
  add column if not exists rooming_ok     boolean not null default false,
  add column if not exists rooming_em     timestamptz,
  add column if not exists rooming_por    uuid references admin_users(id),
  add column if not exists rodoviario_ok  boolean not null default false,
  add column if not exists rodoviario_em  timestamptz,
  add column if not exists rodoviario_por uuid references admin_users(id);

comment on column solicitacao_edicoes.rooming_ok is
  'As pessoas já entraram no rooming do hotel NESTA data.';
comment on column solicitacao_edicoes.rodoviario_ok is
  'A passagem de ônibus NESTA data já foi comprada.';

-- Quem já estava marcado na solicitação inteira continua marcado: o
-- trabalho foi feito, e desmarcar tudo faria a operação refazer a
-- conferência das 17 datas.
update solicitacao_edicoes se
   set rooming_ok = true,
       rooming_em = s.rooming_em,
       rooming_por = s.rooming_por
  from solicitacoes s
 where s.id = se.solicitacao_id
   and s.rooming_ok
   and not se.rooming_ok;

update solicitacao_edicoes se
   set rodoviario_ok = true,
       rodoviario_em = s.rodoviario_em
  from solicitacoes s
 where s.id = se.solicitacao_id
   and s.rodoviario_ok
   and not se.rodoviario_ok;

-- Mesmo carimbo das solicitações: quem marcou e quando, sem depender de
-- o front lembrar de escrever isso.
create or replace function carimbar_controles_da_operacao() returns trigger
language plpgsql as $fn$
begin
  if new.rooming_ok is distinct from old.rooming_ok then
    new.rooming_em  := case when new.rooming_ok then now() else null end;
    new.rooming_por := case when new.rooming_ok then auth.uid() else null end;
  end if;
  if new.rodoviario_ok is distinct from old.rodoviario_ok then
    new.rodoviario_em  := case when new.rodoviario_ok then now() else null end;
    new.rodoviario_por := case when new.rodoviario_ok then auth.uid() else null end;
  end if;
  return new;
end $fn$;

drop trigger if exists solicitacao_edicoes_carimbo on solicitacao_edicoes;
create trigger solicitacao_edicoes_carimbo before update on solicitacao_edicoes
  for each row execute function carimbar_controles_da_operacao();
