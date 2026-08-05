-- =====================================================================
-- Locação de van como modal + dados do condutor na locação de carro.
--
-- ATENÇÃO: rode em DUAS PARTES (valor de enum novo não pode ser usado
-- na mesma transação em que foi criado).
-- =====================================================================

-- ---------- PARTE 1 (sozinha, primeiro) ------------------------------

alter type modal_transporte add value if not exists 'VAN';

-- ---------- PARTE 2 --------------------------------------------------

-- Dados que o solicitante informa sobre a van.
alter table solicitacoes
  add column if not exists van_local_saida       text,
  add column if not exists van_horario_saida     text,
  add column if not exists van_destino           text,
  add column if not exists van_qtd_passageiros   int;

comment on column solicitacoes.van_horario_saida is
  'Texto livre: nem sempre o solicitante sabe a hora exata na hora de pedir.';

-- Condutor da locação de carro, informado por quem solicita.
alter table solicitacoes
  add column if not exists carro_condutor_nome  text,
  add column if not exists carro_condutor_cpf   text,
  add column if not exists carro_transmissao    text;

alter table solicitacoes
  drop constraint if exists carro_transmissao_valida;
alter table solicitacoes
  add constraint carro_transmissao_valida
  check (carro_transmissao is null or carro_transmissao in ('MANUAL', 'AUTOMATICO'));

alter table solicitacoes
  drop constraint if exists van_campos_obrigatorios;
alter table solicitacoes
  add constraint van_campos_obrigatorios
  check (
    modal is distinct from 'VAN'
    or (coalesce(btrim(van_local_saida), '') <> ''
        and coalesce(btrim(van_horario_saida), '') <> ''
        and coalesce(btrim(van_destino), '') <> ''
        and van_qtd_passageiros > 0)
  );

-- ---------- Custos da van (preenchido pela operação) ------------------

create table if not exists locacao_van (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  empresa        text,
  motorista      text,
  telefone       text,
  placa          text,
  local_saida    text,
  saida_em       timestamptz,
  local_chegada  text,
  chegada_em     timestamptz,
  qtd_passageiros int,
  preco          numeric(10,2),
  observacoes    text,
  updated_at     timestamptz not null default now(),
  unique (solicitacao_id)
);

drop trigger if exists locacao_van_updated on locacao_van;
create trigger locacao_van_updated before update on locacao_van
  for each row execute function set_updated_at();

alter table locacao_van enable row level security;

drop policy if exists locacao_van_admin on locacao_van;
create policy locacao_van_admin on locacao_van
  for all to authenticated using (is_admin()) with check (is_admin());

-- A van entra no custo total da solicitação.
create or replace function recalcular_custo(p_solicitacao uuid) returns numeric
language sql stable as $$
  select coalesce(
    (select sum(v.preco) from voos v
       join colaboradores c on c.id = v.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(t.preco) from transporte_rodoviario t
       join colaboradores c on c.id = t.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(h.valor_diaria * greatest((h.check_out - h.check_in), 0))
       from hospedagem_detalhe h
       join colaboradores c on c.id = h.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(l.preco) from locacao_carro l
      where l.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(vn.preco) from locacao_van vn
      where vn.solicitacao_id = p_solicitacao), 0);
$$;

-- ---------- Visões do diretor ----------------------------------------

create or replace view v_aprovacao_van
with (security_invoker = false) as
select vn.solicitacao_id, vn.empresa, vn.motorista, vn.local_saida, vn.saida_em,
       vn.local_chegada, vn.chegada_em, vn.qtd_passageiros, vn.preco, vn.observacoes
from locacao_van vn
join solicitacoes s on s.id = vn.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_van to authenticated;

drop view if exists v_aprovacao_solicitacoes;
create view v_aprovacao_solicitacoes with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.precisa_bagagem,
  s.van_local_saida, s.van_horario_saida, s.van_destino, s.van_qtd_passageiros,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.carro_condutor_nome, s.carro_transmissao,
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
