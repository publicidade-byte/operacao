-- Fora do hotel dos passageiros: o hotel da operação e o hotel de fato são
-- coisas diferentes.
--
-- `hotel` guarda o hotel da operação (TAUÁ ALEXÂNIA, por exemplo) — serve de
-- referência para quem reserva. Onde a pessoa vai dormir é outro lugar, e
-- não tinha campo: acabava virando observação em texto livre.
--
-- `alimentacao` acompanha o que o solicitante pediu, para a operação
-- confirmar ou ajustar na reserva de verdade.

alter table hospedagem_detalhe add column if not exists hotel_hospedagem text;
alter table hospedagem_detalhe add column if not exists alimentacao      text;

comment on column hospedagem_detalhe.hotel_hospedagem is
  'Hotel onde a operacao de fato hospedou. Fora do hotel do pax, e este que vale.';

alter table hospedagem_detalhe drop constraint if exists hosp_det_alimentacao_valida;
alter table hospedagem_detalhe add constraint hosp_det_alimentacao_valida check (
  alimentacao is null or alimentacao in ('COM_CAFE', 'SEM_CAFE')
);
