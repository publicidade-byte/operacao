-- =====================================================================
-- O solicitante passa a escolher UM OU MAIS serviços, em vez de um
-- "modal" único de transporte.
--
-- Serviços: AEREO, RODOVIARIO, VAN, CARRO, HOSPEDAGEM.
--
-- `modal` continua existindo por compatibilidade (relatórios antigos e o
-- primeiro transporte escolhido), mas quem manda é `servicos`.
-- =====================================================================

alter table solicitacoes
  add column if not exists servicos text[] not null default '{}';

-- Converte o histórico: o que já existia vira lista.
update solicitacoes set servicos = (
  select array_remove(array[
    case when modal = 'AEREO'      then 'AEREO' end,
    case when modal = 'RODOVIARIO' then 'RODOVIARIO' end,
    case when modal = 'VAN'        then 'VAN' end,
    case when precisa_locacao_carro then 'CARRO' end,
    'HOSPEDAGEM'
  ], null))
where servicos = '{}';

-- As regras deixam de olhar `modal` e passam a olhar `servicos`.
alter table solicitacoes drop constraint if exists modal_obrigatorio_se_transporte;
alter table solicitacoes drop constraint if exists aeroportos_obrigatorios_se_aereo;
alter table solicitacoes drop constraint if exists van_campos_obrigatorios;

alter table solicitacoes add constraint servicos_nao_vazio
  check (array_length(servicos, 1) >= 1);

alter table solicitacoes add constraint aereo_exige_aeroportos
  check (not ('AEREO' = any(servicos))
         or (aeroporto_saida is not null and aeroporto_chegada is not null));

alter table solicitacoes add constraint van_exige_dados
  check (not ('VAN' = any(servicos))
         or (coalesce(btrim(van_local_saida), '') <> ''
             and coalesce(btrim(van_horario_saida), '') <> ''
             and coalesce(btrim(van_destino), '') <> ''
             and van_qtd_passageiros > 0));

-- NOT VALID: solicitações anteriores ao campo de condutor ficam como estão.
alter table solicitacoes add constraint carro_exige_condutor
  check (not ('CARRO' = any(servicos))
         or (coalesce(btrim(carro_condutor_nome), '') <> ''
             and coalesce(btrim(carro_condutor_cpf), '') <> ''
             and carro_transmissao is not null)) not valid;
