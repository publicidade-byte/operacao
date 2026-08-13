-- Referência de preço por rota, a partir do que a Forma realmente pagou.
--
-- POR QUE NÃO O GOOGLE FLIGHTS: ele não tem API pública. Só daria para
-- raspar a página — o que quebra a cada mudança de layout deles, é
-- bloqueado por detecção de robô e fere os termos de uso. Seria uma peça
-- que funciona hoje e falha sozinha depois, calada, que é o pior tipo de
-- defeito para quem opera.
--
-- O histórico de emissões do próprio sistema não tem nenhum desses
-- problemas, e ainda é uma referência melhor: reflete as tarifas que a
-- Forma consegue, não a tarifa de balcão.
--
-- Quando não há histórico da rota, não devolve linha — e a tela diz que
-- não há referência, em vez de mostrar um número inventado.
--
-- `security definer` para ler `voos` sem abrir a tabela; o grant é só para
-- `authenticated`, porque preço de passagem é dado comercial e o
-- formulário público não deve expor quanto a empresa paga.

create or replace function referencia_precos_voo()
returns table (rota text, emissoes bigint, media numeric, menor numeric, maior numeric, desde date)
language sql security definer stable set search_path = public as $fn$
  select v.aeroporto_origem || '-' || v.aeroporto_destino,
         count(*),
         round(avg(v.preco)::numeric, 2),
         min(v.preco), max(v.preco),
         min(v.partida_data)
    from voos v
   where v.preco is not null and v.preco > 0
     and v.aeroporto_origem is not null and v.aeroporto_destino is not null
   group by 1;
$fn$;

revoke all on function referencia_precos_voo() from public, anon;
grant execute on function referencia_precos_voo() to authenticated;
