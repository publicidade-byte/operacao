-- Aprovação por serviço, em vez de tudo-ou-nada.
--
-- O caso real: uma solicitação de aéreo + hospedagem + carro em que só o
-- aéreo tinha preço fechado. A emissão do voo não podia esperar a cotação da
-- locadora, mas o único botão existente mandava a solicitação inteira — e o
-- diretor teria que aprovar um custo que ninguém sabia ainda.
--
-- E havia um beco sem saída junto: depois de APROVADA, só o super admin
-- edita, mas nem ele conseguia mandar de volta para o diretor, porque o botão
-- de enviar só aparecia em EM_PREENCHIMENTO. Editava, e a alteração ficava
-- valendo sem ninguém ter aprovado.
--
-- O modelo passa a ter duas listas por solicitação:
--
--   escopo_aprovacao   — os serviços da rodada em curso (nulo = nenhuma)
--   servicos_aprovados — o que o diretor já bateu o martelo, acumulado
--
-- Uma aprovação parcial devolve a solicitação para EM_PREENCHIMENTO em vez de
-- APROVADA: ela não está aprovada, está aprovada EM PARTE, e a operação
-- precisa poder continuar trabalhando no resto. APROVADA só quando
-- `servicos_aprovados` cobre `servicos` inteiro.

alter table solicitacoes
  add column if not exists escopo_aprovacao   text[],
  add column if not exists servicos_aprovados text[] not null default '{}';

comment on column solicitacoes.escopo_aprovacao is
  'Servicos da rodada de aprovacao em curso. Nulo quando nao ha rodada aberta.';
comment on column solicitacoes.servicos_aprovados is
  'Servicos ja aprovados pelo diretor, acumulado entre rodadas.';

-- A decisão guarda o que ela cobriu. Sem isto, olhando o histórico depois,
-- ninguém sabe se "aprovada" queria dizer a viagem toda ou só a passagem.
alter table aprovacoes add column if not exists escopo text[];

comment on column aprovacoes.escopo is
  'Servicos que esta decisao cobriu. Nulo nas decisoes anteriores a aprovacao parcial, que eram sempre integrais.';

-- O histórico anterior é todo de aprovação integral: o que está APROVADA teve
-- tudo aprovado. Registrar isso evita que a tela mostre uma solicitação antiga
-- como se nada nela tivesse sido aprovado.
update solicitacoes set servicos_aprovados = servicos
 where status in ('APROVADA', 'CONCLUIDA') and servicos_aprovados = '{}';

-- ---------- ABRIR UMA RODADA (integral ou parcial) --------------------

/**
 * Abre uma rodada de aprovação.
 *
 * `p_escopo` nulo ou vazio significa a solicitação inteira — é o botão que já
 * existia. Uma lista de serviços abre uma rodada parcial.
 *
 * Reenviar um serviço já aprovado o tira de `servicos_aprovados`: se voltou
 * para o diretor é porque mudou, e o martelo anterior não vale para a versão
 * nova.
 */
create or replace function enviar_para_aprovacao(
  p_solicitacao uuid,
  p_escopo      text[] default null
) returns text
language plpgsql security definer set search_path = public as $fn$
declare
  s        record;
  v_escopo text[];
  v_nome   text;
  v_fora   text;
  v_total  boolean;
begin
  if not is_admin() then
    raise exception 'Apenas a operação pode enviar para aprovação.';
  end if;

  select * into s from solicitacoes
   where id = p_solicitacao and excluida_em is null
   for update;
  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;

  v_escopo := coalesce(nullif(p_escopo, '{}'), s.servicos);

  select string_agg(x, ', ') into v_fora
    from unnest(v_escopo) x where not (x = any(s.servicos));
  if v_fora is not null then
    raise exception 'Esta solicitação não pediu: %.', v_fora;
  end if;

  -- Quem pode abrir rodada, e a partir de qual estado.
  if s.status in ('RECEBIDA', 'EM_PREENCHIMENTO', 'REPROVADA') then
    null;
  elsif s.status in ('APROVADA', 'CONCLUIDA') then
    -- Depois de aprovada a solicitação está travada para a equipe. Quem tem
    -- permissão de mexer precisa ter permissão de mandar reaprovar, senão a
    -- alteração passa a valer sem decisão de ninguém.
    if not is_super() then
      raise exception
        'Solicitação já aprovada. Só o super admin pode abrir uma nova rodada de aprovação.';
    end if;
  elsif s.status = 'AGUARDANDO_APROVACAO' then
    raise exception
      'Já existe uma aprovação em curso (%) — aguarde a decisão ou reabra para edição.',
      array_to_string(coalesce(s.escopo_aprovacao, s.servicos), ', ');
  else
    raise exception 'Não é possível enviar para aprovação uma solicitação %.', s.status;
  end if;

  update solicitacoes
     set status = 'AGUARDANDO_APROVACAO'::status_solicitacao,
         escopo_aprovacao = v_escopo,
         servicos_aprovados = coalesce(
           (select array_agg(a) from unnest(servicos_aprovados) a
             where not (a = any(v_escopo))),
           '{}'
         )
   where id = p_solicitacao;

  select nome into v_nome from admin_users where id = auth.uid();
  v_total := v_escopo @> s.servicos;

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao, 'ENVIADA_APROVACAO', v_nome,
    case when v_total
         then 'Enviada para aprovação (solicitação completa)'
         else 'Enviada para aprovação parcial: ' || array_to_string(v_escopo, ', ') end,
    jsonb_build_object('escopo', v_escopo, 'parcial', not v_total)
  );

  return array_to_string(v_escopo, ', ');
