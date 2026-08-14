-- Como o bot acha o Slack de quem pediu.
--
-- O caminho natural é `users.lookupByEmail`, mas ele exige o escopo
-- `users:read.email` no app do Slack — que hoje não está concedido, e cuja
-- concessão não depende de quem escreve este sistema. Sem uma alternativa, o
-- aviso de conclusão simplesmente não sai, e quem pediu fica sem resposta.
--
-- Então o e-mail deixa de ser o único caminho: esta tabela é um mapa
-- explícito de e-mail para usuário do Slack. O bot consulta o mapa primeiro
-- e só cai no lookup por e-mail quando não encontra.
--
-- Isso tem uma vantagem que não é só contornar o escopo: o mapa é editável.
-- Quem usa e-mail diferente no Slack e no formulário — o que acontece, porque
-- a Forma tem vários domínios — passa a funcionar do mesmo jeito, coisa que
-- o lookup por e-mail nunca resolveria sozinho.
--
-- Quando o escopo for concedido, nada precisa mudar: o lookup passa a
-- funcionar como reserva e o resultado é gravado aqui, então cada pessoa é
-- procurada no Slack uma vez só e o mapa se completa sozinho.

create table slack_pessoas (
  email          text primary key,
  slack_user_id  text not null,
  nome           text,
  -- De onde veio o id: mapeado à mão ou descoberto pelo lookup. Serve para
  -- saber o que dá para conferir com alguém e o que o sistema achou sozinho.
  origem         text not null default 'MANUAL'
                 check (origem in ('MANUAL', 'LOOKUP')),
  atualizado_em  timestamptz not null default now()
);

comment on table slack_pessoas is
  'E-mail do solicitante -> usuario do Slack. Preenchido a mao e completado pelo lookup.';

-- O e-mail chega do formulário como a pessoa digitou; a chave precisa ser
-- estável. Minúsculas e sem espaço nas pontas, sempre.
create or replace function normalizar_email_slack() returns trigger
language plpgsql as $$
begin
  new.email = lower(btrim(new.email));
  new.atualizado_em = now();
  return new;
end $$;

create trigger slack_pessoas_normaliza before insert or update on slack_pessoas
  for each row execute function normalizar_email_slack();

-- Quem já pediu alguma coisa e tem conta no workspace. Gustavo Brogini
-- (gustavo@formaturismo.com.br) ficou de fora de propósito: não foi
-- encontrado no Slack da Forma, e inventar um id mandaria a confirmação da
-- viagem dele para a pessoa errada.
insert into slack_pessoas (email, slack_user_id, nome) values
  ('ana.ramos@formahomolog.com.br',     'U09EJ1A348H', 'Ana Ramos'),
  ('rafael@colabformaturas.com.br',     'U07LX8Z4F7F', 'Rafael Gomes'),
  ('marcelo.carao@formaconhecer.com.br','U07MHL43T4Y', 'Marcelo Carão')
on conflict (email) do nothing;

-- Leitura para a equipe, escrita só para gestor: um id errado aqui manda a
-- viagem de uma pessoa para a caixa de entrada de outra.
alter table slack_pessoas enable row level security;

create policy slack_pessoas_leitura on slack_pessoas
  for select to authenticated using (is_admin());
create policy slack_pessoas_gestor on slack_pessoas
  for all to authenticated using (is_gestor()) with check (is_gestor());
