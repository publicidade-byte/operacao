-- Controle de rooming: a equipe marca quem já entrou no hotel.
--
-- Não é etapa de aprovação nem muda status. É o quadro de controle da
-- operação — o equivalente ao risquinho na planilha, só que compartilhado e
-- com carimbo de quem marcou.
--
-- Mora em `solicitacoes` e não numa tabela à parte porque é uma marca por
-- solicitação, lida na listagem inteira de uma vez. Uma tabela separada
-- viraria um join em toda abertura de tela para guardar um booleano.
--
-- Guardar quem e quando não é burocracia: quando alguém não aparece no
-- rooming do hotel, a primeira pergunta é "mas não tinha sido inserido?" —
-- e sem carimbo ninguém responde.

alter table solicitacoes
  add column if not exists rooming_ok  boolean not null default false,
  add column if not exists rooming_em  timestamptz,
  add column if not exists rooming_por uuid references admin_users(id);

comment on column solicitacoes.rooming_ok is
  'Controle interno da operacao: as pessoas ja foram inseridas no rooming do hotel.';

-- O carimbo sai do relógio do banco e do usuário logado, não do formulário:
-- marcar é um clique, e quem marcou não deveria poder digitar outro nome.
create or replace function carimbar_rooming() returns trigger
language plpgsql as $fn$
begin
  if new.rooming_ok is distinct from old.rooming_ok then
    if new.rooming_ok then
      new.rooming_em  = now();
      new.rooming_por = auth.uid();
    else
      -- Desmarcou: o carimbo sai junto, senão sobra um "inserido por" numa
      -- solicitação que não está inserida.
      new.rooming_em  = null;
      new.rooming_por = null;
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists solicitacoes_carimbo_rooming on solicitacoes;
create trigger solicitacoes_carimbo_rooming before update on solicitacoes
  for each row execute function carimbar_rooming();
