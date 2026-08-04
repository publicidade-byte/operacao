-- =====================================================================
-- FORMA 9 — SETUP DO BANCO (schema completo)
--
-- Cole TUDO isto no SQL Editor do Supabase e clique em Run.
--
-- Isto cria a estrutura: tabelas, RLS, views de aprovação e funções.
-- NÃO inclui os dados operacionais (calendário de operações e nomes dos
-- diretores) — eles não são versionados. O arquivo com esses dados fica
-- fora do repositório; peça à equipe operacional.
-- =====================================================================


-- ################################################################
-- #  20260804000000_init.sql
-- ################################################################

-- =====================================================================
-- Forma 9 — Sistema de Solicitação de Hospedagem e Transporte
-- Migration inicial: enums, tabelas, RLS, funções.
-- =====================================================================

-- ---------- ENUMS ----------------------------------------------------

create type equipe_tipo as enum (
  'EQUIPE_MEDICA', 'EQUIPE_TECNICA', 'DIRETORIA', 'LOJINHA_FORMA', 'FOTIX',
  'COMERCIAL', 'CONSELHO', 'RE', 'MARKETING', 'MONITORIA', 'SEGURANCA',
  'SALVA_VIDAS', 'DJ'
);

create type tipo_hospedagem as enum ('HOTEL_PAX', 'FORA_HOTEL_PAX');

create type modal_transporte as enum ('AEREO', 'RODOVIARIO');

create type status_solicitacao as enum (
  'RECEBIDA',
  'EM_PREENCHIMENTO',
  'AGUARDANDO_APROVACAO',
  'APROVADA',
  'REPROVADA',
  'CONCLUIDA',
  'CANCELADA'
);

create type admin_role as enum ('OPERACIONAL', 'GESTOR');

-- ---------- UTILIDADES ----------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create sequence protocolo_seq;

create or replace function gerar_protocolo() returns text
language sql as $$
  select 'F9-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY')
      || '-' || lpad(nextval('protocolo_seq')::text, 4, '0');
$$;

-- ---------- REFERÊNCIA ----------------------------------------------

create table edicoes (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  destino     text not null,
  hotel       text not null,
  data_inicio date not null,
  data_fim    date not null,
  noites      int  not null,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint edicao_datas_ok check (data_fim >= data_inicio)
);
create index edicoes_data_inicio_idx on edicoes (data_inicio) where ativa;

create table diretores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  email         text,
  slack_user_id text,
  ativo         boolean not null default true,
  ordem         int not null default 0
);

create table admin_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text not null unique,
  role       admin_role not null default 'OPERACIONAL',
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- helper usado nas policies
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admin_users u where u.id = auth.uid() and u.ativo);
$$;

create or replace function is_gestor() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admin_users u
                 where u.id = auth.uid() and u.ativo and u.role = 'GESTOR');
$$;

-- ---------- SOLICITAÇÃO ---------------------------------------------

create table solicitacoes (
  id                   uuid primary key default gen_random_uuid(),
  protocolo            text not null unique default gerar_protocolo(),
  token_acompanhamento text not null unique,

  edicao_id  uuid not null references edicoes(id),
  equipe     equipe_tipo not null,
  diretor_id uuid not null references diretores(id),

  solicitante_nome     text not null,
  solicitante_email    text not null,
  solicitante_whatsapp text not null,

  data_entrada    date not null,
  data_saida      date not null,
  tipo_hospedagem tipo_hospedagem not null,

  precisa_transporte boolean not null,
  modal              modal_transporte,
  aeroporto_saida    text,
  aeroporto_chegada  text,
  obs_transporte     text not null,

  precisa_locacao_carro boolean not null,
  obs_locacao_carro     text,

  status               status_solicitacao not null default 'RECEBIDA',
  custo_total          numeric(12,2),
  custo_total_manual   numeric(12,2),
  observacoes_internas text,
  responsavel_id       uuid references admin_users(id),

  consentimento_lgpd_em timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint datas_ok check (data_saida > data_entrada),
  constraint modal_obrigatorio_se_transporte
    check (precisa_transporte = false or modal is not null),
  constraint aeroportos_obrigatorios_se_aereo
    check (modal is distinct from 'AEREO'
           or (aeroporto_saida is not null and aeroporto_chegada is not null))
);
create index solicitacoes_status_idx  on solicitacoes (status, created_at desc);
create index solicitacoes_edicao_idx  on solicitacoes (edicao_id);
create index solicitacoes_diretor_idx on solicitacoes (diretor_id);
create trigger solicitacoes_updated before update on solicitacoes
  for each row execute function set_updated_at();

