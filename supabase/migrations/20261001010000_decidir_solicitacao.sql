-- =====================================================================
-- DECIDIR: APROVAR, REPROVAR OU MANDAR REFAZER
--
-- Roda DEPOIS de 20261001000000: o valor novo do enum só pode ser usado
-- numa transação diferente da que o criou.
--
-- `fechar_rodada` ganha um parâmetro opcional com o nome da decisão. Os
-- dois caminhos antigos (aprovar a solicitação inteira e decidir pessoa a
-- pessoa) continuam chamando como sempre chamaram.
-- =====================================================================

create or replace function fechar_rodada(
  p_solicitacao uuid,
  p_aprovado    boolean,
  p_observacao  text,
  p_diretor     uuid,
  p_por_super   boolean,
  p_decisao     text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_nome      text;
  v_quem      text;
  v_escopo    text[];
  v_servicos  text[];
  v_aprovados text[];
  v_novo      status_solicitacao;
  v_falta     boolean;
  v_decisao   text;
begin
  -- Sem nome explícito, vale o que o boolean sempre quis dizer.
  v_decisao := coalesce(p_decisao, case when p_aprovado then 'APROVADA' else 'REPROVADA' end);

  select coalesce(escopo_aprovacao, servicos), servicos, servicos_aprovados
    into v_escopo, v_servicos, v_aprovados
    from solicitacoes where id = p_solicitacao for update;

  select nome into v_nome from diretores where id = p_diretor;
  v_quem := case
    when p_por_super
      then coalesce((select nome from admin_users where id = auth.uid()), 'super admin')
           || ' (super admin, em nome de ' || coalesce(v_nome, 'diretor') || ')'
    else v_nome
  end;

  insert into aprovacoes
    (solicitacao_id, diretor_id, aprovado, decidido_em, observacao, escopo, registrado_por, decisao)
  values
    (p_solicitacao, p_diretor, v_decisao = 'APROVADA', now(),
     nullif(btrim(p_observacao), ''), v_escopo,
     case when p_por_super then auth.uid() else null end, v_decisao);

  if v_decisao = 'APROVADA' then
    v_aprovados := (select array_agg(distinct x) from unnest(v_aprovados || v_escopo) x);
    v_falta := exists (select 1 from unnest(v_servicos) y where not (y = any(v_aprovados)));
    v_novo := case when v_falta then 'EM_PREENCHIMENTO' else 'APROVADA' end;
  elsif v_decisao = 'REFAZER' then
    v_novo := 'REFAZER';
  else
    v_novo := 'REPROVADA';
  end if;

  update solicitacoes
     set status = v_novo::status_solicitacao,
         servicos_aprovados = case when v_decisao = 'APROVADA' then v_aprovados else servicos_aprovados end,
         escopo_aprovacao = null
   where id = p_solicitacao;

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao,
    case v_decisao when 'APROVADA' then 'APROVADA' when 'REFAZER' then 'REFAZER' else 'REPROVADA' end,
    v_quem,
    case
      when v_decisao = 'REFAZER'
        then format('Devolvida para refazer por %s: %s', v_quem, coalesce(nullif(btrim(p_observacao), ''), 'sem motivo'))
      when v_decisao = 'REPROVADA'
        then format('Reprovada no sistema por %s', v_quem)
      when v_novo = 'APROVADA' then format('Aprovada no sistema por %s', v_quem)
      else format('Aprovada por %s apenas para: %s', v_quem, array_to_string(v_escopo, ', '))
    end,
    jsonb_build_object('observacao', p_observacao, 'escopo', v_escopo,
                       'status', v_novo, 'por_super', p_por_super, 'decisao', v_decisao)
  );
end $fn$;

revoke all on function fechar_rodada(uuid, boolean, text, uuid, boolean, text) from public, authenticated;

/**
 * A decisão do diretor, pelo nome.
 *
 * REPROVADA é "não vai acontecer". REFAZER é "corrija e mande de novo" — o
 * caso mais comum: tarifa que caiu, horário que não serve. Os dois exigem
 * motivo, porque sem ele a operação não sabe o que mudar.
 */
create or replace function decidir_solicitacao(
  p_solicitacao uuid,
  p_decisao     text,
  p_observacao  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_status  status_solicitacao;
  v_diretor uuid;
  v_super   boolean;
begin
  if p_decisao not in ('APROVADA', 'REPROVADA', 'REFAZER') then
    raise exception 'Decisão inválida: %.', p_decisao;
  end if;

  select diretor_id, por_super into v_diretor, v_super from quem_decide(p_solicitacao);
  if v_diretor is null then
    raise exception 'Solicitação não encontrada ou não atribuída a você.';
  end if;

  select status into v_status from solicitacoes where id = p_solicitacao;
  if v_status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'Esta solicitação não está aguardando aprovação (status atual: %).', v_status;
  end if;

  if p_decisao <> 'APROVADA' and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Informe o motivo.';
  end if;

  -- Aprovar ou reprovar decide todo mundo junto. Refazer, não: o problema é
  -- da cotação, não das pessoas — elas seguem sem decisão até a volta.
  if p_decisao = 'REFAZER' then
    update colaboradores
       set aprovacao = null, aprovacao_em = null, aprovacao_obs = null
     where solicitacao_id = p_solicitacao;
  else
    update colaboradores
       set aprovacao = (p_decisao = 'APROVADA'),
           aprovacao_em = now(),
           aprovacao_obs = nullif(btrim(p_observacao), '')
     where solicitacao_id = p_solicitacao;
  end if;

  perform fechar_rodada(
    p_solicitacao, p_decisao = 'APROVADA', p_observacao, v_diretor, v_super, p_decisao
  );
end $fn$;

revoke all on function decidir_solicitacao(uuid, text, text) from public;
grant execute on function decidir_solicitacao(uuid, text, text) to authenticated;
