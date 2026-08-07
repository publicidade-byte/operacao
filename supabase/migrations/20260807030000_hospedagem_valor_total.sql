-- Hospedagem passa a ter valor TOTAL, não valor por diária.
--
-- A operação recebe do hotel um valor fechado; obrigar a dividir por noites
-- para o sistema multiplicar de novo era trabalho a mais e fonte de erro —
-- ainda mais porque, sem as datas do detalhe preenchidas, a multiplicação
-- dava resultado errado (foi o furo que causou o custo zerado).
--
-- `valor_diaria` fica no banco só para não perder o histórico; ninguém mais
-- lê nem escreve nela.

alter table hospedagem_detalhe add column if not exists valor_total numeric(12,2);

comment on column hospedagem_detalhe.valor_total is
  'Valor total da hospedagem desta pessoa, fechado. Substitui valor_diaria.';
comment on column hospedagem_detalhe.valor_diaria is
  'OBSOLETO: mantido apenas pelo historico. O valor que vale e valor_total.';

-- Converte o que já existe: diária × noites vira o total equivalente.
update hospedagem_detalhe h
   set valor_total = h.valor_diaria * greatest(
         coalesce(h.check_out, s.data_saida) - coalesce(h.check_in, s.data_entrada), 1)
  from colaboradores c
  join solicitacoes s on s.id = c.solicitacao_id
 where c.id = h.colaborador_id
   and h.valor_total is null
   and h.valor_diaria is not null;

-- O custo total deixa de multiplicar por noites.
create or replace function recalcular_custo(p_solicitacao uuid) returns numeric
language sql stable as $fn$
  select coalesce(
    (select sum(v.preco) from voos v
       join colaboradores c on c.id = v.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(t.preco) from transporte_rodoviario t
       join colaboradores c on c.id = t.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(h.valor_total) from hospedagem_detalhe h
       join colaboradores c on c.id = h.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(l.preco) from locacao_carro l
      where l.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(sc.preco) from solicitacao_carros sc
      where sc.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(vn.preco) from locacao_van vn
      where vn.solicitacao_id = p_solicitacao), 0);
$fn$;

-- A visão do diretor entrega o total.
drop view if exists v_aprovacao_hospedagem;
create view v_aprovacao_hospedagem
with (security_invoker = false) as
select h.colaborador_id, h.hotel, h.hotel_hospedagem, h.endereco,
       h.tipo_quarto, h.alimentacao, h.dividindo_com,
       h.check_in, h.check_out, h.valor_total, h.codigo_reserva, h.observacoes,
       c.solicitacao_id
from hospedagem_detalhe h
join colaboradores c on c.id = h.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_hospedagem to authenticated;

-- Recalcula tudo com a regra nova.
update solicitacoes set custo_total = recalcular_custo(id) where status <> 'CANCELADA';
