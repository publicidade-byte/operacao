# 03 — Modelo de Dados

Postgres (Supabase). Schema `public`. Todas as tabelas com `created_at` /
`updated_at` em `timestamptz`.

## Diagrama

```
edicoes ──┐
          │
equipes ──┼──< solicitacoes >──┬──< colaboradores >──┬── voos (ida/volta)
          │        │           │                     ├── transporte_rodoviario
diretores ┘        │           │                     ├── hospedagem_detalhe
                   │           │                     └── locacao_carro
                   ├──< eventos_solicitacao (audit log)
                   └──< aprovacoes
admin_users
```

## Enums

```sql
create type equipe_tipo as enum (
  'EQUIPE_MEDICA', 'EQUIPE_TECNICA', 'DIRETORIA', 'LOJINHA_FORMA', 'FOTIX',
  'COMERCIAL', 'CONSELHO', 'RE', 'MARKETING', 'MONITORIA', 'SEGURANCA',
  'SALVA_VIDAS', 'DJ'
);

create type tipo_hospedagem as enum ('HOTEL_PAX', 'FORA_HOTEL_PAX');

create type modal_transporte as enum ('AEREO', 'RODOVIARIO');

create type status_solicitacao as enum (
  'RECEBIDA',            -- solicitante enviou
  'EM_PREENCHIMENTO',    -- operacional trabalhando nos dados
  'AGUARDANDO_APROVACAO',-- enviado ao diretor via Slack
  'APROVADA',
  'REPROVADA',
  'CONCLUIDA',           -- e-mail de confirmação enviado
  'CANCELADA'
);

create type admin_role as enum ('OPERACIONAL', 'GESTOR');
```

## Tabelas de referência

```sql
-- Operações do Forma 9 (carregadas do arquivo de seed, não versionado)
create table edicoes (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,        -- F9-001
  destino       text not null,               -- DESTINO EXEMPLO B
  hotel         text not null,               -- HOTEL EXEMPLO B
  data_inicio   date not null,
  data_fim      date not null,
  noites        int  not null,
  ativa         boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint edicao_datas_ok check (data_fim >= data_inicio)
);
create index on edicoes (data_inicio) where ativa;

create table diretores (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null,
  email    text,
  slack_user_id text,        -- U01ABCDEF, para @mencionar no Slack
  ativo    boolean not null default true
);

create table admin_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text not null unique,
  role       admin_role not null default 'OPERACIONAL',
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
```

Os diretores são carregados junto com o calendário de operações, a partir do
arquivo de dados que não é versionado (ver README).

## Solicitação

Uma solicitação = um destino + **N operações desse destino** + uma equipe + um
diretor aprovador + N colaboradores.

```sql
-- Operações cobertas pela solicitação (ver migration 20260804020000).
create table solicitacao_edicoes (
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  edicao_id      uuid not null references edicoes(id),
  primary key (solicitacao_id, edicao_id)
);
```

`solicitacoes.edicao_id` continua existindo e aponta para a **operação mais
antiga** do conjunto — é ela que alimenta destino, hotel, listagens e e-mails.
A estadia é única (um `data_entrada`/`data_saida`), assim como voos e hospedagem:
operações consecutivas do mesmo destino são uma viagem só. Datas de entrada/saída e as opções de transporte ficam **na
solicitação** (valem para o grupo), com possibilidade de sobrescrita por
colaborador no painel admin.

```sql
create table solicitacoes (
  id                    uuid primary key default gen_random_uuid(),
  protocolo             text not null unique,     -- F9-2026-0042
  token_acompanhamento  text not null unique,     -- 32 bytes url-safe

  edicao_id             uuid not null references edicoes(id),
  equipe                equipe_tipo not null,
  diretor_id            uuid not null references diretores(id),

  -- solicitante
  solicitante_nome      text not null,
  solicitante_email     text not null,
  solicitante_whatsapp  text not null,            -- E.164: +5511999999999

  -- hospedagem
  data_entrada          date not null,
  data_saida            date not null,
  tipo_hospedagem       tipo_hospedagem not null,

  -- transporte
  precisa_transporte    boolean not null,
  modal                 modal_transporte,
  aeroporto_saida       text,                     -- IATA: GRU
  aeroporto_chegada     text,                     -- IATA: CGB
  obs_transporte        text not null,

  -- carro
  precisa_locacao_carro boolean not null,
  obs_locacao_carro     text,

  status                status_solicitacao not null default 'RECEBIDA',
  custo_total           numeric(12,2),
  observacoes_internas  text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint datas_ok check (data_saida > data_entrada),
  constraint modal_obrigatorio_se_transporte
    check (precisa_transporte = false or modal is not null),
  constraint aeroportos_obrigatorios_se_aereo
    check (modal is distinct from 'AEREO'
           or (aeroporto_saida is not null and aeroporto_chegada is not null))
);
create index on solicitacoes (status, created_at desc);
create index on solicitacoes (edicao_id);
create index on solicitacoes (diretor_id);
```

