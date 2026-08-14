-- Endereço do hotel preenchido sozinho no painel.
--
-- O nome do hotel já vem de `edicoes.hotel`; o endereço era o único campo do
-- bloco de hospedagem que alguém redigitava a cada solicitação — sempre o
-- mesmo endereço, porque os mesmos resorts se repetem o ano inteiro (só o
-- ITAPURA aparece em 24 operações).
--
-- POR QUE UM CATÁLOGO E NÃO A API DO GOOGLE: consultar o Google Places a cada
-- abertura de tela custa chave, faturamento e uma dependência de rede no meio
-- do trabalho da operação — para buscar um dado que praticamente nunca muda.
-- Endereço de resort não é informação volátil. Guardar uma vez e reusar é
-- mais rápido, funciona offline e não quebra quando a cota acaba.
--
-- O catálogo é por NOME de hotel, não por edição, de propósito: assim ele
-- serve também para o hotel que a operação reservou por fora (`hotel_hospedagem`),
-- que não tem edição nenhuma por trás.

create table hoteis (
  chave         text primary key,
  nome          text not null,
  endereco      text not null,
  -- PESQUISA: veio de busca na internet e ainda não passou pelo olho de
  -- ninguém. OPERACAO: alguém da equipe digitou ou corrigiu, e portanto vale
  -- mais. A tela avisa quando o endereço ainda é de pesquisa.
  origem        text not null default 'PESQUISA' check (origem in ('PESQUISA', 'OPERACAO')),
  atualizado_em timestamptz not null default now()
);

comment on table hoteis is
  'Endereco por nome de hotel. Preenche o painel sozinho e aprende com o que a operacao corrige.';

-- O nome chega digitado por gente: caixa alta, caixa baixa, espaço duplo.
-- A chave precisa ser a mesma nos três casos.
create or replace function chave_hotel(nome text) returns text
language sql immutable strict as $$
  select upper(btrim(regexp_replace(nome, '\s+', ' ', 'g')));
$$;

create or replace function preencher_chave_hotel() returns trigger
language plpgsql as $$
begin
  new.chave = chave_hotel(new.nome);
  new.atualizado_em = now();
  return new;
end $$;

create trigger hoteis_chave before insert or update on hoteis
  for each row execute function preencher_chave_hotel();

-- Os hotéis que já aparecem nas operações de 2026, com endereço pesquisado.
--
-- Ficaram DE FORA, de propósito:
--   FLORIPA — é o nome do destino, não de um hotel; não há o que endereçar.
--   'Colab, Universidade Forma, Porto Seguro e outros' — o guarda-chuva das
--   operações avulsas, que também não é um lugar.
--
-- O ITAPURA é o que merece conferência: o nome bate com o Itapura Eco Resort
-- de Atibaia, que combina com o destino CAMP SP, mas foi dedução minha e não
-- confirmação de vocês. É o hotel mais usado da lista — vale um olhar antes
-- de sair em voucher.
insert into hoteis (chave, nome, endereco) values
  ('', 'ITAPURA',              'R. Gennaro Ricco, 755 — Jardim Bogotá, Atibaia/SP, 12954-902'),
  ('', 'MED LAKE PARADISE',    'Rod. Eng. Cândido do Rego Chaves, Jundiapeba, Mogi das Cruzes/SP'),
  ('', 'NOVOTEL ITU',          'Al. São Paulo Golf, s/n — Terras de São José I, Itu/SP, 13306-440'),
  ('', 'LE CANTON',            'Rua Antônio Silva, 300 — Vargem Grande, Teresópolis/RJ, 25990-150'),
  ('', 'VILA GALÉ ANGRA',      'Estr. Vereador Benedito Adelino, 8413 — Fazenda Tanguá, Angra dos Reis/RJ, 23909-901'),
  ('', 'TAUÁ CAETÉ',           'BR-381, km 12.000 — Roças Novas, Caeté/MG'),
  ('', 'SUÍTES BEACH PARK',    'Rua Porto das Dunas, 2734 — Porto das Dunas, Aquiraz/CE, 61700-000'),
  ('', 'MALAI MANSO RESORT',   'Rod. MT-351, km 67 — Lago do Manso, Chapada dos Guimarães/MT, 78195-000'),
  ('', 'TAUÁ ALEXÂNIA',        'Rod. BR-060, km 23, s/n — Alexânia/GO, 72930-000'),
  ('', 'FAZZENDA PARK RESORT', 'Rua João Mathias Zimmermann, 2299 — Gaspar/SC, 89112-900'),
  ('', 'CALDAS DA IMPERATRIZ', 'Rod. Princesa Leopoldina, 3355 — Caldas, Santo Amaro da Imperatriz/SC, 88140-000'),
  ('', 'MED RIO DAS PEDRAS',   'Rod. BR-101 (Rio–Santos), km 445,5 — Praia Grande, Mangaratiba/RJ, 23860-000'),
  ('', 'PRATAGY BEACH RESORT', 'AL-101 Norte, km 10, 10202 — Pescaria, Maceió/AL, 57039-600'),
  ('', 'VILA VELUTTI',         'BR-060, km 24, s/n — Fazenda Vale do Sol, Brasília/DF, 72457-996');

