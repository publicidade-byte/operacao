-- =====================================================================
-- Mudança de fluxo: o diretor passa a APROVAR DENTRO DO SISTEMA.
-- O Slack vira apenas notificação de que há pendência.
--
-- Rode esta migration DEPOIS da 20260804000000_init.sql.
-- =====================================================================

-- ---------- Diretor vira usuário autenticável ------------------------

alter table diretores
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

comment on column diretores.user_id is
  'Conta de login do diretor. Nulo enquanto ele não tiver acesso ao sistema.';

/** Id do diretor correspondente ao usuário logado (null se não for diretor). */
create or replace function diretor_atual() returns uuid
language sql security definer stable set search_path = public as $$
  select id from diretores where user_id = auth.uid() and ativo limit 1;
$$;

-- ---------- Views de aprovação ---------------------------------------
-- O diretor precisa avaliar custo e logística, NÃO precisa de CPF nem de
-- data de nascimento. Estas views são security definer (ignoram a RLS das
-- tabelas base) e filtram pelas solicitações do próprio diretor, expondo
-- apenas as colunas necessárias.

create or replace view v_aprovacao_solicitacoes
with (security_invoker = false) as
select
  s.id, s.protocolo, s.status, s.equipe,
  s.data_entrada, s.data_saida, s.tipo_hospedagem,
  s.precisa_transporte, s.modal, s.aeroporto_saida, s.aeroporto_chegada,
  s.obs_transporte, s.precisa_locacao_carro, s.obs_locacao_carro,
  s.solicitante_nome, s.solicitante_email,
  coalesce(s.custo_total_manual, s.custo_total) as custo_total,
  s.observacoes_internas,
  s.created_at, s.updated_at,
  e.destino, e.hotel, e.data_inicio as evento_inicio, e.data_fim as evento_fim,
  (select count(*) from colaboradores c where c.solicitacao_id = s.id) as qtd_pax
from solicitacoes s
join edicoes e on e.id = s.edicao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_colaboradores
with (security_invoker = false) as
select c.id, c.solicitacao_id, c.nome_completo, c.ordem
from colaboradores c
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_voos
with (security_invoker = false) as
select v.colaborador_id, v.trecho, v.companhia, v.numero_voo,
       v.aeroporto_origem, v.aeroporto_destino, v.partida, v.chegada,
       v.localizador, v.bagagem_despachada, v.preco, v.observacoes,
       c.solicitacao_id
from voos v
join colaboradores c on c.id = v.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_rodoviario
with (security_invoker = false) as
select t.colaborador_id, t.empresa, t.horario_ida, t.local_embarque_ida,
       t.horario_volta, t.local_embarque_volta, t.preco, t.observacoes,
       c.solicitacao_id
from transporte_rodoviario t
join colaboradores c on c.id = t.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_hospedagem
with (security_invoker = false) as
select h.colaborador_id, h.hotel, h.tipo_quarto, h.dividindo_com,
       h.check_in, h.check_out, h.valor_diaria, h.codigo_reserva, h.observacoes,
       c.solicitacao_id
from hospedagem_detalhe h
join colaboradores c on c.id = h.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_carro
with (security_invoker = false) as
select l.solicitacao_id, l.locadora, l.categoria, l.retirada_local, l.retirada_em,
       l.devolucao_local, l.devolucao_em, l.condutor_colaborador_id, l.preco,
       l.observacoes
from locacao_carro l
join solicitacoes s on s.id = l.solicitacao_id
where s.diretor_id = diretor_atual();

create or replace view v_aprovacao_decisoes
with (security_invoker = false) as
select a.id, a.solicitacao_id, a.aprovado, a.decidido_em, a.observacao, a.created_at
from aprovacoes a
join solicitacoes s on s.id = a.solicitacao_id
where s.diretor_id = diretor_atual();

grant select on
  v_aprovacao_solicitacoes, v_aprovacao_colaboradores, v_aprovacao_voos,
  v_aprovacao_rodoviario, v_aprovacao_hospedagem, v_aprovacao_carro,
  v_aprovacao_decisoes
to authenticated;

-- ---------- Ação de aprovar / reprovar --------------------------------
-- Função única e controlada: o diretor não recebe UPDATE direto em
-- solicitacoes, então não consegue alterar nenhum outro campo.

create or replace function aprovar_solicitacao(
  p_solicitacao uuid,
  p_aprovado    boolean,
  p_observacao  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_diretor uuid;
  v_status  status_solicitacao;
  v_nome    text;
begin
  v_diretor := diretor_atual();
  if v_diretor is null then
    raise exception 'Apenas diretores aprovadores podem executar esta ação.';
  end if;

  select status into v_status
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
    (solicitacao_id, diretor_id, aprovado, decidido_em, observacao)
  values
    (p_solicitacao, v_diretor, p_aprovado, now(), nullif(btrim(p_observacao), ''));

  update solicitacoes
     set status = case when p_aprovado then 'APROVADA' else 'REPROVADA' end
   where id = p_solicitacao;

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao,
    case when p_aprovado then 'APROVADA' else 'REPROVADA' end,
    v_nome,
    case when p_aprovado
         then format('Aprovada no sistema por %s', v_nome)
         else format('Reprovada no sistema por %s', v_nome) end,
    jsonb_build_object('observacao', p_observacao)
  );
end $$;

grant execute on function aprovar_solicitacao(uuid, boolean, text) to authenticated;
grant execute on function diretor_atual() to authenticated;

-- ---------- Perfil do usuário logado ----------------------------------
-- Uma chamada só resolve "quem é você": operação, diretor ou nenhum.

create or replace function meu_perfil()
returns table (papel text, id uuid, nome text)
language sql security definer stable set search_path = public as $$
  select 'ADMIN'::text, u.id, u.nome
    from admin_users u where u.id = auth.uid() and u.ativo
  union all
  select 'DIRETOR'::text, d.id, d.nome
    from diretores d where d.user_id = auth.uid() and d.ativo
  limit 1;
$$;

grant execute on function meu_perfil() to authenticated;

-- ---------- Ajuste na RLS de diretores --------------------------------
-- A listagem pública do formulário não deve expor user_id nem e-mail.
-- Trocamos a policy aberta por uma view enxuta.

drop policy if exists diretores_leitura_publica on diretores;

create or replace view v_diretores_publicos
with (security_invoker = false) as
select id, nome, ordem from diretores where ativo order by ordem;

grant select on v_diretores_publicos to anon, authenticated;

-- O próprio diretor continua conseguindo ler seu registro completo.
create policy diretores_self on diretores
  for select to authenticated using (user_id = auth.uid() or is_admin());
