-- Checklist de operação: as 19 etapas que hoje moram numa planilha.
--
-- A planilha tem uma linha por operação (data + destino + hotel) e uma coluna
-- por etapa, marcada por quem terminou a tarefa. Isso é exatamente uma edição
-- com N etapas, então o checklist pendura em `edicoes`, não em `solicitacoes`:
-- conferir cadastro, pedir ficha técnica ou fechar a comissão é trabalho da
-- turma inteira, não de cada passageiro.
--
-- O que a planilha não dá e isto dá: quem marcou, quando marcou, e o que já
-- passou do prazo. O voucher tem que sair uma semana antes da viagem — é o
-- único prazo firme hoje, e é o marco que separa as duas fases do processo.

create type etapa_fase as enum ('PRE_VOUCHER', 'POS_VOUCHER');

-- ---------- CATÁLOGO DE ETAPAS ---------------------------------------

-- Modelo, não instância: mudar um nome aqui reflete em toda operação, e
-- desativar uma etapa some com ela do painel sem apagar o que já foi feito.
create table etapas_modelo (
  codigo     text primary key,
  nome       text not null,
  fase       etapa_fase not null,
  ordem      int not null unique,
  -- Dias ANTES de `edicoes.data_inicio` em que a etapa deveria estar pronta.
  -- Nulo = sem prazo definido; o painel só cobra o que tem prazo.
  prazo_dias int,
  ativa      boolean not null default true,
  constraint prazo_dias_positivo check (prazo_dias is null or prazo_dias >= 0)
);

comment on table etapas_modelo is
  'As etapas do processo, na ordem da planilha. VOUCHER e o marco entre as duas fases.';
comment on column etapas_modelo.prazo_dias is
  'Dias antes da data de inicio da viagem. Voucher = 7 (uma semana). As demais ainda sem prazo acordado.';

insert into etapas_modelo (codigo, nome, fase, ordem, prazo_dias) values
  ('CONFERENCIA_CADASTRO',  'Conferência de cadastro',      'PRE_VOUCHER',  1, null),
  ('FICHA_SOLICITADA',      'Ficha técnica solicitada',     'PRE_VOUCHER',  2, null),
  ('FICHA_RESPONDIDA',      'Ficha técnica respondida',     'PRE_VOUCHER',  3, null),
  ('MAPA_QUARTOS',          'Mapa de quartos conferido',    'PRE_VOUCHER',  4, null),
  ('CARDAPIO',              'Cardápio recebido',            'PRE_VOUCHER',  5, null),
  ('HOSP_EQUIPE_ANTES',     'Hospedagem de equipe antes',   'PRE_VOUCHER',  6, null),
  ('CASOS_SAUDE',           'Casos da saúde',               'PRE_VOUCHER',  7, null),
  ('ROOM_LIST_LIBERADO',    'Room list liberado',           'PRE_VOUCHER',  8, null),
  ('TEMPLATE_COMISSAO',     'Template comissão',            'PRE_VOUCHER',  9, null),
  ('LOGISTICA_TRANSP',      'Logística dos transportes',    'PRE_VOUCHER', 10, null),
  ('CADASTRO_TRANSP',       'Cadastro dos transportes',     'PRE_VOUCHER', 11, null),
  ('VOUCHER',               'Voucher',                      'PRE_VOUCHER', 12, 7),
  ('ENVIO_LISTAS_TRANSP',   'Envio das listas de transp.',  'POS_VOUCHER', 13, null),
  ('MANUTENCAO_ROOM_LIST',  'Manutenção room list',         'POS_VOUCHER', 14, null),
  ('ROOMING_PRFS',          'Rooming PRFs',                 'POS_VOUCHER', 15, null),
  ('ROOMING_EXTRAS',        'Rooming extras',               'POS_VOUCHER', 16, null),
  ('ENVIADO_HOTEL',         'Enviado para o hotel',         'POS_VOUCHER', 17, null),
  ('NO_SHOW',               'No show',                      'POS_VOUCHER', 18, null),
  ('FECHAMENTO',            'Fechamento',                   'POS_VOUCHER', 19, null);

-- ---------- ETAPAS DE CADA OPERAÇÃO ----------------------------------

create table etapas_edicao (
  id            uuid primary key default gen_random_uuid(),
  edicao_id     uuid not null references edicoes(id) on delete cascade,
  etapa_codigo  text not null references etapas_modelo(codigo) on update cascade,
  concluida     boolean not null default false,
  concluida_por uuid references admin_users(id),
  concluida_em  timestamptz,
  observacao    text,
  updated_at    timestamptz not null default now(),
  unique (edicao_id, etapa_codigo)
);

