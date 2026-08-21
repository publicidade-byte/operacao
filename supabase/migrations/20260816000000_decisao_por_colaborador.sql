-- Três mudanças na aprovação, que se cruzam:
--
--   1. O diretor decide POR PESSOA, não só pela solicitação inteira.
--   2. Ele aprova VÁRIAS solicitações de uma vez, da lista.
--   3. O super admin enxerga e opera a área do diretor.
--
-- ---------- POR QUE A DECISÃO POR PESSOA MORA NO COLABORADOR -----------
--
-- A decisão corrente fica em `colaboradores`, e o histórico completo em
-- `aprovacoes_colaborador`. Duas colunas em vez de uma tabela só porque a
-- pergunta "esta pessoa está aprovada AGORA?" é feita em toda tela e não
-- deveria virar um sub-select do último registro toda vez.
--
-- A cada nova rodada as decisões individuais são zeradas. Uma rodada nova é
-- uma decisão nova: se o aéreo foi aprovado para cinco pessoas e depois a
-- operação manda o carro, o diretor decide de novo quem entra — não herda um
-- martelo dado sobre outra coisa.
--
-- ---------- POR QUE O SUPER ADMIN NÃO VIRA DIRETOR ---------------------
--
-- Ele passa a ver e a poder decidir, mas a decisão sai com o NOME DELE no
-- histórico, nunca com o do diretor. Registrar uma aprovação como se fosse de
-- outra pessoa destruiria a única coisa que a trilha de aprovação serve para
-- provar: quem autorizou o gasto.

-- ---------- 1. DECISÃO POR PESSOA -------------------------------------

alter table colaboradores
  add column if not exists aprovacao      boolean,
  add column if not exists aprovacao_em   timestamptz,
  add column if not exists aprovacao_obs  text;

comment on column colaboradores.aprovacao is
  'Decisao do diretor sobre esta pessoa na rodada em curso. Nulo = ainda nao decidido.';

create table if not exists aprovacoes_colaborador (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  diretor_id     uuid not null references diretores(id),
  -- Preenchido quando quem decidiu foi o super admin, e não o diretor.
  registrado_por uuid references admin_users(id),
  aprovado       boolean not null,
  escopo         text[],
  observacao     text,
  decidido_em    timestamptz not null default now()
);

create index if not exists aprovacoes_colaborador_sol_idx
  on aprovacoes_colaborador (solicitacao_id);

comment on table aprovacoes_colaborador is
  'Historico das decisoes por pessoa. A decisao corrente fica em colaboradores.aprovacao.';

alter table aprovacoes_colaborador enable row level security;

create policy aprovacoes_colaborador_leitura on aprovacoes_colaborador
  for select to authenticated using (is_admin());

-- ---------- QUEM ESTÁ DECIDINDO ---------------------------------------

/**
 * O diretor desta solicitação, ou o super admin agindo no lugar dele.
 *
 * Devolve o `diretor_id` da solicitação nos dois casos, porque a decisão
 * pertence ao cargo. Quem clicou fica em `registrado_por`.
 */
create or replace function quem_decide(p_solicitacao uuid)
returns table (diretor_id uuid, por_super boolean)
language sql security definer stable set search_path = public as $fn$
  select s.diretor_id, (diretor_atual() is distinct from s.diretor_id)
    from solicitacoes s
   where s.id = p_solicitacao
     and (s.diretor_id = diretor_atual() or is_super());
$fn$;

grant execute on function quem_decide(uuid) to authenticated;

-- ---------- FECHAR A RODADA -------------------------------------------

/**
 * Aplica o desfecho de uma rodada de aprovação.
 *
 * Existe separada porque três caminhos chegam aqui: aprovar a solicitação
 * inteira, aprovar em lote pela lista, e a última pessoa de uma decisão
 * individual sendo decidida. Os três precisam mexer no status exatamente do
 * mesmo jeito, senão o status passa a depender de por onde se clicou.
 */
