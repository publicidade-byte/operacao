-- =====================================================================
-- SÓ MUDANÇA DE VALOR PEDE NOVA APROVAÇÃO
--
-- Toda solicitação pode mudar depois de aprovada: reserva que caiu,
-- categoria de carro que acabou, data que mudou. A marca "alterada após
-- aprovação" subia em QUALQUER edição, e a tela mandava reenviar para o
-- diretor até quem só corrigiu um código de reserva.
--
-- O diretor aprova custo. A marca agora sobe só quando o VALOR de algum
-- serviço muda — e o painel, ao salvar, já manda de volta para ele os
-- serviços cujo valor mudou. A marca fica como rede de segurança: se o
-- reenvio automático falhar, a tela continua avisando.
-- =====================================================================

create or replace function marcar_alteracao_pos_aprovacao() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_sol uuid;
  v_col text;
begin
  -- A coluna de valor de cada tabela.
  v_col := case tg_table_name
    when 'hospedagem_detalhe' then 'valor_total'
    when 'day_use_detalhe'    then 'valor'
    else 'preco'
  end;

  -- Sem mudança de valor, não há o que o diretor precise decidir de novo.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) ->> v_col)::numeric is not distinct from (to_jsonb(old) ->> v_col)::numeric then
    return new;
  end if;
  if tg_op = 'INSERT' and (to_jsonb(new) ->> v_col) is null then
    return new;
  end if;

  if tg_table_name in ('locacao_carro', 'locacao_van') then
    v_sol := new.solicitacao_id;
  else
    select c.solicitacao_id into v_sol
      from colaboradores c
     where c.id = new.colaborador_id;
  end if;

  if v_sol is null then
    return new;
  end if;

  update solicitacoes
     set alterada_apos_aprovacao = true
   where id = v_sol
     and status in ('APROVADA', 'CONCLUIDA')
     and not alterada_apos_aprovacao;

  return new;
end $fn$;
