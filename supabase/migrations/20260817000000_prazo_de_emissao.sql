-- Prazo de emissão, e a operação inteira podendo corrigir o que já foi
-- aprovado.
--
-- O problema real: passagem aérea tem prazo de emissão. O diretor demora para
-- aprovar, a reserva cai, e a operação precisa refazer com tarifa nova. Só que
-- depois de aprovada a solicitação travava para todo mundo menos o super
-- admin — ou seja, o time que faz a emissão não conseguia mexer justamente no
-- caso em que mexer é obrigatório.
--
-- Duas coisas mudam:
--
--   1. Cada voo passa a carregar até quando dá para emitir, e esse prazo vai
--      junto para o diretor. Ele é a pessoa cuja demora derruba a reserva;
--      não saber disso é o que torna a demora possível.
--
--   2. Qualquer pessoa da operação edita e reenvia, aprovada ou concluída.
--      Isso afrouxa uma trava que existia por um bom motivo, então vem com
--      um contrapeso: o banco passa a MARCAR quando alguém altera dados de
--      uma solicitação já aprovada, e a marca só sai quando ela volta para o
--      diretor. Sem isso, editar depois de aprovado faria a alteração valer
--      com o carimbo dado para a versão anterior — que é exatamente o buraco
--      que a trava fechava.

-- ---------- 1. PRAZO DE EMISSÃO ---------------------------------------

alter table voos
  add column if not exists emissao_prazo_data date,
  add column if not exists emissao_prazo_hora time;

comment on column voos.emissao_prazo_data is
  'Ate quando a reserva pode ser emitida. Passou disso, a tarifa cai.';

-- Data e hora separadas, como no resto do sistema: guardar as duas juntas em
-- timestamptz já trocou horário digitado por horário convertido uma vez, e
-- não vai trocar de novo.

-- ---------- 2. MARCA DE ALTERAÇÃO PÓS-APROVAÇÃO -----------------------

alter table solicitacoes
  add column if not exists alterada_apos_aprovacao boolean not null default false;

comment on column solicitacoes.alterada_apos_aprovacao is
  'Alguem mexeu nos dados depois do diretor decidir. Sai quando volta para aprovacao.';

/**
 * Marca a solicitação quando seus dados operacionais mudam depois de
 * aprovada.
 *
 * Fica no banco, e não na tela, porque a tela salva por várias rotas (voo,
 * hospedagem, carro, van) e bastaria esquecer uma para a marca não aparecer.
 * Aqui não tem como escapar: mexeu na tabela, marcou.
 */
create or replace function marcar_alteracao_pos_aprovacao() returns trigger
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
    return new;
  end if;

  update solicitacoes
     set alterada_apos_aprovacao = true
   where id = v_sol
     and status in ('APROVADA', 'CONCLUIDA')
     and not alterada_apos_aprovacao;

  return new;
end $fn$;

drop trigger if exists voos_alteracao_pos_aprovacao on voos;
create trigger voos_alteracao_pos_aprovacao after insert or update on voos
  for each row execute function marcar_alteracao_pos_aprovacao();

drop trigger if exists rodo_alteracao_pos_aprovacao on transporte_rodoviario;
create trigger rodo_alteracao_pos_aprovacao after insert or update on transporte_rodoviario
  for each row execute function marcar_alteracao_pos_aprovacao();

drop trigger if exists hosp_alteracao_pos_aprovacao on hospedagem_detalhe;
create trigger hosp_alteracao_pos_aprovacao after insert or update on hospedagem_detalhe
  for each row execute function marcar_alteracao_pos_aprovacao();

drop trigger if exists carro_alteracao_pos_aprovacao on locacao_carro;
create trigger carro_alteracao_pos_aprovacao after insert or update on locacao_carro
  for each row execute function marcar_alteracao_pos_aprovacao();

drop trigger if exists van_alteracao_pos_aprovacao on locacao_van;
create trigger van_alteracao_pos_aprovacao after insert or update on locacao_van
  for each row execute function marcar_alteracao_pos_aprovacao();

-- ---------- 3. A OPERAÇÃO INTEIRA REENVIA -----------------------------

/**
 * Igual à versão anterior, com duas mudanças:
 *
 *   - reabrir rodada a partir de APROVADA/CONCLUIDA deixa de ser exclusivo
 *     do super admin. Quem emite passagem precisa refazer a reserva que caiu,
 *     e esperar por uma única pessoa era o gargalo.
 *   - a marca de alteração pós-aprovação sai aqui: os dados voltaram para o
 *     diretor, então não há mais alteração pendente de martelo.
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

  if s.status = 'AGUARDANDO_APROVACAO' then
    raise exception
      'Já existe uma aprovação em curso (%) — aguarde a decisão ou reabra para edição.',
      array_to_string(coalesce(s.escopo_aprovacao, s.servicos), ', ');
  elsif s.status = 'CANCELADA' then
    raise exception 'Solicitação cancelada não vai para aprovação.';
  end if;

  update solicitacoes
     set status = 'AGUARDANDO_APROVACAO'::status_solicitacao,
         escopo_aprovacao = v_escopo,
         alterada_apos_aprovacao = false,
         servicos_aprovados = coalesce(
           (select array_agg(a) from unnest(servicos_aprovados) a
             where not (a = any(v_escopo))),
           '{}'
         )
   where id = p_solicitacao;

  update colaboradores
     set aprovacao = null, aprovacao_em = null, aprovacao_obs = null
   where solicitacao_id = p_solicitacao;

  select nome into v_nome from admin_users where id = auth.uid();
  v_total := v_escopo @> s.servicos;

  insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
  values (
    p_solicitacao, 'ENVIADA_APROVACAO', v_nome,
    case
      when s.status in ('APROVADA', 'CONCLUIDA') and v_total
        then 'Reenviada para aprovação depois de alterada (solicitação completa)'
      when s.status in ('APROVADA', 'CONCLUIDA')
        then 'Reenviada para aprovação depois de alterada: ' || array_to_string(v_escopo, ', ')
      when v_total
        then 'Enviada para aprovação (solicitação completa)'
      else 'Enviada para aprovação parcial: ' || array_to_string(v_escopo, ', ')
    end,
    jsonb_build_object('escopo', v_escopo, 'parcial', not v_total,
                       'reenvio', s.status in ('APROVADA', 'CONCLUIDA'))
  );

  return array_to_string(v_escopo, ', ');
end $fn$;

revoke all on function enviar_para_aprovacao(uuid, text[]) from public;
grant execute on function enviar_para_aprovacao(uuid, text[]) to authenticated;

-- ---------- 4. O DIRETOR PRECISA VER O PRAZO --------------------------

drop view if exists v_aprovacao_voos;
create view v_aprovacao_voos with (security_invoker = false) as
select v.colaborador_id, v.trecho, v.companhia, v.numero_voo,
       v.aeroporto_origem, v.aeroporto_destino,
       v.partida_data, v.partida_hora, v.chegada_data, v.chegada_hora,
       v.emissao_prazo_data, v.emissao_prazo_hora,
       v.localizador, v.bagagem_despachada, v.preco, v.observacoes,
       c.solicitacao_id
from voos v
join colaboradores c on c.id = v.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_voos to authenticated;