create or replace function fechar_rodada(
  p_solicitacao uuid,
  p_aprovado    boolean,
  p_observacao  text,
  p_diretor     uuid,
  p_por_super   boolean
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
begin
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
    (solicitacao_id, diretor_id, aprovado, decidido_em, observacao, escopo, registrado_por)
  values
    (p_solicitacao, p_diretor, p_aprovado, now(), nullif(btrim(p_observacao), ''), v_escopo,
     case when p_por_super then auth.uid() else null end);

  if p_aprovado then
    v_aprovados := (select array_agg(distinct x) from unnest(v_aprovados || v_escopo) x);
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
    v_quem,
    case
      when not p_aprovado then format('Reprovada no sistema por %s', v_quem)
      when v_novo = 'APROVADA' then format('Aprovada no sistema por %s', v_quem)
      else format('Aprovada por %s apenas para: %s', v_quem, array_to_string(v_escopo, ', '))
    end,
    jsonb_build_object('observacao', p_observacao, 'escopo', v_escopo,
                       'status', v_novo, 'por_super', p_por_super)
  );
end $fn$;

revoke all on function fechar_rodada(uuid, boolean, text, uuid, boolean) from public, authenticated;

-- ---------- DECIDIR UMA PESSOA ----------------------------------------

/**
 * Aprova ou reprova UMA pessoa da solicitação.
 *
 * Quando a última pessoa é decidida, a rodada fecha sozinha. O desfecho é
 * aprovado se pelo menos uma pessoa foi aprovada: reprovar um passageiro não
 * cancela a viagem dos outros quatro — a operação segue com quem foi
 * aprovado, que é como isso funciona na prática.
 */
create or replace function decidir_colaborador(
  p_colaborador uuid,
  p_aprovado    boolean,
  p_observacao  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_sol       uuid;
  v_status    status_solicitacao;
  v_escopo    text[];
  v_diretor   uuid;
  v_super     boolean;
  v_nome      text;
  v_pessoa    text;
  v_faltam    int;
  v_algum_sim boolean;
begin
  select c.solicitacao_id, c.nome_completo, s.status, coalesce(s.escopo_aprovacao, s.servicos)
    into v_sol, v_pessoa, v_status, v_escopo
    from colaboradores c
    join solicitacoes s on s.id = c.solicitacao_id
   where c.id = p_colaborador;

  if v_sol is null then
    raise exception 'Colaborador não encontrado.';
  end if;

  select diretor_id, por_super into v_diretor, v_super from quem_decide(v_sol);
  if v_diretor is null then
    raise exception 'Esta solicitação não está atribuída a você.';
  end if;

  if v_status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'Esta solicitação não está aguardando aprovação (status atual: %).', v_status;
  end if;

  if not p_aprovado and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da reprovação de %.', v_pessoa;
  end if;

  update colaboradores
     set aprovacao = p_aprovado,
         aprovacao_em = now(),
         aprovacao_obs = nullif(btrim(p_observacao), '')
   where id = p_colaborador;

  insert into aprovacoes_colaborador
    (solicitacao_id, colaborador_id, diretor_id, registrado_por, aprovado, escopo, observacao)
  values
    (v_sol, p_colaborador, v_diretor,
     case when v_super then auth.uid() else null end,
     p_aprovado, v_escopo, nullif(btrim(p_observacao), ''));

  select nome into v_nome from diretores where id = v_diretor;
  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    v_sol, 'DECISAO_PESSOA',
    case when v_super
         then coalesce((select nome from admin_users where id = auth.uid()), 'super admin') || ' (super admin)'
         else v_nome end,
    format('%s: %s', v_pessoa, case when p_aprovado then 'aprovado' else 'reprovado' end),
    jsonb_build_object('colaborador_id', p_colaborador, 'aprovado', p_aprovado,
                       'observacao', p_observacao)
  );

  -- Todo mundo decidido? Então a rodada acabou.
  select count(*) filter (where aprovacao is null),
         bool_or(aprovacao)
    into v_faltam, v_algum_sim
    from colaboradores where solicitacao_id = v_sol;

  if v_faltam = 0 then
    perform fechar_rodada(
      v_sol,
      coalesce(v_algum_sim, false),
      case when coalesce(v_algum_sim, false)
           then null
           else 'Todos os passageiros foram reprovados individualmente.' end,
      v_diretor, v_super
    );
  end if;
