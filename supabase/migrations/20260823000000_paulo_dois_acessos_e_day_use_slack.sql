-- Um login, dois acessos — e a menção do day use no Slack.
--
-- ---------- POR QUE `meu_perfil` PRECISOU MUDAR ----------------------
--
-- Ela devolvia UMA linha: ADMIN se houvesse cadastro de operação, senão
-- DIRETOR. Isso funcionava porque ninguém era as duas coisas. O Paulo é: ele
-- aprova como diretor e acompanha as demandas como operação.
--
-- Com a função antiga, dar acesso de admin a ele o tiraria da área de
-- aprovação — o `limit 1` devolveria ADMIN e a tela do diretor o barraria.
-- Trocar a ordem só inverteria o problema.
--
-- Agora ela diz as duas coisas: `papel` continua sendo por onde a pessoa
-- entra, e `tem_admin`/`tem_diretor` dizem a que ela tem direito. As telas
-- passam a perguntar "tem direito?" em vez de "é?".

drop function if exists meu_perfil();
create function meu_perfil()
returns table (
  papel       text,
  id          uuid,
  nome        text,
  super_admin boolean,
  tem_admin   boolean,
  tem_diretor boolean
)
language sql security definer stable set search_path = public as $fn$
  with a as (
    select u.id, u.nome, u.super_admin from admin_users u
     where u.id = auth.uid() and u.ativo
  ),
  d as (
    select x.id, x.nome from diretores x
     where x.user_id = auth.uid() and x.ativo
  )
  select
    case when exists (select 1 from a) then 'ADMIN' else 'DIRETOR' end,
    coalesce((select a.id from a), (select d.id from d)),
    coalesce((select a.nome from a), (select d.nome from d)),
    coalesce((select a.super_admin from a), false),
    exists (select 1 from a),
    exists (select 1 from d)
  where exists (select 1 from a) or exists (select 1 from d);
$fn$;

grant execute on function meu_perfil() to authenticated;

-- ---------- O PAULO GANHA O CADASTRO DE OPERAÇÃO ----------------------
--
-- No MESMO usuário do login de diretor, que é o ponto: um login só. Havia um
-- cadastro antigo dele em outro e-mail (paulinho.forma@gmail.com), já
-- inativo — fica onde está, porque solicitações antigas podem apontar para
-- ele, e apagar levaria histórico junto.
--
-- `notificar = false` de propósito: gestor sem áreas recebe TODAS as
-- notificações de solicitação nova, e ele não pediu para virar destinatário
-- de tudo — pediu para acompanhar. As aprovações dele continuam chegando
-- normalmente pelo caminho de diretor.
insert into admin_users (id, nome, email, role, areas, ativo, notificar)
select d.user_id, d.nome, d.email, 'GESTOR', '{}', true, false
  from diretores d
 where d.email = 'paulinho@formaturismo.com.br' and d.user_id is not null
on conflict (id) do update
   set ativo = true, role = 'GESTOR', nome = excluded.nome;

-- ---------- DAY USE NO SLACK ------------------------------------------
--
-- Day use é do Ander e do Vinicius. Sem esta linha a solicitação entrava e
-- ninguém era avisado: a área não existia na lista de ninguém.
update admin_users
   set areas = (select array_agg(distinct x) from unnest(areas || 'DAY_USE') x)
 where nome in ('Ander Sousa', 'Vinicius Fernandes')
   and not ('DAY_USE' = any(areas));
