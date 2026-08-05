-- =====================================================================
-- Notificação da operação por área + responsáveis por solicitação
-- + ida/volta, hospedagem externa e nascimento do condutor.
-- =====================================================================

-- Quem recebe notificação e de quê. Vazio = recebe tudo (gestores).
alter table admin_users
  add column if not exists slack_user_id text,
  add column if not exists areas text[] not null default '{}';

comment on column admin_users.areas is
  'Areas que disparam notificacao: AEREO, RODOVIARIO, VAN, CARRO, HOSP_PAX, HOSP_FORA. Vazio = todas.';

-- Campos novos do formulário.
alter table solicitacoes
  add column if not exists tipo_voo text,
  add column if not exists aeroporto_saida_volta text,
  add column if not exists aeroporto_chegada_volta text,
  add column if not exists hosp_externa_operacao boolean,
  add column if not exists hosp_externa_obs text,
  add column if not exists carro_condutor_nascimento date;

alter table solicitacoes drop constraint if exists tipo_voo_valido;
alter table solicitacoes add constraint tipo_voo_valido
  check (tipo_voo is null or tipo_voo in ('IDA', 'VOLTA', 'IDA_VOLTA'));

alter table hospedagem_detalhe add column if not exists endereco text;

-- Mais de uma pessoa cuida da mesma solicitação: uma faz o aéreo, outra
-- o hotel, outra o transfer.
create table if not exists solicitacao_responsaveis (
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  admin_id       uuid not null references admin_users(id) on delete cascade,
  atribuido_em   timestamptz not null default now(),
  primary key (solicitacao_id, admin_id)
);

alter table solicitacao_responsaveis enable row level security;
drop policy if exists resp_admin on solicitacao_responsaveis;
create policy resp_admin on solicitacao_responsaveis
  for all to authenticated using (is_admin()) with check (is_admin());

-- Qualquer pessoa da operação precisa enxergar a equipe para atribuir
-- responsáveis — a policy de admin_users só deixa o gestor listar todos.
create or replace view v_equipe with (security_invoker = false) as
select u.id, u.nome, u.role::text as role, u.areas
from admin_users u
where u.ativo and is_admin()
order by u.nome;

grant select on v_equipe to authenticated;

-- Direcionamento acordado com a operação (ajuste pelos updates abaixo).
update admin_users set areas = '{}'
  where nome in ('Felipe Dias', 'Ander Sousa') or super_admin;
update admin_users set areas = array['HOSP_FORA', 'CARRO', 'AEREO']
  where nome in ('Nina Pessoa', 'Canada Santos');
update admin_users set areas = array['HOSP_PAX', 'RODOVIARIO']
  where nome = 'Vinicius Fernandes';
update admin_users set areas = array['VAN', 'RODOVIARIO']
  where nome = 'Atila Amancio';
