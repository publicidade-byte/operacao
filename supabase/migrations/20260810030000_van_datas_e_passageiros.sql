-- Fretamento: data e hora separadas, e passageiros deixa de ser obrigatório.
--
-- 1. `van_horario_saida` era texto livre e virava "15/10/2026 - 12H". Data e
--    hora em campos próprios chegam prontas no painel, sem alguém ter que
--    reinterpretar o que foi escrito.
--
-- 2. A quantidade de passageiros travava em 1..60 e era exigida. Num ônibus
--    fretado esse número pode passar de 60, e muitas vezes ainda não se sabe
--    quando o pedido é feito — a lista vem depois. Deixa de ser obrigatória.
--
-- As colunas antigas ficam pelo histórico; nada novo escreve nelas.

alter table solicitacoes add column if not exists van_data_saida    date;
alter table solicitacoes add column if not exists van_hora_saida    time;
alter table solicitacoes add column if not exists van_retorno_data  date;
alter table solicitacoes add column if not exists van_retorno_hora  time;

comment on column solicitacoes.van_data_saida is
  'Data da ida do fretamento. Substitui o texto livre em van_horario_saida.';
comment on column solicitacoes.van_horario_saida is
  'OBSOLETO: texto livre, mantido pelo historico. Use van_data_saida + van_hora_saida.';

-- A trava antiga exigia horário em texto e passageiros > 0. Agora o que a
-- van precisa é local, destino e a data da saída.
alter table solicitacoes drop constraint if exists van_exige_dados;
alter table solicitacoes add constraint van_exige_dados check (
  not ('VAN' = any (servicos))
  or (
    coalesce(btrim(van_local_saida), '') <> ''
    and coalesce(btrim(van_destino), '') <> ''
    -- `van_horario_saida` cobre as solicitações antigas, anteriores aos
    -- campos de data e hora.
    and (van_data_saida is not null or coalesce(btrim(van_horario_saida), '') <> '')
  )
) not valid;

-- Passageiros, se informado, continua tendo que ser positivo — mas sem teto.
alter table solicitacoes drop constraint if exists van_qtd_passageiros_positiva;
alter table solicitacoes add constraint van_qtd_passageiros_positiva check (
  van_qtd_passageiros is null or van_qtd_passageiros > 0
);
