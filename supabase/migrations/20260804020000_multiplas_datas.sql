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
