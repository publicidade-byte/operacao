-- Quatro mudanças que se cruzam:
--
--   1. Hospedagem no hotel do pax e fora dele deixam de ser exclusivas.
--   2. Solicitação só de hotel do pax nasce aprovada — não tem custo.
--   3. Locação de carro passa a ser por condutor, com código de reserva.
--   4. Hospedagem por pessoa passa a caber duas vezes (uma de cada tipo).
--
-- ---------- POR QUE VIRARAM DOIS SERVIÇOS, E NÃO UM CAMPO COM DUAS OPÇÕES
--
-- `tipo_hospedagem` era uma escolha única, e o pedido é poder marcar as duas:
-- quem chega na véspera dorme na cidade antes e no hotel da operação depois.
-- Daria para trocar o campo por um array, mas aí toda tela que hoje mostra
-- "o que foi pedido" precisaria de um caso especial só para hospedagem.
--
-- Como `servicos` já é a lista do que se pediu — e já é o que vira etiqueta,
-- filtro, escopo de aprovação e linha de custo —, o caminho mais curto e o
-- mais consistente é o mesmo: HOSPEDAGEM (hotel do pax) e HOSPEDAGEM_FORA
-- passam a ser dois itens dessa lista. Marcar os dois é marcar dois serviços,
-- e tudo que já sabe lidar com serviço passa a saber lidar com isto de graça.
--
-- `tipo_hospedagem` continua na tabela, preenchido, para não quebrar leitura
-- antiga — mas quem manda é `servicos`, como já acontece com `modal`.

-- ---------- 1. O SERVIÇO NOVO -----------------------------------------

-- Solicitações que pediram hospedagem FORA passam a ter o serviço próprio.
-- As de hotel do pax continuam como HOSPEDAGEM, que agora quer dizer
-- exatamente "hotel dos passageiros".
update solicitacoes
   set servicos = array_replace(servicos, 'HOSPEDAGEM', 'HOSPEDAGEM_FORA')
 where tipo_hospedagem = 'FORA_HOTEL_PAX'
   and 'HOSPEDAGEM' = any(servicos)
   and not ('HOSPEDAGEM_FORA' = any(servicos));

-- ---------- 2. DUAS HOSPEDAGENS POR PESSOA ----------------------------
--
-- Uma linha por pessoa não cabe mais: quem pede as duas tem duas estadias,
-- com hotéis, datas e reservas diferentes.

alter table hospedagem_detalhe
  add column if not exists tipo text not null default 'HOTEL_PAX';

alter table hospedagem_detalhe drop constraint if exists hospedagem_detalhe_tipo_check;
alter table hospedagem_detalhe add constraint hospedagem_detalhe_tipo_check
  check (tipo in ('HOTEL_PAX', 'FORA_HOTEL_PAX'));

comment on column hospedagem_detalhe.tipo is
  'A qual das duas hospedagens esta linha responde. Uma pessoa pode ter as duas.';

-- O que já existe recebe o tipo que a solicitação pedia.
-- `tipo_hospedagem` é enum e `tipo` é texto: sem o cast o Postgres não sabe
-- comparar os dois.
update hospedagem_detalhe h
   set tipo = s.tipo_hospedagem::text
  from colaboradores c, solicitacoes s
 where c.id = h.colaborador_id and s.id = c.solicitacao_id
   and s.tipo_hospedagem::text in ('HOTEL_PAX', 'FORA_HOTEL_PAX')
   and h.tipo <> s.tipo_hospedagem::text;

alter table hospedagem_detalhe drop constraint if exists hospedagem_detalhe_colaborador_id_key;
create unique index if not exists hospedagem_detalhe_colab_tipo_idx
  on hospedagem_detalhe (colaborador_id, tipo);

-- ---------- 3. CARRO POR CONDUTOR -------------------------------------
--
-- `solicitacao_carros` já guarda uma linha por condutor pedido. O que faltava
-- era o lado operacional acompanhar: havia UMA locação por solicitação, então
-- quatro condutores dividiam uma locadora, uma diária e um preço só.

alter table locacao_carro
  add column if not exists pedido_id uuid references solicitacao_carros(id) on delete cascade,
  add column if not exists codigo_reserva text;

comment on column locacao_carro.pedido_id is
  'A qual condutor pedido esta locacao responde. Nulo so em registro antigo sem pedido.';

