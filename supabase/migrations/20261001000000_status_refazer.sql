-- =====================================================================
-- STATUS "REFAZER" E DECISÃO REGISTRADA POR NOME
--
-- Reprovar era a única saída quando algo estava errado — e reprovar soa
-- como "não vai acontecer", quando quase sempre o caso é outro: a tarifa
-- caiu, o horário não serve, refaça e mande de novo. Sem um nome para
-- isso, a solicitação parava e ninguém sabia que era para refazer. Foi o
-- que aconteceu com o aéreo da DJ Bruu, reprovado por prazo de emissão
-- vencido e esquecido por uma semana.
--
-- `aprovacoes.aprovado` continua existindo (boolean) para não quebrar o
-- que já lê essa coluna; quem diz o que foi decidido agora é `decisao`.
-- =====================================================================

-- ---------- 1. O STATUS -----------------------------------------------
alter type status_solicitacao add value if not exists 'REFAZER' after 'REPROVADA';

-- ---------- 2. A DECISÃO, POR NOME ------------------------------------
alter table aprovacoes
  add column if not exists decisao text
    check (decisao in ('APROVADA', 'REPROVADA', 'REFAZER'));

update aprovacoes
   set decisao = case when aprovado then 'APROVADA' else 'REPROVADA' end
 where decisao is null;

comment on column aprovacoes.decisao is
  'O que o diretor decidiu: APROVADA, REPROVADA ou REFAZER (corrigir e reenviar).';