create table colaboradores (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  nome_completo   text not null,
  cpf             text not null,
  data_nascimento date not null,
  ordem           int  not null default 1,
  created_at      timestamptz not null default now(),
  unique (solicitacao_id, cpf)
);
create index colaboradores_solicitacao_idx on colaboradores (solicitacao_id);

-- ---------- DADOS OPERACIONAIS --------------------------------------

create table voos (
  id                 uuid primary key default gen_random_uuid(),
  colaborador_id     uuid not null references colaboradores(id) on delete cascade,
  trecho             text not null check (trecho in ('IDA','VOLTA')),
  companhia          text,
  numero_voo         text,
  aeroporto_origem   text,
  aeroporto_destino  text,
  partida            timestamptz,
  chegada            timestamptz,
  localizador        text,
  bagagem_despachada boolean,
  preco              numeric(10,2),
  observacoes        text,
  updated_at         timestamptz not null default now(),
  unique (colaborador_id, trecho)
);
create trigger voos_updated before update on voos
  for each row execute function set_updated_at();

create table transporte_rodoviario (
  id                   uuid primary key default gen_random_uuid(),
  colaborador_id       uuid not null references colaboradores(id) on delete cascade,
  empresa              text,
  horario_ida          timestamptz,
  local_embarque_ida   text,
  horario_volta        timestamptz,
  local_embarque_volta text,
  preco                numeric(10,2),
  observacoes          text,
  updated_at           timestamptz not null default now(),
  unique (colaborador_id)
);
create trigger rodoviario_updated before update on transporte_rodoviario
  for each row execute function set_updated_at();

create table hospedagem_detalhe (
  id             uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  hotel          text,
  tipo_quarto    text,
  dividindo_com  text,
  check_in       date,
  check_out      date,
  valor_diaria   numeric(10,2),
  codigo_reserva text,
  observacoes    text,
  updated_at     timestamptz not null default now(),
  unique (colaborador_id)
);
create trigger hospedagem_updated before update on hospedagem_detalhe
  for each row execute function set_updated_at();

create table locacao_carro (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  locadora        text,
  categoria       text,
  retirada_local  text,
  retirada_em     timestamptz,
  devolucao_local text,
  devolucao_em    timestamptz,
  condutor_colaborador_id uuid references colaboradores(id) on delete set null,
  preco           numeric(10,2),
  observacoes     text,
  updated_at      timestamptz not null default now(),
  unique (solicitacao_id)
);
create trigger locacao_updated before update on locacao_carro
  for each row execute function set_updated_at();

-- ---------- APROVAÇÃO E AUDITORIA -----------------------------------

create table aprovacoes (
  id                uuid primary key default gen_random_uuid(),
  solicitacao_id    uuid not null references solicitacoes(id) on delete cascade,
  diretor_id        uuid not null references diretores(id),
  aprovado          boolean not null,
  decidido_em       timestamptz not null,
  registrado_por    uuid references admin_users(id),
  slack_message_url text,
  evidencia_path    text,
  observacao        text,
  created_at        timestamptz not null default now()
);
create index aprovacoes_solicitacao_idx on aprovacoes (solicitacao_id);

