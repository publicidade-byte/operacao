-- Salvar dados operacionais do carro estava falhando.
--
-- O índice único de `pedido_id` nasceu parcial (`where pedido_id is not null`),
-- porque na hora pareceu certo não ocupar o índice com as linhas antigas sem
-- pedido. Só que o Postgres não infere `ON CONFLICT (pedido_id)` a partir de um
-- índice parcial: para usá-lo, o INSERT precisaria repetir o mesmo predicado —
-- coisa que o PostgREST não faz. Resultado: todo upsert de locação voltava com
-- "no unique or exclusion constraint matching the ON CONFLICT specification", e
-- a operação clicava em salvar sem nada acontecer.
--
-- Índice completo resolve, e não custa nada: o Postgres já considera NULLs
-- distintos entre si, então as linhas sem pedido continuam podendo coexistir.

drop index if exists locacao_carro_pedido_idx;

create unique index if not exists locacao_carro_pedido_idx
  on locacao_carro (pedido_id);
