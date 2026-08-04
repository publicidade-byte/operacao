-- =====================================================================
-- Gestão de usuários pelo painel, com níveis de permissão.
--
-- Níveis:
--   SUPER ADMIN  — bolacha@formahomolog.com.br. Não pode ser rebaixado,
--                  desativado nem removido por ninguém, nem por si mesmo.
--   GESTOR       — operacional que também cadastra e administra usuários.
--   OPERACIONAL  — preenche solicitações, não mexe em usuários.
--   DIRETORIA    — aprova solicitações (registro em `diretores`), não
--                  acessa o painel operacional nem vê CPF.
--
-- Rode DEPOIS das migrations 20260804000000, 010000 e 020000.
-- =====================================================================

alter table admin_users
  add column if not exists super_admin boolean not null default false;

comment on column admin_users.super_admin is
  'Conta protegida: não pode ser desativada nem rebaixada.';

/** E-mail do super admin do sistema. Ponto único de verdade. */
create or replace function email_super_admin() returns text
language sql immutable as $$
  select 'bolacha@formahomolog.com.br'::text;
$$;

create or replace function is_super() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from admin_users u
     where u.id = auth.uid() and u.ativo and u.super_admin
  );
$$;

-- ---------- Promoção automática do super admin ------------------------
-- Não importa como a conta for criada (painel, SQL, dashboard): se o
-- e-mail for o do super admin, ela nasce protegida e como GESTOR.

create or replace function aplicar_super_admin() returns trigger
language plpgsql as $$
begin
  if lower(new.email) = lower(email_super_admin()) then
    new.super_admin := true;
    new.role        := 'GESTOR';
    new.ativo       := true;
  end if;
  return new;
end $$;

drop trigger if exists admin_users_super on admin_users;
create trigger admin_users_super
  before insert or update on admin_users
  for each row execute function aplicar_super_admin();

-- ---------- Proteções -------------------------------------------------

create or replace function proteger_super_admin() returns trigger
language plpgsql as $$
begin
  if old.super_admin then
    raise exception 'A conta de super admin não pode ser removida.';
  end if;
  return old;
end $$;

drop trigger if exists admin_users_no_delete_super on admin_users;
create trigger admin_users_no_delete_super
  before delete on admin_users
  for each row execute function proteger_super_admin();

-- ---------- Quem pode administrar usuários ----------------------------
-- Já existe a policy admin_users_gestor (for all to authenticated using
-- is_gestor()). Mantida: gestor administra, super admin é gestor.

-- Gestor também precisa enxergar os diretores para administrá-los —
-- a policy diretores_gestor da migration inicial já cobre.

-- ---------- Visão consolidada para a tela de usuários -----------------
-- Junta operacionais e diretores numa lista só, sem expor auth.users.

create or replace view v_usuarios
with (security_invoker = false) as
select
  u.id,
  u.nome,
  u.email,
  case when u.super_admin then 'SUPER_ADMIN' else u.role::text end as nivel,
  u.ativo,
  u.super_admin,
  u.created_at,
  null::uuid as diretor_id,
  null::text as slack_user_id
from admin_users u
where is_gestor()

union all

select
  d.user_id as id,
  d.nome,
  coalesce(d.email, '—') as email,
  'DIRETORIA'::text as nivel,
  d.ativo,
  false as super_admin,
  null::timestamptz as created_at,
  d.id as diretor_id,
  d.slack_user_id
from diretores d
where is_gestor();

grant select on v_usuarios to authenticated;
