-- Contas que têm login mas não são pessoas da operação.
--
-- `Forma Operacao` é o login administrativo (super admin). Como `areas` vazio
-- significa "recebe tudo", ela entrava em toda notificação — e, sem
-- slack_user_id, saía como *nome* em negrito no meio das menções. Mesmo
-- sintoma que a Carol tinha.
--
-- Desativar não serve: tiraria o acesso ao sistema. Faltava separar as duas
-- coisas — quem entra no painel e quem é avisado no Slack.
--
-- Vale para qualquer conta de serviço criada depois.

alter table admin_users
  add column if not exists notificar boolean not null default true;

comment on column admin_users.notificar is
  'Se falso, a conta nao entra nas notificacoes do Slack. Para logins '
  'administrativos ou de servico, que nao sao pessoas da operacao.';

update admin_users set notificar = false
 where email = email_super_admin();
