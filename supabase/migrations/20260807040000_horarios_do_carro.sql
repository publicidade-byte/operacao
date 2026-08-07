-- Horário de retirada e de devolução do carro.
--
-- A data sozinha não basta: a locadora conta a diária a partir da hora, e
-- devolver depois do horário vira diária extra. Quem sabe a hora é quem
-- pediu (ela depende do voo), não a operação.
--
-- Com isto, os campos `retirada_em` / `devolucao_em` da locação chegam ao
-- painel com data E hora — antes a hora vinha zerada e alguém tinha que
-- perguntar.

alter table solicitacao_carros add column if not exists retirada_hora  time;
alter table solicitacao_carros add column if not exists devolucao_hora time;

comment on column solicitacao_carros.retirada_hora is
  'Hora em que o solicitante quer retirar o carro. A diaria da locadora conta a partir daqui.';
