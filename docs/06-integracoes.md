# 06 — Integrações

## 1. Slack — aviso de pendência

> **O Slack não aprova nada.** Ele só avisa o diretor de que existe uma
> solicitação esperando por ele e leva direto para a tela de decisão. A
> aprovação acontece no sistema, autenticada.

### Configuração
1. Criar um **Slack App** na workspace da Forma (`api.slack.com/apps`).
2. Escopos de bot: `chat:write`, `chat:write.public`, `files:write` (opcional).
3. Instalar o app e guardar o **Bot User OAuth Token** (`xoxb-...`) como secret
   da Edge Function — **nunca** no frontend.
4. Criar o canal `#aprovacoes-viagens-f9` e convidar o bot.
5. Coletar o `slack_user_id` de cada diretor (Perfil → Copiar ID do membro) e
   gravar em `diretores.slack_user_id`, para a menção funcionar.

### Mensagem postada

```
:airplane: *Solicitação F9-2026-0042 aguarda sua aprovação no sistema*
<@U01EDUARDO>, há uma pendência para você:

*Destino:* DESTINO EXEMPLO B — HOTEL EXEMPLO B (05/10 a 08/10)
*Equipe:* Equipe Técnica  ·  *Pax:* 3
*Período solicitado:* 03/10 a 09/10  _(difere das datas do evento)_
*Hospedagem:* fora do hotel do pax
*Transporte:* aéreo GRU → CGB  ·  *Locação de carro:* sim
*Solicitante:* Ana Souza — ana@forma.com.br

*Colaboradores*
• Ana Souza — voo LA3210 03/10 08:15 / volta LA3477 09/10 19:40
• Bruno Lima — idem
• Carla Dias — idem

*Custo total:* R$ 8.430,00
   Aéreo R$ 5.100,00 · Hospedagem R$ 2.580,00 · Carro R$ 750,00

_Obs. do solicitante:_ chegar até 12h para montagem

:point_right: <https://…/aprovacao/…|*Abrir no sistema para aprovar ou reprovar*>
_A aprovação é feita dentro do sistema — esta mensagem é apenas um aviso._
```

Implementada na Edge Function `notificar-slack`, que chama `chat.postMessage`. O
`ts` retornado fica registrado no histórico da solicitação.

A operação pode **reenviar o aviso** pelo painel se o diretor demorar — cada
reenvio gera um evento no histórico.

### Por que não usar botões no próprio Slack
Botões interativos (Block Kit) eliminariam um clique, mas exigem endpoint público
de interatividade, verificação de assinatura do Slack e mapeamento confiável
entre usuário do Slack e diretor. Como a decisão envolve dinheiro, preferimos
que ela aconteça atrás de um login, onde a autoria é inequívoca e o diretor vê a
composição completa do custo antes de decidir. O Slack fica com o papel que faz
bem: avisar.

---

## 2. E-mail transacional

**Provedor recomendado: Resend.** 3.000 e-mails/mês no plano gratuito, API
simples, suporte a domínio próprio. Alternativas equivalentes: Postmark (melhor
entregabilidade, pago) ou Amazon SES (mais barato em escala, configuração mais
trabalhosa).

Configurar SPF, DKIM e DMARC no DNS do domínio remetente — sem isso, os e-mails
caem em spam no Gmail corporativo.

### E-mails do sistema

| # | Gatilho | Destinatário | Conteúdo |
|---|---|---|---|
| 1 | Solicitação criada | Solicitante | Protocolo, resumo, link de acompanhamento, aviso de prazo |
| 2 | Solicitação criada | Canal/e-mail da operação | Aviso de nova solicitação + link do painel |
| 3 | Reprovada | Solicitante | Motivo e orientação de próximos passos |
| 4 | **Confirmação final** | Solicitante | Todos os dados de viagem |
| 5 | Cancelada | Solicitante | Motivo |

### E-mail de confirmação final (#4) — estrutura

```
Assunto: [F9-2026-0042] Sua viagem para DESTINO EXEMPLO B está confirmada

Olá, Ana!

Sua solicitação foi aprovada por Diretor Exemplo. Segue tudo confirmado:

DESTINO
  DESTINO EXEMPLO B — HOTEL EXEMPLO B
  Evento: 05/10 a 08/10  ·  Sua estadia: 03/10 a 09/10
  Equipe Técnica · 3 colaboradores

HOSPEDAGEM
  Hotel Fasano Cuiabá (fora do hotel do pax)
  Check-in 03/10 · Check-out 09/10
  Reserva ABC123 — Ana Souza e Carla Dias (duplo)
  Reserva ABC124 — Bruno Lima (single)

VOOS
  Ana Souza
    IDA    LATAM LA3210 · 03/10 08:15 GRU → 09:50 CGB · Localizador XYZ987
    VOLTA  LATAM LA3477 · 09/10 19:40 CGB → 21:15 GRU · Localizador XYZ987
    Bagagem despachada: sim
  [demais colaboradores…]

LOCAÇÃO DE CARRO
  Localiza · SUV compacto
  Retirada 03/10 10:30 — Aeroporto de Cuiabá
  Devolução 09/10 18:00 — Aeroporto de Cuiabá
  Condutor: Bruno Lima

OBSERVAÇÕES
  Chegar até 12h para montagem.

Dúvidas? Responda este e-mail ou fale com a operação.
```

> **Decisão:** o e-mail final **não** traz preços — vai para o solicitante, não
> para o financeiro. Os custos ficam no painel e na exportação. Se quiserem
> preços no e-mail, é uma flag de configuração.

Anexo opcional: um PDF com o mesmo conteúdo, útil para apresentar no check-in.

---

## 3. Segredos e variáveis

| Variável | Onde | Uso |
|---|---|---|
| `SUPABASE_URL` | Frontend (público) | Conexão |
| `SUPABASE_ANON_KEY` | Frontend (público) | Conexão, limitada por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Escrita privilegiada |
| `SLACK_BOT_TOKEN` | Edge Functions | `chat.postMessage` |
| `SLACK_CHANNEL_ID` | Edge Functions | Canal de aprovações |
| `RESEND_API_KEY` | Edge Functions | Envio de e-mail |
| `EMAIL_FROM` | Edge Functions | Remetente |
| `EMAIL_OPERACAO` | Edge Functions | Cópia interna |
| `TURNSTILE_SECRET` | Edge Functions | Validação anti-spam |

Nenhum secret entra no repositório. No GitHub, apenas `SUPABASE_URL` e
`SUPABASE_ANON_KEY` como *repository variables* para o build.
