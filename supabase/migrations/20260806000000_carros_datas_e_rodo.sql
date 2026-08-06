-- Lote de 06/08/2026 — ajustes pedidos pela operação.
--
-- Estas mudanças já tinham sido aplicadas direto no banco durante o ajuste
-- urgente; o arquivo existe para que um ambiente novo chegue ao mesmo estado.
-- Tudo é idempotente de propósito (IF NOT EXISTS) — rodar de novo no banco
-- que já recebeu as alterações não faz nada.

-- ---------------------------------------------------------------------------
-- Datas de voo por trecho
--
-- Antes o voo herdava as datas da estadia. Só que quem viaja um dia antes
-- (ou volta depois) não tinha onde dizer isso.
-- ---------------------------------------------------------------------------
alter table solicitacoes add column if not exists voo_data_ida   date;
alter table solicitacoes add column if not exists voo_data_volta date;

-- ---------------------------------------------------------------------------
-- Rodoviário simplificado
--
-- O solicitante não sabe terminal nem horário — quem define é a operação.
-- Dele só precisamos a região de saída e a cidade/estado.
-- ---------------------------------------------------------------------------
alter table solicitacoes add column if not exists rodo_regiao_saida  text;
alter table solicitacoes add column if not exists rodo_cidade_estado text;

-- E, do lado da operação, o ônibus e onde o passageiro se apresenta.
alter table transporte_rodoviario add column if not exists numero_onibus  text;
alter table transporte_rodoviario add column if not exists apresentacao_em text;

-- ---------------------------------------------------------------------------
-- Retorno da van
--
-- A van quase sempre volta. Antes só existia a ida, e o retorno virava
-- observação em texto livre.
-- ---------------------------------------------------------------------------
alter table solicitacoes add column if not exists van_retorno_local   text;
alter table solicitacoes add column if not exists van_retorno_horario text;
alter table solicitacoes add column if not exists van_retorno_destino text;

-- ---------------------------------------------------------------------------
-- Várias reservas de carro na mesma solicitação
--
-- Os campos carro_* em solicitacoes seguram uma reserva só. Quando a equipe
-- pede dois ou três carros, cada um tem seu condutor e seu tipo — por isso
-- virou tabela. Os campos antigos continuam para não quebrar o histórico.
-- ---------------------------------------------------------------------------
create table if not exists solicitacao_carros (
  id                  uuid primary key default gen_random_uuid(),
  solicitacao_id      uuid not null references solicitacoes(id) on delete cascade,
  condutor_nome       text not null,
  condutor_cpf        text not null,
  condutor_nascimento date,
  transmissao         text,
  tipo_carro          text,
  local_retirada      text,
  ordem               int  not null default 1,
  created_at          timestamptz not null default now()
);

create index if not exists solicitacao_carros_solicitacao_idx
  on solicitacao_carros (solicitacao_id, ordem);

alter table solicitacao_carros enable row level security;

-- Mesma regra do resto: dados de condutor (CPF) só na área logada.
drop policy if exists solicitacao_carros_admin on solicitacao_carros;
create policy solicitacao_carros_admin on solicitacao_carros
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Pessoas que recebem aviso no Slack mas não têm login
--
-- admin_users.id referencia auth.users, então quem não tem conta não cabe lá.
-- A Carol (auxiliar operacional) é o caso: precisa ser marcada nas mensagens
-- de van e rodoviário sem precisar entrar no sistema.
-- ---------------------------------------------------------------------------
create table if not exists notificacao_extra (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slack_user_id text,
  areas         text[] not null default '{}',   -- vazio = recebe tudo
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table notificacao_extra enable row level security;

drop policy if exists notificacao_extra_admin on notificacao_extra;
create policy notificacao_extra_admin on notificacao_extra
  for all to authenticated
  using (is_admin()) with check (is_admin());