create table eventos_solicitacao (
  id             bigserial primary key,
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  tipo           text not null,
  autor_id       uuid references admin_users(id),
  autor_nome     text,
  descricao      text not null,
  payload        jsonb,
  created_at     timestamptz not null default now()
);
create index eventos_solicitacao_idx on eventos_solicitacao (solicitacao_id, created_at desc);

-- ---------- CUSTO TOTAL (recalculado) --------------------------------

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
      where l.solicitacao_id = p_solicitacao), 0);
$$;

-- ---------- ROW LEVEL SECURITY ---------------------------------------
-- Regra geral: NADA é legível por 'anon'. O formulário público grava via
-- Edge Function com service_role. O acompanhamento por token também.

alter table edicoes               enable row level security;
alter table diretores             enable row level security;
alter table admin_users           enable row level security;
alter table solicitacoes          enable row level security;
alter table colaboradores         enable row level security;
alter table voos                  enable row level security;
alter table transporte_rodoviario enable row level security;
alter table hospedagem_detalhe    enable row level security;
alter table locacao_carro         enable row level security;
alter table aprovacoes            enable row level security;
alter table eventos_solicitacao   enable row level security;

-- Referência: leitura pública (necessária para montar o formulário).
create policy edicoes_leitura_publica on edicoes
  for select to anon, authenticated using (ativa);
create policy diretores_leitura_publica on diretores
  for select to anon, authenticated using (ativo);

-- Referência: escrita só para gestor.
create policy edicoes_gestor on edicoes
  for all to authenticated using (is_gestor()) with check (is_gestor());
create policy diretores_gestor on diretores
  for all to authenticated using (is_gestor()) with check (is_gestor());

-- admin_users: cada um lê o próprio registro; gestor administra todos.
create policy admin_users_self on admin_users
  for select to authenticated using (id = auth.uid() or is_gestor());
create policy admin_users_gestor on admin_users
  for all to authenticated using (is_gestor()) with check (is_gestor());

-- Dados sensíveis: apenas admins autenticados e ativos.
create policy solicitacoes_admin on solicitacoes
  for all to authenticated using (is_admin()) with check (is_admin());
create policy colaboradores_admin on colaboradores
  for all to authenticated using (is_admin()) with check (is_admin());
create policy voos_admin on voos
  for all to authenticated using (is_admin()) with check (is_admin());
create policy rodoviario_admin on transporte_rodoviario
  for all to authenticated using (is_admin()) with check (is_admin());
create policy hospedagem_admin on hospedagem_detalhe
  for all to authenticated using (is_admin()) with check (is_admin());
create policy locacao_admin on locacao_carro
  for all to authenticated using (is_admin()) with check (is_admin());
create policy aprovacoes_admin on aprovacoes
  for all to authenticated using (is_admin()) with check (is_admin());
create policy eventos_admin on eventos_solicitacao
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- STORAGE ---------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

create policy evidencias_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'evidencias' and is_admin())
  with check (bucket_id = 'evidencias' and is_admin());

-- ################################################################
-- #  20260804010000_aprovacao_no_sistema.sql
-- ################################################################

-- =====================================================================
-- Mudança de fluxo: o diretor passa a APROVAR DENTRO DO SISTEMA.
-- O Slack vira apenas notificação de que há pendência.
--
-- Rode esta migration DEPOIS da 20260804000000_init.sql.
-- =====================================================================

-- ---------- Diretor vira usuário autenticável ------------------------

alter table diretores
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

comment on column diretores.user_id is
  'Conta de login do diretor. Nulo enquanto ele não tiver acesso ao sistema.';

/** Id do diretor correspondente ao usuário logado (null se não for diretor). */
create or replace function diretor_atual() returns uuid
language sql security definer stable set search_path = public as $$
  select id from diretores where user_id = auth.uid() and ativo limit 1;
$$;

