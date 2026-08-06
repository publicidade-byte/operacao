-- Datas de retirada e devolução do carro, informadas por quem solicita.
--
-- Antes só existiam `retirada_em` / `devolucao_em` em locacao_carro, que a
-- operação preenchia do zero. Mas quem sabe quando precisa do carro é quem
-- pediu — e ela já digitou isso em algum lugar (nas observações, em texto
-- livre). Agora vira campo, e a operação recebe pronto.

alter table solicitacao_carros add column if not exists retirada_data  date;
alter table solicitacao_carros add column if not exists devolucao_data date;

comment on column solicitacao_carros.retirada_data is
  'Data em que o solicitante quer retirar o carro. Padrao: entrada da estadia.';
comment on column solicitacao_carros.devolucao_data is
  'Data em que o solicitante devolve o carro. Padrao: saida da estadia.';

-- As reservas que já existem herdam o período da estadia — é o que a
-- operação assumiria de qualquer forma, e evita campo vazio na tela.
update solicitacao_carros sc
   set retirada_data  = coalesce(sc.retirada_data,  s.data_entrada),
       devolucao_data = coalesce(sc.devolucao_data, s.data_saida)
  from solicitacoes s
 where s.id = sc.solicitacao_id
   and (sc.retirada_data is null or sc.devolucao_data is null);
