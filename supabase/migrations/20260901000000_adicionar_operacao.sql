-- =====================================================================
-- ADICIONAR OPERAÇÃO À SOLICITAÇÃO
--
-- Muita solicitação é feita com antecedência, e depois o solicitante pede
-- para trocar a data da operação. Remover já existia; incluir, não — e
-- sem as duas metades "transferir" virava cancelar e refazer, perdendo
-- protocolo, histórico, aprovação e o que a operação já tinha preenchido.
--
-- As mesmas regras da criação valem aqui: todas as operações da
-- solicitação são do mesmo destino, e operação avulsa não se mistura com
-- as do calendário.
-- =====================================================================

create or replace function adicionar_operacao(
  p_solicitacao uuid,
  p_edicao      uuid,
  p_entrada     date default null,
  p_saida       date default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_nome      text;
  v_destino   text;
  v_avulsa    boolean;
  v_codigo    text;
  v_periodo   text;
  v_entrada   date;
  v_saida     date;
  v_principal uuid;
  e           record;
begin
  if not is_admin() then
    raise exception 'Apenas a operação pode incluir uma operação na solicitação.';
  end if;

  select ed.destino, ed.avulsa into v_destino, v_avulsa
    from solicitacoes s join edicoes ed on ed.id = s.edicao_id
   where s.id = p_solicitacao and s.excluida_em is null;
  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;

  select * into e from edicoes where id = p_edicao and ativa;
  if not found then
    raise exception 'Operação não encontrada ou inativa.';
  end if;

  if v_avulsa or e.avulsa then
    raise exception 'Operação avulsa não se mistura com datas do calendário.';
  end if;
  if e.destino <> v_destino then
    raise exception 'Esta solicitação é de %, e a operação escolhida é de %.', v_destino, e.destino;
  end if;

  if exists (select 1 from solicitacao_edicoes
              where solicitacao_id = p_solicitacao and edicao_id = p_edicao) then
    raise exception 'Esta operação já faz parte da solicitação.';
  end if;

  insert into solicitacao_edicoes (solicitacao_id, edicao_id, data_entrada, data_saida)
  values (p_solicitacao, p_edicao,
          coalesce(p_entrada, e.data_inicio), coalesce(p_saida, e.data_fim));

  -- Envelope e principal a partir do conjunto novo, pelas datas pedidas de
  -- cada operação — a mesma regra de quando se remove uma.
  select min(coalesce(se.data_entrada, ed.data_inicio)),
         max(coalesce(se.data_saida, ed.data_fim))
    into v_entrada, v_saida
    from solicitacao_edicoes se join edicoes ed on ed.id = se.edicao_id
   where se.solicitacao_id = p_solicitacao;

  select se.edicao_id into v_principal
    from solicitacao_edicoes se join edicoes ed on ed.id = se.edicao_id
   where se.solicitacao_id = p_solicitacao
   order by ed.data_inicio
   limit 1;

  update solicitacoes s
     set edicao_id = v_principal,
         data_entrada = v_entrada,
         data_saida = v_saida
   where s.id = p_solicitacao;

  select nome into v_nome from admin_users where id = auth.uid();
  v_codigo := e.codigo;
  v_periodo := to_char(e.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(e.data_fim, 'DD/MM/YYYY');

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao, 'OPERACAO_INCLUIDA', v_nome,
    format('Operação %s (%s) incluída na solicitação.', v_codigo, v_periodo),
    jsonb_build_object('edicao_id', p_edicao, 'codigo', v_codigo, 'periodo', v_periodo)
  );
end $fn$;

revoke all on function adicionar_operacao(uuid, uuid, date, date) from public;
grant execute on function adicionar_operacao(uuid, uuid, date, date) to authenticated;