-- ---------- Views de aprovação ---------------------------------------
-- O diretor precisa avaliar custo e logística, NÃO precisa de CPF nem de
-- data de nascimento. Estas views são security definer (ignoram a RLS das
-- tabelas base) e filtram pelas solicitações do próprio diretor, expondo
-- apenas as colunas necessárias.

create or replace view v_aprovacao_solicitacoes
with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.solicitante_nome, s.solicitante_email,
  coalesce(s.custo_total_manual, s.custo_total) as custo_total,
  s.observacoes_internas,
  s.created_at, s.updated_at,
  e.destino, e.hotel, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax
from solicitacoes s
join edicoes e on e.id = s.edicao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_colaboradores
with (security_invoker = false) as
select c.id, c.solicitacao_id, c.nome_completo, c.ordem
from colaboradores c
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_voos
with (security_invoker = false) as
select v.colaborador_id, v.trecho, v.companhia, v.numero_voo,
       v.aeroporto_origem, v.aeroporto_destino, v.partida, v.chegada,
       v.localizador, v.bagagem_despachada, v.preco, v.observacoes,
       c.solicitacao_id
from voos v
join colaboradores c on c.id = v.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_rodoviario
with (security_invoker = false) as
select t.colaborador_id, t.empresa, t.horario_ida, t.local_embarque_ida,
       t.horario_volta, t.local_embarque_volta, t.preco, t.observacoes,
       c.solicitacao_id
from transporte_rodoviario t
join colaboradores c on c.id = t.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_hospedagem
with (security_invoker = false) as
select h.colaborador_id, h.hotel, h.tipo_quarto, h.dividindo_com,
       h.check_in, h.check_out, h.valor_diaria, h.codigo_reserva, h.observacoes,
       c.solicitacao_id
from hospedagem_detalhe h
join colaboradores c on c.id = h.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_carro
with (security_invoker = false) as
select l.solicitacao_id, l.locadora, l.categoria, l.retirada_local, l.retirada_em,
       l.devolucao_local, l.devolucao_em, l.condutor_colaborador_id, l.preco,
       l.observacoes
from locacao_carro l
join solicitacoes s on s.id = l.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_decisoes
with (security_invoker = false) as
select a.id, a.solicitacao_id, a.aprovado, a.decidido_em, a.observacao, a.created_at
from aprovacoes a
join solicitacoes s on s.id = a.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on
  v_aprovacao_solicitacoes, v_aprovacao_colaboradores, v_aprovacao_voos,
  v_aprovacao_rodoviario, v_aprovacao_hospedagem, v_aprovacao_carro,
  v_aprovacao_decisoes
to authenticated;

-- ---------- Ação de aprovar / reprovar --------------------------------
-- Função única e controlada: o diretor não recebe UPDATE direto em
-- solicitacoes, então não consegue alterar nenhum outro campo.

create or replace function aprovar_solicitacao(
  p_solicitacao uuid,
  p_aprovado    boolean,
  p_observacao  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_diretor uuid;
  v_status  status_solicitacao;
  v_nome    text;
begin
  v_diretor := diretor_atual();
  if v_diretor is null then
    raise exception 'Apenas diretores aprovadores podem executar esta ação.';
  end if;

  select status into v_status
    from solicitacoes
   where id = p_solicitacao and diretor_id = v_diretor
   for update;

  if v_status is null then
    raise exception 'Solicitação não encontrada ou não atribuída a você.';
  end if;

  if v_status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'Esta solicitação não está aguardando aprovação (status atual: %).', v_status;
  end if;

  if not p_aprovado and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da reprovação.';
  end if;

  select nome into v_nome from diretores where id = v_diretor;

  insert into aprovacoes
    (solicitacao_id, diretor_id, aprovado, decidido_em, observacao)
  values
    (p_solicitacao, v_diretor, p_aprovado, now(), nullif(btrim(p_observacao), ''));

  update solicitacoes
     set status = case when p_aprovado then 'APROVADA' else 'REPROVADA' end
   where id = p_solicitacao;

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao,
    case when p_aprovado then 'APROVADA' else 'REPROVADA' end,
    v_nome,
    case when p_aprovado
         then format('Aprovada no sistema por %s', v_nome)
         else format('Reprovada no sistema por %s', v_nome) end,
    jsonb_build_object('observacao', p_observacao)
  );
