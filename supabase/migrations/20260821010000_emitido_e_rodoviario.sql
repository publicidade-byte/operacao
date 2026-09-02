-- Dois controles da operação, no mesmo espírito do rooming: não mudam status,
-- não avisam ninguém, não passam por aprovação. São o risquinho da planilha,
-- compartilhado e com carimbo de quem marcou.
--
--   aereo_emitido      — a passagem foi emitida (o bilhete existe)
--   rodoviario_ok      — a passagem de ônibus da operação foi comprada
--
-- Ficam em `solicitacoes` pelo mesmo motivo do rooming: é uma marca por
-- solicitação, lida na listagem inteira de uma vez, e uma tabela à parte
-- viraria um join em toda abertura de tela para guardar um booleano.

alter table solicitacoes
  add column if not exists aereo_emitido      boolean not null default false,
  add column if not exists aereo_emitido_em   timestamptz,
  add column if not exists aereo_emitido_por  uuid references admin_users(id),
  add column if not exists rodoviario_ok      boolean not null default false,
  add column if not exists rodoviario_em      timestamptz,
  add column if not exists rodoviario_por     uuid references admin_users(id);

comment on column solicitacoes.aereo_emitido is
  'Controle da operacao: a passagem aerea ja foi emitida.';
comment on column solicitacoes.rodoviario_ok is
  'Controle da operacao: a passagem do onibus da operacao ja foi comprada.';

-- Um carimbo só para os três controles. O de rooming já existia sozinho;
-- juntar evita três funções quase idênticas divergindo com o tempo.
create or replace function carimbar_controles() returns trigger
language plpgsql as $fn$
begin
  if new.rooming_ok is distinct from old.rooming_ok then
    new.rooming_em  := case when new.rooming_ok then now() else null end;
    new.rooming_por := case when new.rooming_ok then auth.uid() else null end;
  end if;

  if new.aereo_emitido is distinct from old.aereo_emitido then
    new.aereo_emitido_em  := case when new.aereo_emitido then now() else null end;
    new.aereo_emitido_por := case when new.aereo_emitido then auth.uid() else null end;
  end if;

  if new.rodoviario_ok is distinct from old.rodoviario_ok then
    new.rodoviario_em  := case when new.rodoviario_ok then now() else null end;
    new.rodoviario_por := case when new.rodoviario_ok then auth.uid() else null end;
  end if;

  return new;
end $fn$;

drop trigger if exists solicitacoes_carimbo_rooming on solicitacoes;
drop trigger if exists solicitacoes_carimbo_controles on solicitacoes;
create trigger solicitacoes_carimbo_controles before update on solicitacoes
  for each row execute function carimbar_controles();

drop function if exists carimbar_rooming();
