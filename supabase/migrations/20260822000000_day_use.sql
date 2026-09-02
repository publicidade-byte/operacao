-- Day use: gente que passa o dia no destino e não dorme lá.
--
-- Entra como serviço próprio em `servicos`, pelo mesmo motivo que a hospedagem
-- fora entrou: `servicos` já é o que vira etiqueta, filtro, escopo de aprovação
-- e linha de custo. Serviço novo nasce funcionando nessas quatro coisas sem
-- código novo em nenhuma delas.
--
-- A DATA é do pedido, não da pessoa: day use é um dia só, escolhido junto com o
-- destino, e todo mundo da solicitação vai no mesmo dia. Já o VALOR é por
-- pessoa, porque hotel cobra day use por cabeça — e é assim que o custo fecha
-- com o que a operação vai pagar.

alter table solicitacoes
  add column if not exists day_use_data date;

comment on column solicitacoes.day_use_data is
  'Dia do day use. Um so: quem faz day use nao dorme no destino.';

-- Se pediu day use, tem que dizer quando. NOT VALID porque as solicitações
-- anteriores não têm o campo e não deveriam ser barradas por uma regra que
-- nasceu depois delas.
alter table solicitacoes drop constraint if exists day_use_exige_data;
alter table solicitacoes add constraint day_use_exige_data
  check (not ('DAY_USE' = any(servicos)) or day_use_data is not null) not valid;

create table if not exists day_use_detalhe (
  id             uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  hotel          text,
  data           date,
  valor          numeric(10,2),
  codigo_reserva text,
  observacoes    text,
  updated_at     timestamptz not null default now(),
  unique (colaborador_id)
);

create trigger day_use_updated before update on day_use_detalhe
  for each row execute function set_updated_at();

comment on table day_use_detalhe is
  'Um day use por pessoa. O dia vem da solicitacao; o valor e por cabeca, que e como o hotel cobra.';

alter table day_use_detalhe enable row level security;

create policy day_use_admin on day_use_detalhe
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- CUSTO -----------------------------------------------------

create or replace function recalcular_custo(p_solicitacao uuid) returns numeric
language sql stable as $fn$
  select coalesce(
    (select sum(v.preco) from voos v
       join colaboradores c on c.id = v.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(t.preco) from transporte_rodoviario t
       join colaboradores c on c.id = t.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(h.valor_total) from hospedagem_detalhe h
       join colaboradores c on c.id = h.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(du.valor) from day_use_detalhe du
       join colaboradores c on c.id = du.colaborador_id
      where c.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(l.preco) from locacao_carro l
      where l.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(sc.preco) from solicitacao_carros sc
      where sc.solicitacao_id = p_solicitacao), 0)
  + coalesce(
    (select sum(vn.preco) from locacao_van vn
      where vn.solicitacao_id = p_solicitacao), 0);
$fn$;

-- O day use entra na mesma trigger de custo dos demais: total é consequência
-- do dado, não de alguém lembrar de recalcular.
drop trigger if exists day_use_custo on day_use_detalhe;
create trigger day_use_custo after insert or update or delete on day_use_detalhe
  for each row execute function atualizar_custo_da_solicitacao();

-- Alterar day use depois de aprovada marca a solicitação, como os outros.
drop trigger if exists day_use_alteracao_pos_aprovacao on day_use_detalhe;
create trigger day_use_alteracao_pos_aprovacao after insert or update on day_use_detalhe
  for each row execute function marcar_alteracao_pos_aprovacao();

-- ---------- O DIRETOR PRECISA VER ------------------------------------

drop view if exists v_aprovacao_day_use;
create view v_aprovacao_day_use with (security_invoker = false) as
select du.colaborador_id, du.hotel, du.data, du.valor, du.codigo_reserva,
       du.observacoes, c.solicitacao_id
from day_use_detalhe du
join colaboradores c on c.id = du.colaborador_id
join solicitacoes s on s.id = c.solicitacao_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_day_use to authenticated;

drop view if exists v_aprovacao_solicitacoes;
create view v_aprovacao_solicitacoes with (security_invoker = false) as
select s.id, s.protocolo, s.status, s.equipe, s.equipe_outro,
  s.data_entrada, s.data_saida, s.tipo_hospedagem, s.servicos, s.centro_custo,
  s.escopo_aprovacao, s.servicos_aprovados, s.day_use_data,
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