-- ---------- O CATÁLOGO APRENDE ---------------------------------------
--
-- Quando alguém da operação salva uma hospedagem com hotel e endereço, o par
-- entra no catálogo. É assim que hotel novo passa a se preencher sozinho da
-- segunda vez em diante, sem ninguém ter que vir cadastrar nada aqui.
--
-- O que a operação escreve sempre vence o que veio de pesquisa. Entre dois
-- endereços digitados por gente, vence o mais recente — quem está com a
-- reserva na mão sabe mais do que o registro de meses atrás.
create or replace function aprender_endereco_hotel() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nome_hotel text := coalesce(nullif(btrim(new.hotel_hospedagem), ''), nullif(btrim(new.hotel), ''));
begin
  if nome_hotel is null or nullif(btrim(new.endereco), '') is null then
    return new;
  end if;

  insert into hoteis (chave, nome, endereco, origem)
  values (chave_hotel(nome_hotel), nome_hotel, btrim(new.endereco), 'OPERACAO')
  on conflict (chave) do update
    set endereco = excluded.endereco,
        nome = excluded.nome,
        origem = 'OPERACAO',
        atualizado_em = now();

  return new;
end $$;

create trigger hospedagem_ensina_endereco after insert or update on hospedagem_detalhe
  for each row execute function aprender_endereco_hotel();

-- Retroalimenta com o que a operação já preencheu à mão: esses endereços
-- foram conferidos por alguém e valem mais que os pesquisados.
insert into hoteis (chave, nome, endereco, origem)
select distinct on (chave_hotel(coalesce(nullif(btrim(h.hotel_hospedagem), ''), h.hotel)))
       chave_hotel(coalesce(nullif(btrim(h.hotel_hospedagem), ''), h.hotel)),
       coalesce(nullif(btrim(h.hotel_hospedagem), ''), h.hotel),
       btrim(h.endereco),
       'OPERACAO'
  from hospedagem_detalhe h
 where nullif(btrim(h.endereco), '') is not null
   and coalesce(nullif(btrim(h.hotel_hospedagem), ''), nullif(btrim(h.hotel), '')) is not null
 order by 1, h.updated_at desc nulls last
on conflict (chave) do update
  set endereco = excluded.endereco, origem = 'OPERACAO', atualizado_em = now();

-- ---------- ACESSO ----------------------------------------------------
--
-- A equipe lê para o preenchimento automático. Editar direto na tabela fica
-- com gestor — o caminho normal de correção é digitar no painel, que a
-- trigger acima registra sozinha.
alter table hoteis enable row level security;

create policy hoteis_leitura on hoteis
  for select to authenticated using (is_admin());
create policy hoteis_gestor on hoteis
  for all to authenticated using (is_gestor()) with check (is_gestor());
