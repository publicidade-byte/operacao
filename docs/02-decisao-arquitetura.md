# 02 — Decisão de Arquitetura

## A pergunta: "GitHub ou Supabase?"

As duas opções resolvem problemas diferentes e **devem ser usadas juntas**:

- **GitHub / GitHub Pages** = onde o *site* mora (arquivos HTML/JS servidos ao
  navegador). Não tem banco de dados, não tem login, não guarda nada.
- **Supabase** = onde os *dados* moram (Postgres) + autenticação do admin +
  funções de servidor para disparar Slack e e-mail.

Um sistema com painel logado e persistência de solicitações **não pode ser feito
só com GitHub Pages**. Se o objetivo fosse apenas um formulário que joga tudo
numa planilha, um site estático + Google Forms bastaria — mas os requisitos de
status, aprovação, edição operacional e audit log descartam isso.

## Recomendação

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend — React + Vite + TypeScript + Tailwind             │
│  Build estático publicado via GitHub Actions no domínio       │
│  já configurado no repositório                                │
│                                                               │
│   /            → formulário público de solicitação            │
│   /s/{token}   → acompanhamento somente-leitura                │
│   /admin/*     → painel logado da operação                     │
└───────────────┬──────────────────────────────────────────────┘
                │ supabase-js (HTTPS)
┌───────────────▼──────────────────────────────────────────────┐
│  Supabase                                                     │
│   • Postgres         → dados + Row Level Security             │
│   • Auth             → login do admin (e-mail/senha)          │
│   • Edge Functions   → criar-solicitacao, enviar-slack,       │
│                        enviar-email-confirmacao               │
│   • Storage          → prints de aprovação do Slack, anexos   │
└───────────────┬──────────────────────────────────────────────┘
                │
      ┌─────────┴─────────┐
      ▼                   ▼
  Slack (Bot Token)   Resend (e-mail transacional)
```

### Por que essa combinação

| Critério | Avaliação |
|---|---|
| **Aproveita o que já existe** | O domínio e o repositório continuam sendo usados; nada é jogado fora. |
| **Custo** | GitHub Pages grátis. Supabase free tier (500 MB / 50k usuários) cobre o volume com folga — 46 edições, dezenas de solicitações. Resend: 3.000 e-mails/mês grátis. Custo esperado: **R$ 0**. |
| **Segurança** | Row Level Security no Postgres garante que o formulário público só possa *inserir*, nunca ler solicitações de terceiros. Chaves de Slack e e-mail ficam em Edge Functions, nunca no frontend. |
| **Velocidade de entrega** | Auth, banco, storage e API REST vêm prontos. Não há backend para escrever, só três Edge Functions. |
| **Operação** | Supabase tem console web — a operação consegue consultar dados direto se precisar. Backup diário automático. |

### O que **não** recomendo

| Alternativa | Por que não |
|---|---|
| **Só GitHub Pages + Google Forms/Sheets** | Sem status, sem audit log, sem painel de edição por colaborador, sem controle de quem vê CPF. Volta ao problema atual, só que com formulário mais bonito. |
| **Next.js + Vercel** | Excelente stack, mas troca o hosting que você já tem e adiciona uma conta/fatura a mais. Só vale se quiserem SSR — que aqui não é necessário. |
| **Backend próprio (Node/Django) + VPS** | Mais controle, muito mais trabalho: deploy, TLS, backup, patch de segurança. Desproporcional ao tamanho do problema. |
| **Airtable / Notion** | Rápido de montar, mas o formulário público com múltiplos colaboradores e as regras condicionais ficam ruins, e o custo por editor cresce. |

## Detalhamento das partes

### Frontend
- **React 18 + Vite + TypeScript** — build estático, deploy simples.
- **Tailwind CSS + shadcn/ui** — componentes de formulário e tabela prontos.
- **React Hook Form + Zod** — validação declarativa; a mesma definição Zod é
  reaproveitada na Edge Function, então cliente e servidor validam igual.
- **TanStack Query** — cache e revalidação da lista do admin.
- Deploy: GitHub Actions rodando `npm run build` e publicando `dist/`.
  Como há rotas `/admin/*` client-side, incluir um `404.html` que devolve o
  `index.html` (padrão SPA no GitHub Pages).

### Supabase
- **Postgres** com o schema de [03 — Modelo de Dados](03-modelo-de-dados.md).
- **Auth**: apenas contas criadas pelo gestor (signup público **desativado**).
  Papel do usuário guardado em `admin_users.role`.
- **RLS**: `anon` não lê nada; a criação da solicitação passa por Edge Function
  com `service_role`, então nem o insert fica exposto direto.
- **Edge Functions** (Deno, TypeScript):
  - `criar-solicitacao` — valida payload, grava solicitação + colaboradores,
    gera token de acompanhamento, envia e-mail de "recebemos sua solicitação";
  - `notificar-slack` — posta a mensagem de aprovação no Slack;
  - `enviar-confirmacao` — monta e envia o e-mail final ao solicitante.
- **Storage**: bucket privado `evidencias` para prints da aprovação no Slack.

### Ambientes
| Ambiente | Projeto Supabase | URL |
|---|---|---|
| Homologação | `forma9-viagens-hml` | branch `develop` → subdomínio de teste |
| Produção | `forma9-viagens` | branch `main` → domínio definitivo |

## O que você precisa providenciar

1. Conta Supabase (gratuita) e criação de dois projetos.
2. Nome do repositório GitHub e do domínio já configurado.
3. Um Slack App na workspace da Forma com escopo `chat:write` e o bot convidado
   ao canal de aprovações.
4. Conta Resend + acesso ao DNS do domínio para SPF/DKIM.
5. Lista de e-mails que terão acesso ao painel admin.

Nada disso bloqueia o início: o protótipo pode rodar com dados locais enquanto as
contas são criadas.
