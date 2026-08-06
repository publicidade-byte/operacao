-- =====================================================================
-- Tabela notificacao_extra
--
-- Quem recebe notificação da operação mas não tem login no sistema:
-- tem Slack, não tem conta. Consultada por notificar-operacao.
--
-- A tabela já existia no projeto de produção, criada à mão pelo painel e
-- nunca versionada — este arquivo apenas registra o que está lá, para que
-- setup-completo.sql e qualquer ambiente novo nasçam iguais. Rodar contra
-- um banco que já a tem é no-op.
-- =====================================================================

create table if not exists notificacao_extra (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slack_user_id text not null,
  areas         text[] not null default '{}',
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- A tabela em produção nasceu com created_at; sem esta linha um ambiente
-- novo ficaria diferente do que está no ar.
alter table notificacao_extra add column if not exists created_at timestamptz not null default now();

comment on column notificacao_extra.areas is
  'Mesmas areas de admin_users: AEREO, RODOVIARIO, VAN, CARRO, HOSP_PAX, HOSP_FORA. Vazio = todas.';

comment on table notificacao_extra is
  'Pessoas avisadas no Slack pela notificar-operacao que nao tem login no sistema.';

alter table notificacao_extra enable row level security;
drop policy if exists ne_admin on notificacao_extra;
create policy ne_admin on notificacao_extra
  for all to authenticated using (is_admin()) with check (is_admin());
