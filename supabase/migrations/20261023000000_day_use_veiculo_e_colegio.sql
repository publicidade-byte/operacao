-- =====================================================================
-- VEÍCULO DO DAY USE
--
-- Quem faz day use chega de carro, van ou ônibus fretado, e a portaria do
-- hotel pede o veículo para liberar a entrada. Sem o campo, isso vinha na
-- observação quando vinha — e o grupo ficava parado no portão.
--
-- A equipe COLÉGIO não precisa de coluna: ela usa o mesmo `equipe_outro`
-- do "Outros", porque nos dois casos a equipe tem nome próprio. O que
-- muda é a pergunta na tela.
-- =====================================================================

alter table solicitacoes
  add column if not exists day_use_veiculo text;

comment on column solicitacoes.day_use_veiculo is
  'Veiculo que leva o grupo ao day use. A portaria do hotel exige para liberar a entrada.';