end $fn$;

revoke all on function decidir_colaborador(uuid, boolean, text) from public;
grant execute on function decidir_colaborador(uuid, boolean, text) to authenticated;

-- ---------- DECIDIR A SOLICITAÇÃO INTEIRA -----------------------------

create or replace function aprovar_solicitacao(
  p_solicitacao uuid,
  p_aprovado    boolean,
  p_observacao  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_status  status_solicitacao;
  v_diretor uuid;
  v_super   boolean;
begin
  select diretor_id, por_super into v_diretor, v_super from quem_decide(p_solicitacao);
  if v_diretor is null then
    raise exception 'Solicitação não encontrada ou não atribuída a você.';
  end if;

  select status into v_status from solicitacoes where id = p_solicitacao;
  if v_status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'Esta solicitação não está aguardando aprovação (status atual: %).', v_status;
  end if;

  if not p_aprovado and coalesce(btrim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da reprovação.';
  end if;

  -- Decidir a solicitação inteira decide todo mundo junto: sem isto, as
  -- pessoas ficariam "não decididas" numa solicitação já aprovada.
  update colaboradores
     set aprovacao = p_aprovado,
         aprovacao_em = now(),
         aprovacao_obs = nullif(btrim(p_observacao), '')
   where solicitacao_id = p_solicitacao;

  perform fechar_rodada(p_solicitacao, p_aprovado, p_observacao, v_diretor, v_super);
end $fn$;

grant execute on function aprovar_solicitacao(uuid, boolean, text) to authenticated;

-- ---------- 2. APROVAR VÁRIAS DE UMA VEZ ------------------------------

/**
 * Aprova em lote, pela lista.
 *
 * Devolve uma linha por solicitação em vez de estourar no primeiro problema:
 * numa seleção de dez, uma que já foi decidida por outro caminho não pode
 * derrubar as outras nove. A tela mostra o que passou e o que não passou.
 *
 * Só aprova. Reprovar exige motivo, e um motivo único colado em várias
 * solicitações diferentes não explica nenhuma delas.
 */
create or replace function aprovar_varias(
  p_solicitacoes uuid[],
  p_observacao   text default null
) returns table (solicitacao_id uuid, ok boolean, erro text)
language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
begin
  foreach v_id in array coalesce(p_solicitacoes, '{}') loop
    begin
      perform aprovar_solicitacao(v_id, true, p_observacao);
      solicitacao_id := v_id; ok := true; erro := null;
    exception when others then
      solicitacao_id := v_id; ok := false; erro := sqlerrm;
    end;
    return next;
  end loop;
end $fn$;

revoke all on function aprovar_varias(uuid[], text) from public;
grant execute on function aprovar_varias(uuid[], text) to authenticated;

-- ---------- ZERAR AS DECISÕES A CADA RODADA ---------------------------

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

  if s.status in ('RECEBIDA', 'EM_PREENCHIMENTO', 'REPROVADA') then
    null;
  elsif s.status in ('APROVADA', 'CONCLUIDA') then
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

  -- Rodada nova, decisões individuais zeradas: o martelo dado sobre o aéreo
  -- não vale como martelo sobre o carro.
  update colaboradores
     set aprovacao = null, aprovacao_em = null, aprovacao_obs = null
   where solicitacao_id = p_solicitacao;

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

-- ---------- 3. O SUPER ADMIN ENXERGA A ÁREA DO DIRETOR ----------------
--
-- Todas as visões passam a aceitar `is_super()`. Sem isto o super admin
-- entrava na área e via uma tela vazia, que é pior do que ser barrado: parece
-- defeito.

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
  d.nome as diretor_nome,
  e.destino, e.hotel, e.avulsa, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax,
  (select count(*) from solicitacao_edicoes se where se.solicitacao_id = s.id) as qtd_operacoes
from solicitacoes s
join edicoes e on e.id = s.edicao_id
left join diretores d on d.id = s.diretor_id
where (s.diretor_id = diretor_atual() or is_super()) and s.excluida_em is null;

grant select on v_aprovacao_solicitacoes to authenticated;

drop view if exists v_aprovacao_colaboradores;
create view v_aprovacao_colaboradores with (security_invoker = false) as
select c.id, c.solicitacao_id, c.nome_completo, c.ordem,
       c.aprovacao, c.aprovacao_em, c.aprovacao_obs
from colaboradores c
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_colaboradores to authenticated;

drop view if exists v_aprovacao_voos;
create view v_aprovacao_voos with (security_invoker = false) as
select v.colaborador_id, v.trecho, v.companhia, v.numero_voo,
       v.aeroporto_origem, v.aeroporto_destino,
       v.partida_data, v.partida_hora, v.chegada_data, v.chegada_hora,
       v.localizador, v.bagagem_despachada, v.preco, v.observacoes,
       c.solicitacao_id
from voos v
join colaboradores c on c.id = v.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_voos to authenticated;

drop view if exists v_aprovacao_rodoviario;
create view v_aprovacao_rodoviario with (security_invoker = false) as
select t.colaborador_id, t.empresa, t.numero_onibus,
       t.apresentacao_data, t.apresentacao_hora,
       t.ida_data, t.ida_hora, t.local_embarque_ida,
       t.volta_data, t.volta_hora, t.local_embarque_volta,
       t.preco, t.observacoes, c.solicitacao_id
from transporte_rodoviario t
join colaboradores c on c.id = t.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_rodoviario to authenticated;

drop view if exists v_aprovacao_hospedagem;
create view v_aprovacao_hospedagem with (security_invoker = false) as
select h.colaborador_id, h.hotel, h.hotel_hospedagem, h.endereco,
       h.tipo_quarto, h.alimentacao, h.dividindo_com,
       h.check_in, h.check_out, h.valor_total, h.codigo_reserva, h.observacoes,
       c.solicitacao_id
from hospedagem_detalhe h
join colaboradores c on c.id = h.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_hospedagem to authenticated;

drop view if exists v_aprovacao_carro;
create view v_aprovacao_carro with (security_invoker = false) as
select l.solicitacao_id, l.locadora, l.categoria,
       l.retirada_local, l.retirada_data, l.retirada_hora,
       l.devolucao_local, l.devolucao_data, l.devolucao_hora,
       l.condutor_colaborador_id, l.preco, l.observacoes
from locacao_carro l
join solicitacoes s on s.id = l.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_carro to authenticated;

drop view if exists v_aprovacao_decisoes;
create view v_aprovacao_decisoes with (security_invoker = false) as
select a.id, a.solicitacao_id, a.aprovado, a.decidido_em, a.observacao, a.escopo,
       a.registrado_por, a.created_at
from aprovacoes a
join solicitacoes s on s.id = a.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_decisoes to authenticated;

-- ---------- O PERFIL PRECISA DIZER SE É SUPER -------------------------
--
-- A tela do diretor barrava por papel, e o super admin tem papel ADMIN. Sem
-- este campo não há como a tela saber que aquele ADMIN em particular pode
-- entrar.

drop function if exists meu_perfil();
create function meu_perfil()
returns table (papel text, id uuid, nome text, super_admin boolean)
language sql security definer stable set search_path = public as $fn$
  select 'ADMIN'::text, u.id, u.nome, u.super_admin
    from admin_users u where u.id = auth.uid() and u.ativo
  union all
  select 'DIRETOR'::text, d.id, d.nome, false
    from diretores d where d.user_id = auth.uid() and d.ativo
  limit 1;
$fn$;

grant execute on function meu_perfil() to authenticated;
