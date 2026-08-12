-- Importa as operações da planilha de processos (setembro a dezembro de 2026).
--
-- Rode UMA VEZ, no SQL editor do Supabase, depois da migration
-- 20260811000000_etapas_da_operacao.sql. Não é uma migration: importar
-- calendário é decisão de operação, não mudança de esquema — e a planilha vai
-- ganhar linhas novas que ninguém quer reimportar em cada deploy.
--
-- A planilha não traz o ano. Assumido 2026, conforme combinado. Se for outro,
-- troque na linha do `date` — ou peça pra gerar de novo.
--
-- `on conflict do nothing` deixa reexecutar sem duplicar: operação que já
-- existe pelo código fica como está, e a trigger de etapas só cria checklist
-- para as que realmente entraram.

insert into edicoes (codigo, destino, hotel, data_inicio, data_fim, noites, ativa)
select v.codigo, v.destino, v.hotel, v.data_inicio, v.data_fim,
       (v.data_fim - v.data_inicio), true
from (values
  ('ALEXANIA-20260929', 'ALEXÂNIA', 'TAUÁ ALEXÂNIA', date '2026-09-29', date '2026-10-02'),
  ('CAMP-SP-20261001', 'CAMP SP', 'ITAPURA', date '2026-10-01', date '2026-10-04'),
  ('CAMP-SP-20261004', 'CAMP SP', 'ITAPURA', date '2026-10-04', date '2026-10-07'),
  ('MED-LAKE-20261005', 'MED LAKE', 'MED LAKE PARADISE', date '2026-10-05', date '2026-10-08'),
  ('MALAI-MANSO-20261005', 'MALAI MANSO', 'MALAI MANSO RESORT', date '2026-10-05', date '2026-10-08'),
  ('CAMP-SP-20261007', 'CAMP SP', 'ITAPURA', date '2026-10-07', date '2026-10-10'),
  ('CAMP-SP-20261010', 'CAMP SP', 'ITAPURA', date '2026-10-10', date '2026-10-13'),
  ('MED-LAKE-20261012', 'MED LAKE', 'MED LAKE PARADISE', date '2026-10-12', date '2026-10-15'),
  ('CAMP-CERRADO-20261013', 'CAMP CERRADO', 'VILA VELUTTI', date '2026-10-13', date '2026-10-16'),
  ('CAMP-SP-20261013', 'CAMP SP', 'ITAPURA', date '2026-10-13', date '2026-10-16'),
  ('CAMP-SP-20261016', 'CAMP SP', 'ITAPURA', date '2026-10-16', date '2026-10-19'),
  ('FAZZENDA-PARK-20261018', 'FAZZENDA PARK', 'FAZZENDA PARK RESORT', date '2026-10-18', date '2026-10-21'),
  ('CAMP-SP-20261019', 'CAMP SP', 'ITAPURA', date '2026-10-19', date '2026-10-22'),
  ('CAMP-SP-20261022', 'CAMP SP', 'ITAPURA', date '2026-10-22', date '2026-10-25'),
  ('NOVOTEL-20261022', 'NOVOTEL', 'NOVOTEL ITU', date '2026-10-22', date '2026-10-25'),
  ('NOVOTEL-20261025', 'NOVOTEL', 'NOVOTEL ITU', date '2026-10-25', date '2026-10-28'),
  ('FORFUN-SP-20261027', 'FORFUN SP', 'ITAPURA', date '2026-10-27', date '2026-10-29'),
  ('CAETE-20261026', 'CAETÉ', 'TAUÁ CAETÉ', date '2026-10-26', date '2026-10-29'),
  ('FORFUN-SP-20261029', 'FORFUN SP', 'ITAPURA', date '2026-10-29', date '2026-10-31'),
  ('FORFUN-SP-20261031', 'FORFUN SP', 'ITAPURA', date '2026-10-31', date '2026-11-02'),
  ('CAMP-SP-20261102', 'CAMP SP', 'ITAPURA', date '2026-11-02', date '2026-11-05'),
  ('VG-ANGRA-20261103', 'VG ANGRA', 'VILA GALÉ ANGRA', date '2026-11-03', date '2026-11-06'),
  ('BEACH-PARK-20261103', 'BEACH PARK', 'SUÍTES BEACH PARK', date '2026-11-03', date '2026-11-06'),
  ('CAMP-SP-20261105', 'CAMP SP', 'ITAPURA', date '2026-11-05', date '2026-11-08'),
  ('BEACH-PARK-20261106', 'BEACH PARK', 'SUÍTES BEACH PARK', date '2026-11-06', date '2026-11-09'),
  ('CAMP-SP-20261108', 'CAMP SP', 'ITAPURA', date '2026-11-08', date '2026-11-11'),
  ('PRATAGY-20261110', 'PRATAGY', 'PRATAGY BEACH RESORT', date '2026-11-10', date '2026-11-13'),
  ('CAMP-SP-20261111', 'CAMP SP', 'ITAPURA', date '2026-11-11', date '2026-11-14'),
  ('CAMP-SP-20261114', 'CAMP SP', 'ITAPURA', date '2026-11-14', date '2026-11-17'),
  ('LE-CANTON-20261123', 'LE CANTON', 'LE CANTON', date '2026-11-23', date '2026-11-25'),
  ('CAMP-SUL-20261123', 'CAMP SUL', 'CALDAS DA IMPERATRIZ', date '2026-11-23', date '2026-11-25'),
  ('LE-CANTON-20261125', 'LE CANTON', 'LE CANTON', date '2026-11-25', date '2026-11-27'),
  ('MED-LAKE-20261130', 'MED LAKE', 'MED LAKE PARADISE', date '2026-11-30', date '2026-12-03'),
  ('FORFUN-SP-20261130', 'FORFUN SP', 'ITAPURA', date '2026-11-30', date '2026-12-02'),
  ('FORFUN-SP-20261202', 'FORFUN SP', 'ITAPURA', date '2026-12-02', date '2026-12-04'),
  ('FORFUN-SP-20261204', 'FORFUN SP', 'ITAPURA', date '2026-12-04', date '2026-12-06'),
  ('CAMP-SP-20261206', 'CAMP SP', 'ITAPURA', date '2026-12-06', date '2026-12-09'),
  ('CAETE-20261207', 'CAETÉ', 'TAUÁ CAETÉ', date '2026-12-07', date '2026-12-10'),
  ('FLORIPA-20261208', 'FLORIPA', 'FLORIPA', date '2026-12-08', date '2026-12-13'),
  ('CAMP-SP-20261209', 'CAMP SP', 'ITAPURA', date '2026-12-09', date '2026-12-12'),
  ('CAMP-SP-20261212', 'CAMP SP', 'ITAPURA', date '2026-12-12', date '2026-12-15'),
  ('MED-LAKE-20261213', 'MED LAKE', 'MED LAKE PARADISE', date '2026-12-13', date '2026-12-16'),
  ('VG-ANGRA-20261214', 'VG ANGRA', 'VILA GALÉ ANGRA', date '2026-12-14', date '2026-12-17'),
  ('MED-RIO-20261215', 'MED RIO', 'MED RIO DAS PEDRAS', date '2026-12-15', date '2026-12-18'),
  ('CAMP-SP-20261215', 'CAMP SP', 'ITAPURA', date '2026-12-15', date '2026-12-18'),
  ('NOVOTEL-20261217', 'NOVOTEL', 'NOVOTEL ITU', date '2026-12-17', date '2026-12-20')) as v (codigo, destino, hotel, data_inicio, data_fim)
on conflict (codigo) do nothing;

-- Confere o que entrou: 46 operações, cada uma com as 19 etapas em branco.
select e.destino, e.data_inicio, count(ee.id) as etapas
from edicoes e
left join etapas_edicao ee on ee.edicao_id = e.id
where e.codigo like '%-2026%'
group by e.id, e.destino, e.data_inicio
order by e.data_inicio;
