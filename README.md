# Sistema de Solicitação de Hospedagem e Transporte — Forma 9

Sistema interno para que as equipes da Forma solicitem hospedagem e transporte
(aéreo/rodoviário) para as edições do Forma 9, com fluxo de aprovação por diretor
e painel administrativo para a equipe operacional.

## Documentação

| Documento | Conteúdo |
|---|---|
| [01 — Visão e Requisitos](docs/01-visao-e-requisitos.md) | Escopo, atores, requisitos funcionais e não-funcionais |
| [02 — Decisão de Arquitetura](docs/02-decisao-arquitetura.md) | GitHub Pages vs. Supabase — recomendação e justificativa |
| [03 — Modelo de Dados](docs/03-modelo-de-dados.md) | Schema Postgres completo, RLS, enums |
| [04 — Fluxo e Estados](docs/04-fluxo-e-estados.md) | Máquina de estados da solicitação |
| [05 — Telas e Campos](docs/05-telas-e-campos.md) | Especificação de cada tela e validação de campo |
| [06 — Integrações](docs/06-integracoes.md) | Slack e e-mail |
| [07 — Segurança e LGPD](docs/07-seguranca-lgpd.md) | Tratamento de CPF e dados pessoais |
| [08 — Plano de Implementação](docs/08-plano-implementacao.md) | Fases, estimativa e checklist |
| **[09 — Guia passo a passo](docs/09-guia-passo-a-passo.md)** | **Comece por aqui: Supabase, GitHub, Slack e e-mail, clique a clique** |

## Estrutura do código

```
src/
  pages/Solicitar.tsx        formulário público (wizard de 5 passos)
  pages/Enviado.tsx          confirmação com protocolo e link
  pages/Acompanhar.tsx       acompanhamento por token (sem CPF, sem preços)
  pages/Login.tsx            login único (operação e diretores)
  pages/admin/AdminLayout.tsx  guarda de acesso + cabeçalho
  pages/admin/Lista.tsx      lista com filtros, busca e export CSV
  pages/admin/Detalhe.tsx    abas Solicitação / Operacional / Aprovação / Histórico
  pages/aprovacao/           área do diretor: pendências e decisão
  components/ui.tsx          componentes de formulário
  lib/                       máscaras, validação de CPF, constantes, tipos

supabase/
  migrations/                schema, RLS, área de aprovação, múltiplas datas
  seed.sql                   dados reais — NÃO versionado (ver abaixo)
  functions/
    criar-solicitacao/       valida e grava o formulário público
    consultar-solicitacao/   acompanhamento por token
    notificar-slack/         mensagem de aprovação
    enviar-confirmacao/      e-mail final ao solicitante
```

## Dados operacionais

O calendário de operações e os nomes dos diretores **não são versionados**.
Eles vivem no banco (tabelas `edicoes` e `diretores`) e num arquivo de seed
mantido fora do repositório pela equipe operacional.

O `supabase/setup-completo.sql` cria apenas a estrutura. Para popular os dados,
peça o arquivo de seed a quem cuida da operação.

## Resumo da recomendação

**Supabase (backend) + frontend estático no repositório/domínio que você já tem.**
As duas opções que você levantou não são excludentes: o GitHub resolve a
hospedagem do site, o Supabase resolve o que o site sozinho não faz — banco de
dados, login do admin e envio de Slack/e-mail. Detalhes em
[02 — Decisão de Arquitetura](docs/02-decisao-arquitetura.md).
