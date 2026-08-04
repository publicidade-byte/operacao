# 04 — Fluxo e Estados

## Máquina de estados

```
                      ┌─────────────┐
   solicitante ──────▶│  RECEBIDA   │
   envia formulário   └──────┬──────┘
                            │ operacional assume
                     ┌──────▼──────────────┐
                     │  EM_PREENCHIMENTO   │◀────────┐
                     └──────┬──────────────┘         │
                            │ "Enviar para aprovação"│ ajustes
                            │ → aviso no Slack       │
                   ┌────────▼─────────────┐          │
                   │ AGUARDANDO_APROVACAO │          │
                   └───┬──────────────┬───┘          │
    diretor aprova     │              │  diretor reprova
    NO SISTEMA         │              │  NO SISTEMA
                ┌──────▼───┐     ┌────▼──────┐       │
                │ APROVADA │     │ REPROVADA ├───────┘
                └──────┬───┘     └───────────┘
                       │ "Enviar confirmação"
                       │ → e-mail ao solicitante
                 ┌─────▼──────┐
                 │ CONCLUIDA  │
                 └────────────┘

   Qualquer estado (exceto CONCLUIDA) ──▶ CANCELADA
```

### Transições permitidas

| De | Para | Quem | Efeito colateral |
|---|---|---|---|
| — | `RECEBIDA` | Solicitante | E-mail "recebemos sua solicitação" com protocolo e link |
| `RECEBIDA` | `EM_PREENCHIMENTO` | Operacional | Registra responsável |
| `EM_PREENCHIMENTO` | `AGUARDANDO_APROVACAO` | Operacional | Avisa o diretor no Slack com link para a área de aprovação |
| `AGUARDANDO_APROVACAO` | `APROVADA` | **Diretor, no sistema** | `aprovar_solicitacao()` grava `aprovacoes` e o evento |
| `AGUARDANDO_APROVACAO` | `REPROVADA` | **Diretor, no sistema** | Idem, com motivo obrigatório |
| `REPROVADA` | `EM_PREENCHIMENTO` | Operacional | Reabre para ajuste |
| `APROVADA` | `CONCLUIDA` | Operacional | E-mail final com todos os dados de viagem |
| `APROVADA` | `EM_PREENCHIMENTO` | Gestor | Correção pós-aprovação; exige nova aprovação |
| qualquer ≠ `CONCLUIDA` | `CANCELADA` | Operacional | Motivo obrigatório; e-mail ao solicitante |

Toda transição grava um registro em `eventos_solicitacao`.

## Regras de negócio

- **RN-01** — `data_saida` deve ser posterior a `data_entrada`.
- **RN-02** — `data_entrada`/`data_saida` são preenchidas automaticamente com as
  datas da edição ao selecionar o destino, e o usuário edita livremente. Datas
  diferentes das do evento são o caso normal (montagem, desmontagem, chegada
  antecipada) e **não** geram aviso nem sinalização — são apenas exibidas ao lado
  das datas do evento no painel.
- **RN-03** — CPF validado por dígito verificador; único dentro da mesma
  solicitação. CPF repetido em **outra** solicitação para a **mesma edição** gera
  alerta no admin (possível duplicidade), não bloqueia.
- **RN-04** — Se `precisa_transporte = false`, os campos de modal e aeroporto
  ficam ocultos e não são exigidos.
- **RN-05** — Se `modal = RODOVIARIO`, aeroportos ficam ocultos.
- **RN-06** — "Enviar para aprovação" só habilita quando existir, para cada
  colaborador, o mínimo operacional preenchido: hospedagem com hotel e datas e,
  se houver transporte, ao menos o custo estimado. O sistema mostra a checklist
  do que falta.
- **RN-07** — "Enviar confirmação ao solicitante" só habilita em `APROVADA`.
- **RN-08** — Solicitação em `AGUARDANDO_APROVACAO` fica **travada para edição**;
  para alterar, o operacional volta o status para `EM_PREENCHIMENTO` (registrado
  no log). Isso evita que os números mudem debaixo do diretor enquanto ele avalia.
- **RN-10** — Só o diretor **designado na solicitação** consegue decidir, e só
  enquanto o status for `AGUARDANDO_APROVACAO`. A regra é imposta no banco pela
  função `aprovar_solicitacao()`, não no frontend.
- **RN-11** — Reprovação exige motivo. A função rejeita observação vazia.
- **RN-09** — `custo_total` é recalculado automaticamente pela soma de voos +
  rodoviário + hospedagem + locação, mas pode ser sobrescrito manualmente pelo
  gestor.

## Fluxo narrado (caminho feliz)

1. **Ana**, da Equipe Técnica, acessa o site e escolhe a edição
   `DESTINO EXEMPLO B — HOTEL EXEMPLO B — 05/10 a 08/10`.
2. As datas vêm preenchidas com 05/10 e 08/10; ela ajusta para entrada 03/10 e
   saída 09/10, pois chega antes para a montagem.
3. Marca: equipe **Equipe Técnica**, hospedagem **fora do hotel do pax**,
   transporte **aéreo** (GRU → CGB), observação *"chegar até 12h para montagem"*,
   locação de carro **sim**.
4. Adiciona 3 colaboradores (nome, CPF, nascimento). Informa o próprio e-mail e
   WhatsApp.
5. Seleciona **Diretor Exemplo** como diretor aprovador e envia.
6. Recebe o protocolo `F9-2026-0042` e um e-mail com o link de acompanhamento.
7. **Operação** abre a solicitação no painel, cota, e preenche voos,
   localizadores, hotel e locadora. Custo total: R$ 8.430,00.
8. Clica em **Enviar para aprovação** → o bot posta no `#aprovacoes-viagens`
   marcando `@Diretor Exemplo`: *"há uma pendência para você"* + link.
9. **Eduardo abre o link**, faz login e cai direto na solicitação. Vê a
   composição do custo, a viagem de cada um e o que foi pedido — sem CPF.
10. Clica em **Aprovar**, confirma. Status → `APROVADA`, com data/hora e autoria
    registradas pelo banco.
11. Operação clica em **Enviar confirmação** → Ana recebe o e-mail com voos,
    localizadores, hotel e dados do carro. Status → `CONCLUIDA`.
