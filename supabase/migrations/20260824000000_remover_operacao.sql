-- Tirar UMA operação de uma solicitação que cobre várias.
--
-- Acontece o tempo todo: o solicitante avisa que o DJ não vai mais na primeira
-- data, mas continua nas outras duas. Até aqui a saída era cancelar tudo e
-- refazer — o que perde protocolo, histórico, aprovação e os dados que a
-- operação já tinha preenchido.
--
-- Não é um `delete` na tela porque três coisas precisam acontecer juntas, e
-- esquecer qualquer uma deixa a solicitação inconsistente:
--
--   1. `solicitacoes.edicao_id` aponta para UMA operação, a principal. Se for
--      justo a removida, ela vira ponteiro para algo que a solicitação não
--      cobre mais — e é por esse campo que destino e hotel aparecem na tela.
--   2. `data_entrada`/`data_saida` são o envelope das operações. Tirar a
--      primeira sem recalcular deixa a estadia começando num dia que não
--      existe mais no pedido.
--   3. O histórico precisa registrar quem tirou o quê. Uma operação some da
--      tela; sem registro, ninguém sabe se foi decisão ou defeito.

create or replace function remover_operacao(
  p_solicitacao uuid,
  p_edicao      uuid
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_quantas  int;
  v_nome     text;
  v_codigo   text;
  v_periodo  text;
  v_entrada  date;
  v_saida    date;
  v_principal uuid;
begin
  if not is_admin() then
    raise exception 'Apenas a operação pode remover uma operação da solicitação.';
  end if;

  select count(*) into v_quantas
    from solicitacao_edicoes where solicitacao_id = p_solicitacao;

  if v_quantas = 0 then
    raise exception 'Solicitação não encontrada ou sem operações vinculadas.';
  end if;

  -- Uma solicitação sem operação nenhuma não é solicitação: não teria destino,
  -- período, nem para onde mandar ninguém. Quem quer zerar tudo cancela.
  if v_quantas <= 1 then
    raise exception
      'Esta é a única operação da solicitação. Para encerrá-la use Cancelar, que preserva o histórico.';
  end if;

  select e.codigo, to_char(e.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(e.data_fim, 'DD/MM/YYYY')
    into v_codigo, v_periodo
    from edicoes e where e.id = p_edicao;

  delete from solicitacao_edicoes
   where solicitacao_id = p_solicitacao and edicao_id = p_edicao;

  if not found then
    raise exception 'Esta operação não faz parte da solicitação.';
  end if;

  -- Novo envelope e nova principal, a partir do que sobrou.
  select min(e.data_inicio), max(e.data_fim)
    into v_entrada, v_saida
    from solicitacao_edicoes se join edicoes e on e.id = se.edicao_id
   where se.solicitacao_id = p_solicitacao;

  select se.edicao_id into v_principal
    from solicitacao_edicoes se join edicoes e on e.id = se.edicao_id
   where se.solicitacao_id = p_solicitacao
   order by e.data_inicio
   limit 1;

  -- A estadia passa a ser o envelope do que sobrou, e não um recorte da
  -- estadia antiga.
  --
  -- Recortar parecia mais respeitoso com quem tinha ajustado as datas à mão,
  -- mas produz estadia impossível: numa solicitação que ia de 05 a 08/10 e
  -- perde justamente a operação de outubro, o recorte deixaria entrada em
  -- 12/10 e saída em 08/10 — saída antes da entrada, que o banco recusa. O
  -- envelope é como o formulário calcula a estadia desde sempre; manter a
  -- mesma regra aqui é o que garante um estado que existe.
  update solicitacoes s
     set edicao_id = v_principal,
         data_entrada = v_entrada,
         data_saida = v_saida
   where s.id = p_solicitacao;

  select nome into v_nome from admin_users where id = auth.uid();

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao, 'OPERACAO_REMOVIDA', v_nome,
    format('Operação %s (%s) removida da solicitação.',
           coalesce(v_codigo, '?'), coalesce(v_periodo, '?')),
    jsonb_build_object('edicao_id', p_edicao, 'codigo', v_codigo, 'periodo', v_periodo)
  );
end $fn$;

revoke all on function remover_operacao(uuid, uuid) from public;
grant execute on function remover_operacao(uuid, uuid) to authenticated;
