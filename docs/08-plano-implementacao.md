# 08 — Plano de Implementação

## Fases

### Fase 0 — Provisionamento (você)
- [ ] Criar conta e projetos Supabase (`hml` e `prod`)
- [ ] Confirmar repositório GitHub e domínio já configurado
- [ ] Criar Slack App + canal de aprovações + coletar `slack_user_id` dos diretores
- [ ] Criar conta Resend + configurar SPF/DKIM/DMARC
- [ ] Confirmar o **ano das edições** (assumido 2026)
- [ ] Enviar a lista de e-mails dos admins

Nada aqui bloqueia a Fase 1 — o protótipo roda com mock enquanto isso.

### Fase 1 — Fundação
- Scaffold React + Vite + TS + Tailwind + shadcn/ui
- Schema Postgres completo + RLS + seed de `edicoes`, `diretores`, equipes
- Deploy contínuo via GitHub Actions no domínio
- **Entrega:** site no ar com uma página placeholder e banco pronto

### Fase 2 — Formulário público
- Wizard de 5 passos com validação Zod
- Bloco repetível de colaboradores, validação de CPF, máscaras
- Edge Function `criar-solicitacao` + rate limit + Turnstile
- Tela de confirmação e link de acompanhamento
- E-mail #1 (recebemos sua solicitação)
- **Entrega:** dá para começar a receber solicitações de verdade, mesmo sem painel

### Fase 3 — Painel administrativo
- Login, RLS validada, gestão de sessão
- Lista com filtros, busca, indicadores e export
- Detalhe com abas Solicitação / Operacional / Aprovação / Histórico
- Formulários de voo, rodoviário, hospedagem e locação + "replicar para todos"
- Cálculo de custo total, audit log
- **Entrega:** processo completo operável dentro do sistema

### Fase 4 — Aprovação e confirmação
- Edge Function `notificar-slack` com Block Kit
- Registro de aprovação com evidência (upload no Storage)
- Edge Function `enviar-confirmacao` + template do e-mail final
- Máquina de estados travada conforme [04](04-fluxo-e-estados.md)
- **Entrega:** fluxo ponta a ponta

### Fase 5 — Ajustes e go-live
- CRUD de cadastros (edições, diretores, usuários)
- Teste com uma edição real em homologação
- Checklist de segurança de [07](07-seguranca-lgpd.md)
- Treinamento da operação (1h) + guia rápido de 1 página
- Migração para produção

### Fase 6 — Evoluções (backlog)
- Botões de aprovar/reprovar direto no Slack
- Dashboard de custos por equipe/destino
- Importação de colaboradores por planilha
- PDF anexo no e-mail de confirmação
- Notificação WhatsApp ao solicitante
- Login do solicitante com "minhas solicitações"

## Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Ano das edições errado no seed | Alto — todas as datas erradas | Confirmar antes da carga; `edicoes` é editável no painel |
| Formulário público recebe spam ou envio de teste em massa | Médio | Turnstile + rate limit + honeypot desde a Fase 2 |
| Aprovação registrada errada (operação marca aprovado sem ter sido) | Alto — dinheiro envolvido | Permalink do Slack + print obrigatórios; audit log nominal; fase 2 com botões elimina o risco |
| Equipes continuarem pedindo por WhatsApp | Alto — o sistema não pega | Definir data de corte e comunicar que fora do sistema não é atendido |
| E-mails caindo em spam | Médio | SPF/DKIM/DMARC antes do go-live; teste com Gmail, Outlook e domínio próprio |
| Volume de solicitações de última hora perto das edições | Médio | Alerta no painel de edições com evento em <15 dias e solicitações pendentes |
| CPF vazando em log ou export mal controlado | Alto — LGPD | Mascaramento padrão, export restrito a gestor, audit log de revelação |

## Definição de pronto (por fase)

- Todos os requisitos da fase implementados e testados manualmente no fluxo real
- Validação funcionando igual no cliente e no servidor
- Responsivo verificado em 375px e 1440px
- Sem secret no repositório
- Documentação atualizada quando a implementação divergir do planejado
