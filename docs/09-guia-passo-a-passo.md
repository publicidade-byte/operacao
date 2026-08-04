# 09 — Guia passo a passo: Supabase + GitHub

Siga na ordem. Cada bloco tem o que fazer e como saber que deu certo.
Tempo estimado total: **60 a 90 minutos.**

---

# PARTE 1 — SUPABASE (banco, login e backend)

## 1.1 Criar a conta e o projeto

1. Acesse **https://supabase.com** e clique em *Start your project*.
2. Entre com sua conta GitHub (mais simples — já vai usar o GitHub depois).
3. Clique em **New project**.
4. Preencha:
   - **Name:** `forma9-viagens`
   - **Database Password:** clique em *Generate a password* e **salve num gerenciador
     de senhas**. Você vai precisar dela mais tarde e ela não é exibida de novo.
   - **Region:** `South America (São Paulo)` — menor latência para o Brasil.
   - **Plan:** Free
5. Clique em **Create new project** e espere ~2 minutos.

> **Recomendação:** crie um segundo projeto chamado `forma9-viagens-hml` para
> testes. Você pode fazer isso depois — o de produção já resolve o começo.

## 1.2 Pegar as chaves do projeto

No menu lateral: **Project Settings** (engrenagem) → **API**.

Anote três coisas:

| Item | Onde aparece | Para que serve |
|---|---|---|
| **Project URL** | `https://xxxx.supabase.co` | Frontend e Edge Functions |
| **anon public** | chave longa começando com `eyJ...` | Frontend (é pública por design) |
| **service_role** | outra chave `eyJ...` | **SEGREDO** — nunca no frontend nem no GitHub |

> A `service_role` ignora todas as regras de segurança do banco. Ela só pode
> existir dentro das Edge Functions. Se vazar, qualquer pessoa lê todos os CPFs.

## 1.3 Criar as tabelas

São **três** queries, nesta ordem. Menu lateral → **SQL Editor** → **New query**
para cada uma, colar o conteúdo inteiro e clicar em **Run**.

1. [`20260804000000_init.sql`](../supabase/migrations/20260804000000_init.sql)
   — tabelas, RLS e funções.
2. [`20260804010000_aprovacao_no_sistema.sql`](../supabase/migrations/20260804010000_aprovacao_no_sistema.sql)
   — área de aprovação dos diretores.
3. [`20260804020000_multiplas_datas.sql`](../supabase/migrations/20260804020000_multiplas_datas.sql)
   — permite uma solicitação cobrir várias operações do mesmo destino.

Deve aparecer `Success. No rows returned` nas três.

**Como conferir:** menu **Table Editor** → devem existir as tabelas `edicoes`,
`diretores`, `admin_users`, `solicitacoes`, `colaboradores`, `voos`,
`transporte_rodoviario`, `hospedagem_detalhe`, `locacao_carro`, `aprovacoes`,
`eventos_solicitacao`.

## 1.4 Carregar os destinos e diretores

> O arquivo de seed com o calendário real e os nomes dos diretores **não é
> versionado** — peça à equipe operacional. Ano das operações: **2026**.

1. **SQL Editor** → **New query**.
2. Cole todo o conteúdo do arquivo de seed.
3. **Run**.

**Como conferir:** **Table Editor** → `edicoes` deve ter 47 linhas; `diretores`,
8 linhas.

## 1.5 Desativar cadastro público (importante)

1. Menu → **Authentication** → **Sign In / Providers**.
2. Em **Email**, desligue **Allow new users to sign up**.
3. Salve.

Sem isso, qualquer pessoa cria uma conta e tenta entrar no painel. (Mesmo assim
não conseguiria ver dados, porque o painel exige registro em `admin_users` — mas
é uma camada a menos de risco.)

## 1.6 Criar o primeiro usuário admin

1. Menu → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Preencha e-mail e senha. Marque **Auto Confirm User**.
3. Clique em **Create user**.
4. Copie o **UID** do usuário criado (coluna ID na lista).
5. **SQL Editor** → nova query, substituindo os valores:

```sql
insert into admin_users (id, nome, email, role)
values ('COLE-O-UID-AQUI', 'Seu Nome', 'seu@email.com.br', 'GESTOR');
```

6. **Run**.

Repita 1 a 6 para cada pessoa da operação (use `'OPERACIONAL'` em vez de
`'GESTOR'` para quem não vai gerenciar cadastros).

## 1.6b Criar o login dos diretores aprovadores

Os 8 diretores já existem na tabela `diretores` (vieram do seed), mas ainda sem
conta de acesso. Para cada um que for aprovar pelo sistema:

1. **Authentication** → **Users** → **Add user** → **Create new user**, com o
   e-mail corporativo dele. Marque **Auto Confirm User**.
2. Copie o **UID**.
3. **SQL Editor**, ajustando nome e UID:

