-- A estimativa de preço muda de lugar: sai do painel operacional e vai para o
-- formulário, onde quem pede vê antes de enviar. O painel não precisava dela.
--
-- Isso força duas mudanças na função:
--
-- 1) A CHAVE PASSA A SER A ROTA PEDIDA, não a emitida. O formulário trabalha
--    com código de cidade (SAO, RIO) e a tabela `voos` guarda o aeroporto
--    específico da emissão (CGH, SDU). Cruzar os dois nunca casava. Então a
--    média é agrupada pelo par de cidades que estava na solicitação.
--
-- 2) O GRANT INCLUI `anon`. O formulário é público, sem login. O que fica
--    exposto é só a média arredondada por rota — não dá para chegar no preço
--    de uma emissão específica, em quem viajou, nem em quando.
--
-- Continua sem Google Flights: não há API pública, e raspar a página é uma
-- peça que quebra sozinha e calada. O histórico da própria Forma é melhor
-- referência de qualquer jeito — é a tarifa que a empresa consegue.
--
-- Sem histórico da rota, não devolve linha, e a tela simplesmente não mostra
-- estimativa nenhuma, em vez de inventar um número.

drop function if exists referencia_precos_voo();

create or replace function estimativa_preco_voo()
returns table (rota text, estimativa numeric, base bigint)
language sql security definer stable set search_path = public as $fn$
  with trechos as (
    select case when v.trecho = 'IDA'
                then s.aeroporto_saida || '-' || s.aeroporto_chegada
                else coalesce(s.aeroporto_saida_volta, s.aeroporto_chegada) || '-' ||
                     coalesce(s.aeroporto_chegada_volta, s.aeroporto_saida)
           end as rota,
           v.preco
      from voos v
      join colaboradores c on c.id = v.colaborador_id
      join solicitacoes  s on s.id = c.solicitacao_id
     where v.preco is not null and v.preco > 0
       and s.aeroporto_saida is not null
       and s.aeroporto_chegada is not null
       and s.excluida_em is null
  )
  select rota, round(avg(preco) / 10) * 10, count(*)
    from trechos
   where rota is not null
   group by rota;
$fn$;

revoke all on function estimativa_preco_voo() from public;
grant execute on function estimativa_preco_voo() to anon, authenticated;
