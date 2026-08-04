# 07 — Segurança e LGPD

O sistema coleta **nome completo, CPF e data de nascimento** de terceiros, além
de e-mail e telefone do solicitante. CPF é dado pessoal e a combinação
nome + CPF + nascimento identifica diretamente a pessoa. Isso traz obrigações
concretas sob a LGPD e não é opcional.

## Base legal

O tratamento se apoia em **execução de contrato / legítimo interesse** (viabilizar
a viagem a trabalho do colaborador). Ainda assim, o formulário deve informar
claramente o que é coletado e para quê.

## Medidas obrigatórias na v1

| # | Medida | Onde |
|---|---|---|
| 1 | **Aviso de privacidade** no passo de revisão do formulário: quais dados, para qual finalidade (reserva de hotel e emissão de passagem), por quanto tempo, com quem são compartilhados (hotéis, cias aéreas, locadoras), e como solicitar exclusão. | Frontend |
| 2 | **Checkbox de ciência** — o solicitante declara que informou os colaboradores sobre o uso dos dados. Registrar timestamp. | Frontend + banco |
| 3 | **CPF nunca em URL**, nunca em query string, nunca em log de aplicação. | Todo o stack |
| 4 | **CPF mascarado por padrão** na listagem e nos cards do admin (`***.456.789-**`), com botão "revelar" que gera evento no audit log. | Painel admin |
| 4b | **Diretores não acessam CPF nem data de nascimento.** A área de aprovação lê views `security definer` que expõem só o necessário para decidir; as tabelas base seguem bloqueadas pela RLS. Não é ocultação na interface — o dado não sai do banco. | Views `v_aprovacao_*` |
| 4c | **Diretor só vê o que é dele.** As views filtram por `diretor_atual()`; a decisão passa por `aprovar_solicitacao()`, que valida autoria e status no servidor. Nenhum diretor recebe UPDATE direto em `solicitacoes`. | Banco |
| 5 | **RLS ativa em todas as tabelas.** Nenhuma leitura por `anon`. | Supabase |
| 6 | **Link de acompanhamento** (`/s/:token`) não expõe CPF nem preços; token de 32 bytes aleatórios, não sequencial. | Edge Function |
| 7 | **HTTPS obrigatório**, HSTS habilitado no domínio. | Hosting |
| 8 | **Acesso admin nominal** — sem conta compartilhada. Signup público desativado; contas criadas pelo gestor. | Supabase Auth |
| 9 | **MFA** habilitado para contas com papel `GESTOR`. | Supabase Auth |
| 10 | **Audit log** de toda leitura de CPF revelado, edição e mudança de status. | `eventos_solicitacao` |
| 11 | **Retenção** — solicitações `CONCLUIDA` há mais de 24 meses têm CPF e data de nascimento anonimizados por rotina agendada. Os dados de viagem e custo permanecem para histórico. | Cron no Supabase |
| 12 | **Backup** diário automático; restauração testada uma vez antes do go-live. | Supabase |

## Anti-abuso no formulário público

O formulário aceita envio sem login, então precisa de contenção:

- **Cloudflare Turnstile** (gratuito, sem captcha visual na maioria dos casos);
- **Honeypot** — campo oculto que, preenchido, descarta silenciosamente;
- **Rate limit** na Edge Function: máx. 5 solicitações por IP por hora e 20 por
  e-mail por dia;
- **Validação server-side integral** — a Edge Function revalida tudo com o mesmo
  schema Zod do frontend; nada é confiado ao cliente;
- **Limite de tamanho**: máx. 50 colaboradores por solicitação, 1.000 caracteres
  por campo de observação.

## Alternativa considerada e descartada

**Exigir login para solicitar** (magic link no e-mail corporativo) eliminaria o
anti-abuso e daria "minhas solicitações" de graça. Descartei para a v1 porque
nem toda equipe (Fotix, Salva-Vidas, DJ, terceirizados) tem e-mail
`@forma`, e o atrito de login reduziria a adesão logo na virada de processo. Se
mais adiante o cadastro de pessoas se consolidar, é a evolução natural — e o
schema já suporta, bastando ligar `solicitacoes` a um `auth.users`.

## Checklist antes do go-live

- [ ] Aviso de privacidade revisado por quem cuida de jurídico/compliance na Forma
- [ ] Signup público desativado no Supabase Auth
- [ ] RLS verificada tabela a tabela (testar com o `anon key` na mão)
- [ ] Secrets fora do repositório; `.env` no `.gitignore`
- [ ] SPF/DKIM/DMARC validados
- [ ] Restauração de backup testada
- [ ] Lista de admins revisada e MFA ativo nos gestores