create index etapas_edicao_pendentes_idx
  on etapas_edicao (edicao_id) where not concluida;

comment on table etapas_edicao is
  'Uma linha por etapa x operacao. Qualquer pessoa da equipe marca; o carimbo diz quem foi.';

-- Marcar é um clique só: quem clicou e quando saem do `auth.uid()` e do
-- relógio do banco, não do formulário. Desmarcar limpa o carimbo, senão
-- sobraria um "concluída por" numa etapa aberta.
create or replace function carimbar_etapa() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.concluida is distinct from old.concluida then
    if new.concluida then
      new.concluida_em  = now();
      new.concluida_por = auth.uid();
    else
      new.concluida_em  = null;
      new.concluida_por = null;
    end if;
  end if;
  return new;
end $$;

create trigger etapas_edicao_carimbo before update on etapas_edicao
  for each row execute function carimbar_etapa();

-- Toda operação nasce com o checklist inteiro em branco. Sem isto alguém
-- teria que lembrar de criar as 19 linhas na mão a cada nova edição.
create or replace function criar_etapas_da_edicao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into etapas_edicao (edicao_id, etapa_codigo)
  select new.id, m.codigo from etapas_modelo m where m.ativa
  on conflict (edicao_id, etapa_codigo) do nothing;
  return new;
end $$;

create trigger edicoes_criam_etapas after insert on edicoes
  for each row execute function criar_etapas_da_edicao();

-- As edições que já existem também entram no painel.
-- `OUTRAS-OPERACOES` fica de fora: é uma edição de mentira, guarda-chuva dos
-- pedidos avulsos, e não tem processo de operação a cumprir.
insert into etapas_edicao (edicao_id, etapa_codigo)
select e.id, m.codigo
from edicoes e cross join etapas_modelo m
where m.ativa and not e.avulsa
on conflict (edicao_id, etapa_codigo) do nothing;

-- ---------- PAINEL ---------------------------------------------------

-- O painel precisa de "quantas faltam" e "está atrasada?" por operação. Sai
-- mais barato e mais consistente calcular no banco do que refazer a conta em
-- cada tela. `atrasadas` conta só o que tem prazo e já venceu.
create or replace view v_painel_etapas with (security_invoker = false) as
select
  e.id            as edicao_id,
  e.codigo,
  e.destino,
  e.hotel,
  e.data_inicio,
  e.data_fim,
  count(*)                                              as total,
  count(*) filter (where ee.concluida)                  as concluidas,
  count(*) filter (where ee.concluida
                     and m.fase = 'PRE_VOUCHER')        as concluidas_pre,
  count(*) filter (where m.fase = 'PRE_VOUCHER')        as total_pre,
  count(*) filter (where ee.concluida
                     and m.fase = 'POS_VOUCHER')        as concluidas_pos,
  count(*) filter (where m.fase = 'POS_VOUCHER')        as total_pos,
  count(*) filter (
    where not ee.concluida
      and m.prazo_dias is not null
      and (e.data_inicio - m.prazo_dias) < current_date
  )                                                     as atrasadas,
  bool_or(ee.concluida) filter (where m.codigo = 'VOUCHER') as voucher_enviado
from edicoes e
join etapas_edicao ee on ee.edicao_id = e.id
join etapas_modelo m  on m.codigo = ee.etapa_codigo
where e.ativa and not e.avulsa and m.ativa and is_admin()
group by e.id;

grant select on v_painel_etapas to authenticated;

-- ---------- ACESSO ----------------------------------------------------

alter table etapas_modelo enable row level security;
alter table etapas_edicao enable row level security;

-- Catálogo: todo mundo da operação lê, só gestor mexe.
create policy etapas_modelo_leitura on etapas_modelo
  for select to authenticated using (is_admin());
create policy etapas_modelo_gestor on etapas_modelo
  for all to authenticated using (is_gestor()) with check (is_gestor());

-- Marcar etapa: qualquer pessoa ativa da equipe, como é na planilha hoje.
-- Criar e apagar linha fica com a trigger e com o cascade da edição.
create policy etapas_edicao_leitura on etapas_edicao
  for select to authenticated using (is_admin());
create policy etapas_edicao_marcar on etapas_edicao
  for update to authenticated using (is_admin()) with check (is_admin());
