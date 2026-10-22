-- =====================================================================
-- O PAINEL PRECISA VER A DATA FECHADA
--
-- A leitura de `edicoes` era "só as ativas", com uma exceção para gestor.
-- Isso existia para o formulário público — e, quando a tela de operações
-- passou a fechar datas, virou um buraco: para quem é OPERACIONAL, a
-- solicitação de uma data fechada perdia destino e hotel, sumia do filtro
-- por destino e a tela de detalhe quebrava ao ler `edicoes.avulsa`.
--
-- Fechar uma data é sobre quem PEDE, não sobre quem OPERA. Então: anônimo
-- continua vendo só as abertas; quem tem login da operação vê todas.
-- =====================================================================

drop policy if exists edicoes_leitura_publica on edicoes;

-- O formulário público roda como anônimo: para ele, nada muda.
create policy edicoes_leitura_publica on edicoes
  for select to anon using (ativa);

-- Quem tem login: a operação vê tudo; diretor aprovador, só as abertas.
create policy edicoes_leitura_painel on edicoes
  for select to authenticated using (ativa or is_admin());