```sql
update diretores
   set user_id = 'COLE-O-UID-AQUI',
       email   = 'eduardo@forma.com.br'
 where nome = 'Diretor Exemplo';
```

4. Envie a senha ao diretor por um canal seguro e peça que troque no primeiro
   acesso.

**Como conferir:** entre com a conta do diretor em `/login` — o sistema deve
levar para `/aprovacao`, não para `/admin`.

> Um diretor sem `user_id` continua aparecendo no formulário e recebendo o aviso
> no Slack, mas não consegue entrar para decidir. Cadastre o login antes de
> colocar o sistema em uso.

## 1.7 Publicar as Edge Functions

Aqui você precisa da CLI do Supabase. **No PowerShell**, dentro da pasta do
projeto:

Instalar a CLI (uma vez só):

```bash
npm install -g supabase
```

Fazer login (abre o navegador):

```bash
supabase login
```

Conectar a pasta ao seu projeto (o ref já é o do projeto criado):

```bash
supabase link --project-ref tvszasxlyyeibhafofsa
```

Publicar as quatro funções — `--no-verify-jwt` porque o formulário público e o
link de acompanhamento são acessados sem login:

```bash
supabase functions deploy criar-solicitacao --no-verify-jwt
```

```bash
supabase functions deploy consultar-solicitacao --no-verify-jwt
```

```bash
supabase functions deploy notificar-slack --no-verify-jwt
```

```bash
supabase functions deploy enviar-confirmacao --no-verify-jwt
```

**Como conferir:** menu **Edge Functions** → as quatro aparecem com status
*Deployed*.

## 1.8 Configurar os segredos das funções

Menu → **Edge Functions** → **Secrets** (ou **Project Settings → Edge Functions**).
Adicione:

| Nome | Valor | Obrigatório agora? |
|---|---|---|
| `SITE_URL` | `https://seu-dominio.com.br` (sem barra no final) | Sim |
| `RESEND_API_KEY` | chave do Resend (parte 3) | Depois |
| `EMAIL_FROM` | `Forma 9 <viagens@seudominio.com.br>` | Depois |
| `EMAIL_OPERACAO` | e-mail do time operacional | Depois |
| `SLACK_BOT_TOKEN` | `xoxb-...` (parte 4) | Depois |
| `SLACK_CHANNEL_ID` | `C01ABC...` (parte 4) | Depois |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente — **não
precisa criar**.

> O sistema funciona sem Resend e sem Slack: os e-mails ficam só no log e o botão
> de Slack dá erro. Tudo mais roda.

---

# PARTE 2 — RODAR LOCALMENTE (antes de publicar)

Na pasta do projeto:

1. Crie o arquivo `.env` copiando o `.env.example` e preencha com a **Project
   URL** e a **anon key** do passo 1.2.

2. Instale e rode:

```bash
npm install
```

```bash
npm run dev
```

3. Abra **http://localhost:5173** — deve carregar o formulário com os 46 destinos
   no select.

**Teste completo:**
- Preencha o formulário até o fim e envie → deve aparecer o protocolo.
- Vá em `http://localhost:5173/admin/login` e entre com o usuário do passo 1.6.
- A solicitação deve estar na lista. Abra e preencha a aba **Operacional**.

Se o select de destinos vier vazio, o `.env` está errado ou o seed não rodou.

---

# PARTE 3 — E-MAIL (Resend)

1. Crie conta em **https://resend.com** (grátis, 3.000 e-mails/mês).
2. **Domains** → **Add Domain** → informe o domínio de envio.
3. O Resend mostra 3 registros DNS (SPF, DKIM, DMARC). Adicione-os no painel do
   seu provedor de DNS (Registro.br, Cloudflare, GoDaddy…).
4. Espere a validação (minutos a algumas horas) até ficar **Verified**.
5. **API Keys** → **Create API Key** → copie.
6. Cole em `RESEND_API_KEY` nos secrets do Supabase (passo 1.8). Preencha também
   `EMAIL_FROM` com um endereço **do domínio verificado**.

> Pular a verificação de DNS faz os e-mails caírem em spam ou serem rejeitados
> pelo Gmail corporativo. É o passo que mais dá problema — não deixe para depois.

---

# PARTE 4 — SLACK

1. Acesse **https://api.slack.com/apps** → **Create New App** → **From scratch**.
2. Nome: `Forma 9 Viagens`. Escolha a workspace da Forma.
3. Menu **OAuth & Permissions** → em *Bot Token Scopes*, adicione:
   - `chat:write`
   - `chat:write.public`
4. Role para o topo → **Install to Workspace** → autorize.
5. Copie o **Bot User OAuth Token** (`xoxb-...`) → cole em `SLACK_BOT_TOKEN`.
6. No Slack, crie o canal `#aprovacoes-viagens-f9` e digite no canal:
   `/invite @Forma 9 Viagens`
