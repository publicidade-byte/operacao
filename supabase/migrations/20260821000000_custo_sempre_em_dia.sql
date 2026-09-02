-- O custo total para de depender de a tela lembrar de recalcular.
--
-- Até aqui, `custo_total` só era atualizado no fim de "Salvar dados
-- operacionais": a tela gravava voos, rodoviário, hospedagem, carro e van, e
-- só então chamava `recalcular_custo`. Se qualquer um desses blocos falhasse,
-- o que veio antes já estava gravado e o recálculo nunca acontecia — os preços
-- entravam e o total ficava vazio. Foi exatamente o que se viu: solicitação
-- com preço lançado e custo em branco.
--
-- Qualquer caminho que não passe por aquele botão tinha o mesmo problema: uma
-- correção via SQL, um import, uma tela futura.
--
-- Com o cálculo pendurado nas tabelas de origem, o total passa a ser
-- consequência do dado, não de alguém lembrar de pedir.

create or replace function atualizar_custo_da_solicitacao() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_sol uuid;
begin
  if tg_table_name in ('locacao_carro', 'locacao_van') then
    v_sol := coalesce(new.solicitacao_id, old.solicitacao_id);
  else
    select c.solicitacao_id into v_sol
      from colaboradores c
     where c.id = coalesce(new.colaborador_id, old.colaborador_id);
  end if;

  if v_sol is null then
    return coalesce(new, old);
  end if;

  -- `custo_total_manual` continua mandando onde existe: é o valor fechado que
  -- alguém digitou de propósito, e recalcular por cima apagaria a decisão.
  update solicitacoes
     set custo_total = recalcular_custo(v_sol)
   where id = v_sol;

  return coalesce(new, old);
end $fn$;

drop trigger if exists voos_custo on voos;
create trigger voos_custo after insert or update or delete on voos
  for each row execute function atualizar_custo_da_solicitacao();

drop trigger if exists rodo_custo on transporte_rodoviario;
create trigger rodo_custo after insert or update or delete on transporte_rodoviario
  for each row execute function atualizar_custo_da_solicitacao();

drop trigger if exists hosp_custo on hospedagem_detalhe;
create trigger hosp_custo after insert or update or delete on hospedagem_detalhe
  for each row execute function atualizar_custo_da_solicitacao();

drop trigger if exists carro_custo on locacao_carro;
create trigger carro_custo after insert or update or delete on locacao_carro
  for each row execute function atualizar_custo_da_solicitacao();

drop trigger if exists van_custo on locacao_van;
create trigger van_custo after insert or update or delete on locacao_van
  for each row execute function atualizar_custo_da_solicitacao();

-- Põe em dia o que ficou para trás.
update solicitacoes
   set custo_total = recalcular_custo(id)
 where excluida_em is null
   and coalesce(custo_total, 0) is distinct from recalcular_custo(id);