end $fn$;

revoke all on function enviar_para_aprovacao(uuid, text[]) from public;
grant execute on function enviar_para_aprovacao(uuid, text[]) to authenticated;

-- ---------- DECIDIR ---------------------------------------------------

create or replace function aprovar_solicitacao(
  p_solicitacao uuid,
  p_aprovado    boolean,
  p_observacao  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_diretor   uuid;
  v_status    status_solicitacao;
  v_nome      text;
  v_escopo    text[];
  v_servicos  text[];
  v_aprovados text[];
  v_novo      status_solicitacao;
  v_falta     boolean;
begin
  v_diretor := diretor_atual();
  if v_diretor is null then
    raise exception 'Apenas diretores aprovadores podem executar esta ação.';
  end if;

  select status, coalesce(escopo_aprovacao, servicos), servicos, servicos_aprovados
    into v_status, v_escopo, v_servicos, v_aprovados
    from solicitacoes
   where id = p_solicitacao and diretor_id = v_diretor
   for update;

  if v_status is null then
    raise exception 'Solicitação não encontrada ou não atribuída a você.';
  end if;

  if v_status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'Esta solicitação não está aguardando aprovação (status atual: %).', v_status;
  end if;

  if not p_aprovado and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da reprovação.';
  end if;

  select nome into v_nome from diretores where id = v_diretor;

  insert into aprovacoes
    (solicitacao_id, diretor_id, aprovado, decidido_em, observacao, escopo)
  values
    (p_solicitacao, v_diretor, p_aprovado, now(), nullif(btrim(p_observacao), ''), v_escopo);

  if p_aprovado then
    v_aprovados := (select array_agg(distinct x) from unnest(v_aprovados || v_escopo) x);
    -- Aprovação parcial NÃO deixa a solicitação "aprovada": ela volta para a
    -- operação terminar o resto. Só vira APROVADA quando não falta serviço.
    v_falta := exists (select 1 from unnest(v_servicos) y where not (y = any(v_aprovados)));
    v_novo := case when v_falta then 'EM_PREENCHIMENTO' else 'APROVADA' end;
  else
    v_novo := 'REPROVADA';
  end if;

  update solicitacoes
     set status = v_novo::status_solicitacao,
         servicos_aprovados = case when p_aprovado then v_aprovados else servicos_aprovados end,
         escopo_aprovacao = null
   where id = p_solicitacao;

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao,
    case when p_aprovado then 'APROVADA' else 'REPROVADA' end,
    v_nome,
    case
      when not p_aprovado
        then format('Reprovada no sistema por %s', v_nome)
      when v_novo = 'APROVADA'
        then format('Aprovada no sistema por %s', v_nome)
      else format('Aprovada por %s apenas para: %s', v_nome, array_to_string(v_escopo, ', '))
    end,
    jsonb_build_object('observacao', p_observacao, 'escopo', v_escopo, 'status', v_novo)
  );
end $fn$;

grant execute on function aprovar_solicitacao(uuid, boolean, text) to authenticated;

-- ---------- O DIRETOR PRECISA VER O QUE ESTÁ DECIDINDO ----------------

drop view if exists v_aprovacao_solicitacoes;
create view v_aprovacao_solicitacoes with (security_invoker = false) as
select s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem, s.servicos, s.centro_custo,
  s.escopo_aprovacao, s.servicos_aprovados,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.precisa_bagagem, s.tipo_voo, s.voo_data_ida, s.voo_data_volta,
  s.van_local_saida, s.van_horario_saida, s.van_destino, s.van_qtd_passageiros,
  s.van_data_saida, s.van_hora_saida, s.van_retorno_data, s.van_retorno_hora,
  s.van_tipo_veiculo, s.van_qtd_veiculos,
  s.van_retorno_local, s.van_retorno_destino,
  s.rodo_regiao_saida, s.rodo_cidade_estado,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.carro_condutor_nome, s.carro_transmissao,
  s.hosp_externa_operacao, s.hosp_externa_obs,
  s.hosp_qtd_quartos, s.hosp_tipo_quarto, s.hosp_alimentacao,
  s.solicitante_nome, s.solicitante_email, s.solicitante_whatsapp,
  coalesce(s.custo_total_manual, s.custo_total) as custo_total,
  s.observacoes_internas, s.created_at, s.updated_at,
  e.destino, e.hotel, e.avulsa, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax,
  (select count(*) from solicitacao_edicoes se where se.solicitacao_id = s.id) as qtd_operacoes
from solicitacoes s
join edicoes e on e.id = s.edicao_id
where s.diretor_id = diretor_atual() and s.excluida_em is null;

grant select on v_aprovacao_solicitacoes to authenticated;

drop view if exists v_aprovacao_decisoes;
create view v_aprovacao_decisoes with (security_invoker = false) as
select a.id, a.solicitacao_id, a.aprovado, a.decidido_em, a.observacao, a.escopo, a.created_at
from aprovacoes a
join solicitacoes s on s.id = a.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on v_aprovacao_decisoes to authenticated;