7. Clique no nome do canal → role até o fim → copie o **Channel ID**
   (`C01ABC...`) → cole em `SLACK_CHANNEL_ID`.

**Menções aos diretores (opcional, mas recomendado):** no Slack, abra o perfil de
cada diretor → *Mais* → **Copiar ID do membro**. Depois, no SQL Editor:

```sql
update diretores set slack_user_id = 'U01ABCDEF' where nome = 'Diretor Exemplo';
```

Sem isso a mensagem cita o nome em negrito, mas não notifica a pessoa.

---

# PARTE 5 — GITHUB E DOMÍNIO

## 5.1 Subir o código

Se o repositório **ainda não existe**:

```bash
git init -b main
```

```bash
git add . && git commit -m "Sistema de solicitacao de hospedagem e transporte - Forma 9"
```

```bash
gh repo create forma9-viagens --private --source=. --push
```

Se o repositório **já existe** (o que tem o domínio configurado):

```bash
git remote add origin https://github.com/SUA-ORG/SEU-REPO.git
```

```bash
git add . && git commit -m "Sistema de solicitacao de hospedagem e transporte - Forma 9"
```

```bash
git push -u origin main
```

> ⚠️ Confirme que o `.env` **não** foi enviado. Ele está no `.gitignore`, mas
> vale conferir com `git status` antes do commit.

## 5.2 Configurar as variáveis de build

No GitHub: **Settings** do repositório → **Secrets and variables** → **Actions**
→ aba **Variables** → **New repository variable**. Crie duas:

- `VITE_SUPABASE_URL` = a Project URL
- `VITE_SUPABASE_ANON_KEY` = a anon key

São *Variables*, não *Secrets* — essas duas chaves são públicas por natureza
(ficam visíveis no JavaScript do navegador). A proteção real é a RLS no banco.

## 5.3 Ligar o GitHub Pages

1. **Settings** → **Pages**.
2. Em **Source**, escolha **GitHub Actions**.
3. Em **Custom domain**, confirme que o domínio já configurado está lá.
4. Marque **Enforce HTTPS**.

## 5.4 Publicar

O deploy roda sozinho a cada push na `main`. Para disparar manualmente: aba
**Actions** → workflow **Deploy** → **Run workflow**.

**Como conferir:** o workflow fica verde e o domínio abre o formulário.

## 5.5 Ajuste se NÃO usar domínio próprio

Se publicar em `https://usuario.github.io/forma9-viagens/`, abra
[`vite.config.ts`](../vite.config.ts) e troque:

```ts
base: '/forma9-viagens/',
```

Com domínio próprio, deixe `base: '/'` como está.

---

# PARTE 6 — CHECKLIST FINAL

- [ ] As **duas** migrations rodadas, na ordem
- [ ] 46 edições e 8 diretores carregados
- [ ] Ano das edições confirmado com quem monta a planilha
- [ ] Cadastro público desativado no Supabase Auth
- [ ] Usuários admin criados e testados (login funciona)
- [ ] **Login dos diretores criado e `user_id` preenchido em `diretores`**
- [ ] Testado que o diretor cai em `/aprovacao` e não enxerga CPF
- [ ] 4 Edge Functions publicadas
- [ ] `SITE_URL` configurado
- [ ] Domínio do Resend verificado, e-mail de teste chegou na caixa de entrada
- [ ] Bot do Slack no canal, mensagem de teste postada
- [ ] `slack_user_id` preenchido para os 8 diretores
- [ ] `.env` **não** está no repositório
- [ ] Fluxo completo testado ponta a ponta com uma solicitação de mentira
- [ ] Solicitação de teste apagada antes de divulgar o link

---

# Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Select de destinos vazio | `.env` errado ou seed não rodou | Confira as chaves; rode o `seed.sql` |
| "Falha na requisição (401)" ao enviar | Função publicada sem `--no-verify-jwt` | Republique com a flag |
| Login funciona mas dá "sem perfil de administrador" | Faltou inserir em `admin_users` | Rode o INSERT do passo 1.6 |
| Diretor entra e vê "perfil não liberado" | `user_id` não preenchido em `diretores` | Rode o UPDATE do passo 1.6b |
| Área de aprovação vazia para o diretor | Nenhuma solicitação está com status "aguardando aprovação" para ele | Envie uma para aprovação pelo painel da operação |
| Erro "Apenas diretores aprovadores podem executar esta ação" | A 2ª migration não rodou, ou o usuário não está vinculado | Confira o passo 1.3 e o 1.6b |
| Rotas `/admin` dão 404 no domínio | Falta o `404.html` | O workflow já faz; confira se o build rodou |
| E-mail não chega | Resend não configurado ou DNS não verificado | Veja os logs em **Edge Functions → Logs** |
| Slack retorna `channel_not_found` | Bot não foi convidado ao canal | `/invite @Forma 9 Viagens` no canal |
| Slack retorna `not_in_channel` | Mesma coisa | Idem |