-- Solicitações antigas pediam carro pelos campos carro_* da própria
-- solicitação, antes de `solicitacao_carros` existir. Sem uma linha de pedido
-- elas não teriam onde pendurar a locação — a tela ficaria vazia justamente
-- nas que o usuário precisa corrigir agora.
insert into solicitacao_carros
  (solicitacao_id, condutor_nome, condutor_cpf, condutor_nascimento, transmissao, tipo_carro, ordem)
select s.id,
       coalesce(nullif(btrim(s.carro_condutor_nome), ''), 'Condutor a definir'),
       coalesce(nullif(btrim(s.carro_condutor_cpf), ''), ''),
       s.carro_condutor_nascimento,
       s.carro_transmissao,
       null,
       1
  from solicitacoes s
 where 'CARRO' = any(s.servicos)
   and s.excluida_em is null
   and not exists (select 1 from solicitacao_carros sc where sc.solicitacao_id = s.id);

-- A locação que já existe passa a responder pelo primeiro condutor pedido.
update locacao_carro l
   set pedido_id = sc.id
  from (
    select distinct on (solicitacao_id) id, solicitacao_id
      from solicitacao_carros order by solicitacao_id, ordem, created_at
  ) sc
 where sc.solicitacao_id = l.solicitacao_id
   and l.pedido_id is null;

alter table locacao_carro drop constraint if exists locacao_carro_solicitacao_id_key;
create unique index if not exists locacao_carro_pedido_idx
  on locacao_carro (pedido_id) where pedido_id is not null;

-- O custo não precisa mudar: `recalcular_custo` já somava TODAS as linhas de
-- `locacao_carro` da solicitação. O que era uma só agora são várias, e a soma
-- passa a valer sem uma linha de código nova.

-- ---------- 4. HOSPEDAGEM NO HOTEL DO PAX NASCE APROVADA --------------
--
-- Reservar no hotel que a operação já contratou não gera custo novo: é
-- alocação de quarto, não compra. Mandar isso para o diretor decidir é pedir
-- assinatura em nota de zero real — e a demora dele atrasa a alocação.
--
-- A regra é estreita de propósito: SÓ hospedagem, SÓ no hotel do pax. Junto
-- com qualquer outro serviço, volta a ser aprovação normal, porque aí existe
-- custo em algum lugar.

create or replace function aprovar_hospedagem_sem_custo() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.servicos = array['HOSPEDAGEM']::text[] then
    new.status := 'APROVADA'::status_solicitacao;
    new.servicos_aprovados := new.servicos;
  end if;
  return new;
end $fn$;

drop trigger if exists solicitacoes_aprova_hospedagem on solicitacoes;
create trigger solicitacoes_aprova_hospedagem before insert on solicitacoes
  for each row execute function aprovar_hospedagem_sem_custo();

-- O evento explicando o porquê entra depois da linha existir.
create or replace function registrar_aprovacao_automatica() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'APROVADA' and new.servicos = array['HOSPEDAGEM']::text[] then
    insert into eventos_solicitacao (solicitacao_id, tipo, autor_nome, descricao, payload)
    values (new.id, 'APROVADA', 'Sistema',
            'Aprovada automaticamente: hospedagem no hotel dos passageiros não gera custo, '
            || 'então não passa por diretor.',
            jsonb_build_object('automatica', true, 'escopo', new.servicos));
  end if;
  return new;
end $fn$;

drop trigger if exists solicitacoes_evento_aprovacao_auto on solicitacoes;
create trigger solicitacoes_evento_aprovacao_auto after insert on solicitacoes
  for each row execute function registrar_aprovacao_automatica();

-- ---------- 5. O DIRETOR E A CONSULTA PRECISAM DO TIPO ----------------

drop view if exists v_aprovacao_hospedagem;
create view v_aprovacao_hospedagem with (security_invoker = false) as
select h.colaborador_id, h.tipo, h.hotel, h.hotel_hospedagem, h.endereco,
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
select l.solicitacao_id, l.pedido_id, l.locadora, l.categoria, l.codigo_reserva,
       l.retirada_local, l.retirada_data, l.retirada_hora,
       l.devolucao_local, l.devolucao_data, l.devolucao_hora,
       l.condutor_colaborador_id, l.preco, l.observacoes,
       sc.condutor_nome
from locacao_carro l
join solicitacoes s on s.id = l.solicitacao_id
left join solicitacao_carros sc on sc.id = l.pedido_id
where s.diretor_id = diretor_atual() or is_super();

grant select on v_aprovacao_carro to authenticated;