end $$;

grant execute on function aprovar_solicitacao(uuid, boolean, text) to authenticated;
grant execute on function diretor_atual() to authenticated;

-- ---------- Perfil do usuário logado ----------------------------------
-- Uma chamada só resolve "quem é você": operação, diretor ou nenhum.

create or replace function meu_perfil()
returns table (papel text, id uuid, nome text)
language sql security definer stable set search_path = public as $$
  select 'ADMIN'::text, u.id, u.nome
    from admin_users u where u.id = auth.uid() and u.ativo
  union all
  select 'DIRETOR'::text, d.id, d.nome
    from diretores d where d.user_id = auth.uid() and d.ativo
  limit 1;
$$;

grant execute on function meu_perfil() to authenticated;

-- ---------- Ajuste na RLS de diretores --------------------------------
-- A listagem pública do formulário não deve expor user_id nem e-mail.
-- Trocamos a policy aberta por uma view enxuta.

drop policy if exists diretores_leitura_publica on diretores;

create or replace view v_diretores_publicos
with (security_invoker = false) as
select id, nome, ordem from diretores where ativo order by ordem;

grant select on v_diretores_publicos to anon, authenticated;

-- O próprio diretor continua conseguindo ler seu registro completo.
create policy diretores_self on diretores
  for select to authenticated using (user_id = auth.uid() or is_admin());

-- ################################################################
-- #  20260804020000_multiplas_datas.sql
-- ################################################################

-- =====================================================================
-- Uma solicitação pode cobrir VÁRIAS operações do mesmo destino.
--
-- Caso real: DESTINO EXEMPLO A tem 17 operações no ano, várias consecutivas
-- (01-04/10, 04-07/10, 07-10/10). Um técnico que trabalha três seguidas
-- faz UMA hospedagem contínua cobrindo as três — não três viagens.
--
-- Por isso: N edições ligadas à solicitação, mas UM período de estadia,
-- UM conjunto de voos e UMA hospedagem. `solicitacoes.edicao_id` continua
-- existindo e aponta para a operação mais antiga do conjunto (é o que
-- alimenta destino/hotel nas listagens e e-mails).
--
-- Rode DEPOIS das migrations 20260804000000 e 20260804010000.
-- =====================================================================

create table if not exists solicitacao_edicoes (
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  edicao_id      uuid not null references edicoes(id),
  primary key (solicitacao_id, edicao_id)
);

create index if not exists solicitacao_edicoes_edicao_idx
  on solicitacao_edicoes (edicao_id);

comment on table solicitacao_edicoes is
  'Operações cobertas pela solicitação. Sempre inclui solicitacoes.edicao_id.';

-- Solicitações que já existiam passam a ter sua única edição registrada aqui.
insert into solicitacao_edicoes (solicitacao_id, edicao_id)
select id, edicao_id from solicitacoes
on conflict do nothing;

alter table solicitacao_edicoes enable row level security;

create policy solicitacao_edicoes_admin on solicitacao_edicoes
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Visão do diretor ------------------------------------------

create or replace view v_aprovacao_edicoes
with (security_invoker = false) as
select se.solicitacao_id, e.id as edicao_id, e.codigo, e.destino, e.hotel,
       e.data_inicio, e.data_fim, e.noites
from solicitacao_edicoes se
join edicoes e on e.id = se.edicao_id
join solicitacoes s on s.id = se.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_edicoes to authenticated;

-- Quantidade de operações cobertas, para exibir na lista do diretor.
create or replace view v_aprovacao_solicitacoes
with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
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
