-- Conserta o custo total.
--
-- Dois furos faziam o painel mostrar menos do que a operação tinha lançado:
--
-- 1. A hospedagem era `valor_diaria * (check_out - check_in)`. Quando a
--    operação preenchia o valor mas ainda não as datas do detalhe, a
--    subtração dava NULL, o produto virava NULL e a diária inteira sumia
--    da conta — sem erro nenhum na tela. Agora, faltando as datas do
--    detalhe, usamos o período da própria solicitação; e o mínimo é 1
--    diária, porque valor lançado nunca vale zero.
--
-- 2. Faltava somar `solicitacao_carros`. As reservas múltiplas de carro
--    passaram a viver nessa tabela e nunca entraram no total.

-- A reserva de carro só tinha o que o solicitante pediu. A operação precisa
-- lançar locadora e preço em cada uma delas.
-- Vem ANTES da função: o Postgres valida o corpo de uma função SQL na
-- criação, então `sc.preco` já tem que existir.
alter table solicitacao_carros add column if not exists locadora     text;
alter table solicitacao_carros add column if not exists preco        numeric(12,2);
alter table solicitacao_carros add column if not exists retirada_em  timestamptz;
alter table solicitacao_carros add column if not exists devolucao_em timestamptz;
alter table solicitacao_carros add column if not exists observacoes  text;

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
    (select sum(
        h.valor_diaria
        * greatest(
            coalesce(h.check_out, s.data_saida) - coalesce(h.check_in, s.data_entrada),
            1)
      )
       from hospedagem_detalhe h
       join colaboradores c on c.id = h.colaborador_id
       join solicitacoes   s on s.id = c.solicitacao_id
      where c.solicitacao_id = p_solicitacao
        and h.valor_diaria is not null), 0)
  + coalesce(
    (select sum(l.preco) from locacao_carro l
      where l.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(sc.preco) from solicitacao_carros sc
      where sc.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(vn.preco) from locacao_van vn
      where vn.solicitacao_id = p_solicitacao), 0);
$$;

-- `carro_exige_condutor` cobrava condutor nos campos carro_* de solicitacoes.
-- Só que agora cada carro tem o seu condutor em `solicitacao_carros`, e um
-- CHECK não enxerga outra tabela — resultado: a constraint barrava até um
-- UPDATE que não tocava em carro nenhum, nas solicitações antigas. Quem
-- valida condutor é a Edge Function `criar-solicitacao`, na entrada.
alter table solicitacoes drop constraint if exists carro_exige_condutor;

-- Recalcula o que já está no banco: as solicitações que estavam com o total
-- errado passam a mostrar o valor certo sem ninguém precisar reabrir e salvar.
update solicitacoes
   set custo_total = recalcular_custo(id)
 where status <> 'CANCELADA';
