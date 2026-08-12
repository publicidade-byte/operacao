-- Data e hora deixam de ser um timestamp com fuso.
--
-- O PROBLEMA: os campos eram `timestamptz` e o formulário mandava o texto do
-- input ("2026-09-29T07:50") sem fuso nenhum. O Postgres interpretava isso
-- como UTC, gravava 07:50Z, e na volta o navegador convertia para o fuso de
-- São Paulo — 04:50. Quem digitava 07:50 via 04:50 depois de salvar.
--
-- POR QUE ISSO NÃO SE CONSERTA COM FUSO: horário de voo, de embarque e de
-- retirada de carro é hora de relógio no lugar onde acontece. Não existe
-- "07:50 em UTC" para um voo que sai às 07:50 de Guarulhos — guardar isso
-- como instante universal cria uma conversão que nunca deveria existir.
--
-- A SOLUÇÃO: data e hora em colunas próprias, sem fuso. É também o que foi
-- pedido na tela: dois campos separados em vez de um só.
--
-- As colunas antigas ficam pelo histórico. A conversão lê o valor gravado
-- COMO UTC, que é exatamente o que foi digitado antes de a conversão errada
-- acontecer — assim ninguém precisa reconferir o que já está lançado.

-- ---------- voos ----------------------------------------------------------
alter table voos add column if not exists partida_data date;
alter table voos add column if not exists partida_hora time;
alter table voos add column if not exists chegada_data date;
alter table voos add column if not exists chegada_hora time;

update voos set
  partida_data = coalesce(partida_data, (partida at time zone 'UTC')::date),
  partida_hora = coalesce(partida_hora, (partida at time zone 'UTC')::time),
  chegada_data = coalesce(chegada_data, (chegada at time zone 'UTC')::date),
  chegada_hora = coalesce(chegada_hora, (chegada at time zone 'UTC')::time)
where partida is not null or chegada is not null;

-- ---------- rodoviário ----------------------------------------------------
alter table transporte_rodoviario add column if not exists apresentacao_data date;
alter table transporte_rodoviario add column if not exists apresentacao_hora time;
alter table transporte_rodoviario add column if not exists ida_data          date;
alter table transporte_rodoviario add column if not exists ida_hora          time;
alter table transporte_rodoviario add column if not exists volta_data        date;
alter table transporte_rodoviario add column if not exists volta_hora        time;

update transporte_rodoviario set
  apresentacao_data = coalesce(apresentacao_data, (apresentacao_em at time zone 'UTC')::date),
  apresentacao_hora = coalesce(apresentacao_hora, (apresentacao_em at time zone 'UTC')::time),
  ida_data   = coalesce(ida_data,   (horario_ida   at time zone 'UTC')::date),
  ida_hora   = coalesce(ida_hora,   (horario_ida   at time zone 'UTC')::time),
  volta_data = coalesce(volta_data, (horario_volta at time zone 'UTC')::date),
  volta_hora = coalesce(volta_hora, (horario_volta at time zone 'UTC')::time);

-- ---------- van / ônibus --------------------------------------------------
alter table locacao_van add column if not exists saida_data   date;
alter table locacao_van add column if not exists saida_hora   time;
alter table locacao_van add column if not exists chegada_data date;
alter table locacao_van add column if not exists chegada_hora time;

update locacao_van set
  saida_data   = coalesce(saida_data,   (saida_em   at time zone 'UTC')::date),
  saida_hora   = coalesce(saida_hora,   (saida_em   at time zone 'UTC')::time),
  chegada_data = coalesce(chegada_data, (chegada_em at time zone 'UTC')::date),
  chegada_hora = coalesce(chegada_hora, (chegada_em at time zone 'UTC')::time);

-- ---------- locação de carro ----------------------------------------------
alter table locacao_carro add column if not exists retirada_data  date;
alter table locacao_carro add column if not exists retirada_hora  time;
alter table locacao_carro add column if not exists devolucao_data date;
alter table locacao_carro add column if not exists devolucao_hora time;

update locacao_carro set
  retirada_data  = coalesce(retirada_data,  (retirada_em  at time zone 'UTC')::date),
  retirada_hora  = coalesce(retirada_hora,  (retirada_em  at time zone 'UTC')::time),
  devolucao_data = coalesce(devolucao_data, (devolucao_em at time zone 'UTC')::date),
  devolucao_hora = coalesce(devolucao_hora, (devolucao_em at time zone 'UTC')::time);

-- ---------- visões do diretor ---------------------------------------------
drop view if exists v_aprovacao_voos;
create view v_aprovacao_voos with (security_invoker = false) as
select v.colaborador_id, v.trecho, v.companhia, v.numero_voo,
       v.aeroporto_origem, v.aeroporto_destino,
       v.partida_data, v.partida_hora, v.chegada_data, v.chegada_hora,
       v.localizador, v.preco, c.solicitacao_id
from voos v
join colaboradores c on c.id = v.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();
grant select on v_aprovacao_voos to authenticated;

drop view if exists v_aprovacao_rodoviario;
create view v_aprovacao_rodoviario with (security_invoker = false) as
select t.colaborador_id, t.empresa, t.numero_onibus,
       t.apresentacao_data, t.apresentacao_hora,
       t.ida_data, t.ida_hora, t.volta_data, t.volta_hora,
       t.local_embarque_ida, t.local_embarque_volta, t.preco, c.solicitacao_id
from transporte_rodoviario t
join colaboradores c on c.id = t.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();
grant select on v_aprovacao_rodoviario to authenticated;

drop view if exists v_aprovacao_carro;
create view v_aprovacao_carro with (security_invoker = false) as
select l.solicitacao_id, l.locadora, l.categoria, l.retirada_local,
       l.retirada_data, l.retirada_hora, l.devolucao_local,
       l.devolucao_data, l.devolucao_hora,
       l.condutor_colaborador_id, l.preco, l.observacoes
from locacao_carro l
join solicitacoes s on s.id = l.solicitacao_id
where s.diretor_id = diretor_atual();
grant select on v_aprovacao_carro to authenticated;

drop view if exists v_aprovacao_van;
create view v_aprovacao_van with (security_invoker = false) as
select vn.solicitacao_id, vn.empresa, vn.motorista, vn.local_saida,
       vn.saida_data, vn.saida_hora, vn.local_chegada,
       vn.chegada_data, vn.chegada_hora,
       vn.qtd_passageiros, vn.preco, vn.observacoes
from locacao_van vn
join solicitacoes s on s.id = vn.solicitacao_id
where s.diretor_id = diretor_atual();
grant select on v_aprovacao_van to authenticated;