> `obs_transporte` é `not null` porque todos os campos são obrigatórios; quando
> não há transporte, o frontend grava `'Não se aplica'`. Se preferirem exigir
> apenas quando houver transporte, trocar por um `check` condicional.

## Colaboradores

```sql
create table colaboradores (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  nome_completo   text not null,
  cpf             text not null,          -- só dígitos, validado no app
  data_nascimento date not null,
  ordem           int  not null default 1,
  created_at      timestamptz not null default now(),
  unique (solicitacao_id, cpf)
);
create index on colaboradores (solicitacao_id);
```

## Dados operacionais (preenchidos no painel admin)

```sql
create table voos (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references colaboradores(id) on delete cascade,
  trecho          text not null check (trecho in ('IDA','VOLTA')),
  companhia       text,
  numero_voo      text,
  aeroporto_origem  text,
  aeroporto_destino text,
  partida         timestamptz,
  chegada         timestamptz,
  localizador     text,
  bagagem_despachada boolean,
  preco           numeric(10,2),
  observacoes     text,
  unique (colaborador_id, trecho)
);

create table transporte_rodoviario (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references colaboradores(id) on delete cascade,
  empresa         text,
  horario_ida     timestamptz,
  local_embarque_ida text,
  horario_volta   timestamptz,
  local_embarque_volta text,
  preco           numeric(10,2),
  observacoes     text,
  unique (colaborador_id)
);

create table hospedagem_detalhe (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references colaboradores(id) on delete cascade,
  hotel           text,
  tipo_quarto     text,
  dividindo_com   text,
  check_in        date,
  check_out       date,
  valor_diaria    numeric(10,2),
  codigo_reserva  text,
  observacoes     text,
  unique (colaborador_id)
);

create table locacao_carro (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes(id) on delete cascade,
  locadora        text,
  categoria       text,
  retirada_local  text,
  retirada_em     timestamptz,
  devolucao_local text,
  devolucao_em    timestamptz,
  condutor_colaborador_id uuid references colaboradores(id),
  preco           numeric(10,2),
  observacoes     text
);
```

## Aprovação e auditoria

```sql
create table aprovacoes (
  id                uuid primary key default gen_random_uuid(),
  solicitacao_id    uuid not null references solicitacoes(id) on delete cascade,
  diretor_id        uuid not null references diretores(id),
  aprovado          boolean not null,
  decidido_em       timestamptz not null,
  registrado_por    uuid not null references admin_users(id),
  slack_message_url text,          -- permalink da mensagem do diretor
  evidencia_path    text,          -- print no Storage
  observacao        text,
  created_at        timestamptz not null default now()
);

create table eventos_solicitacao (
  id             bigserial primary key,
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  tipo           text not null,       -- CRIADA, EDITADA, ENVIADA_APROVACAO, ...
  autor_id       uuid references admin_users(id),   -- null = ação do solicitante
  descricao      text not null,
  payload        jsonb,               -- diff dos campos alterados
  created_at     timestamptz not null default now()
);
create index on eventos_solicitacao (solicitacao_id, created_at desc);
```

## Row Level Security

Habilitar RLS em **todas** as tabelas. Política geral:

```sql
alter table solicitacoes enable row level security;

-- ninguém anônimo lê ou escreve diretamente
create policy admin_total on solicitacoes
  for all to authenticated
  using   (exists (select 1 from admin_users u
                   where u.id = auth.uid() and u.ativo))
  with check (exists (select 1 from admin_users u
                      where u.id = auth.uid() and u.ativo));
```

Repetir o padrão para `colaboradores`, `voos`, `transporte_rodoviario`,
`hospedagem_detalhe`, `locacao_carro`, `aprovacoes`, `eventos_solicitacao`.

- **Inserção pública** não usa RLS: passa pela Edge Function `criar-solicitacao`,
  que roda com `service_role`. Assim o `anon key` exposto no frontend não permite
  nem inserir lixo direto na tabela.
- **Acompanhamento pelo solicitante** também passa por Edge Function
  (`consultar-solicitacao?token=...`), que devolve uma versão reduzida: status,
  destino, datas, nomes dos colaboradores — **sem CPF, sem preços**.
- `edicoes` e `diretores` podem ter `select` liberado para `anon` (são dados
  públicos necessários ao formulário).

## Geração do protocolo

```sql
create sequence protocolo_seq;

create or replace function gerar_protocolo() returns text language sql as $$
  select 'F9-' || extract(year from now())::text || '-' ||
         lpad(nextval('protocolo_seq')::text, 4, '0');
$$;
```

## Carga inicial

O arquivo de seed popula `edicoes` e `diretores`. Ele **não é versionado** —
contém o calendário operacional do ano e os nomes dos diretores. Fica sob
guarda da equipe operacional.

A extração original cruzou duas abas da planilha base para não perder operações
que constavam em apenas uma delas.
