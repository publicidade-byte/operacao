# Montar o controle da operação no Notion

Passo a passo para sair do zero até o painel funcionando. Uns 20 minutos.

O arquivo `notion-operacoes.csv` traz as 46 operações de setembro a dezembro
com as 19 etapas já como colunas, todas desmarcadas. A planilha original não
trazia o ano — foi assumido **2026**.

---

## 1. Importar

Numa página nova do Notion: `/database` → **Table view** → menu `···` no canto
superior → **Merge with CSV** → escolha `notion-operacoes.csv`.

O Notion cria as colunas sozinho, mas costuma errar dois tipos. Corrija antes
de seguir, clicando no cabeçalho de cada uma:

- `Início` e `Fim` → tipo **Date**
- as 19 colunas de etapa → tipo **Checkbox**

`Operação` é o título. `Destino` e `Hotel` ficam como texto — deixe `Destino`
como **Select**, é ele que agrupa o quadro depois.

---

## 2. As quatro colunas que se calculam sozinhas

Crie cada uma como propriedade do tipo **Formula** e cole o conteúdo.

### `Voucher até` — o prazo de uma semana antes

```
dateSubtract(prop("Início"), 7, "days")
```

### `% Pronto` — quanto da operação já foi feito

```
(if(prop("Conferência de cadastro"), 1, 0) + if(prop("Ficha técnica solicitada"), 1, 0) + if(prop("Ficha técnica respondida"), 1, 0) + if(prop("Mapa de quartos conferido"), 1, 0) + if(prop("Cardápio recebido"), 1, 0) + if(prop("Hosp. de equipe antes"), 1, 0) + if(prop("Casos da saúde"), 1, 0) + if(prop("Room list liberado"), 1, 0) + if(prop("Template comissão"), 1, 0) + if(prop("Logística dos transportes"), 1, 0) + if(prop("Cadastro dos transportes"), 1, 0) + if(prop("Voucher"), 1, 0) + if(prop("Envio das listas de transp."), 1, 0) + if(prop("Manutenção room list"), 1, 0) + if(prop("Rooming PRFs"), 1, 0) + if(prop("Rooming extras"), 1, 0) + if(prop("Enviado para o hotel"), 1, 0) + if(prop("No show"), 1, 0) + if(prop("Fechamento"), 1, 0)) / 19
```

Depois de salvar, clique na propriedade → **Show as** → **Bar**. Vira uma barra
de progresso em vez de um número.

### `Alerta` — cobra o voucher e cala quando ele sai

```
if(prop("Voucher"), "", if(dateBetween(prop("Voucher até"), now(), "days") < 0, "🔴 Voucher atrasado", if(dateBetween(prop("Voucher até"), now(), "days") <= 7, "🟡 Voucher em " + format(dateBetween(prop("Voucher até"), now(), "days")) + " dias", "")))
```

### `Status` — a fase em que a operação está

```
if(prop("% Pronto") == 1, "✅ Concluída", if(prop("Voucher"), "📤 Voucher enviado", if(now() > prop("Fim"), "⚠️ Atrasada", "🔧 Em preparação")))
```

> As fórmulas seguem a sintaxe do Notion 2.0. Não consegui testá-las rodando —
> não tenho acesso à sua conta. Se alguma reclamar, o erro quase sempre é o
> nome de uma propriedade que o Notion importou diferente (acento, ponto final
> em "Envio das listas de transp."). Confira o nome exato e ajuste dentro do
> `prop("...")`.

---

## 3. As vistas — é aqui que o Notion ganha da planilha

Crie cada uma pelo `+` ao lado do nome da vista atual.

**Quadro por status** (Board, agrupado por `Status`) — a visão do dia a dia.
Cada operação é um cartão que anda sozinho de coluna conforme as etapas são
marcadas.

**Calendário** (Calendar, por `Início`) — o mês inteiro de operações de relance.

**Linha do tempo** (Timeline, `Início` até `Fim`) — mostra as sobreposições:
onde duas operações caem na mesma semana e o time vai apertar.

**Cobrança** (Table, filtro `Alerta` **is not empty**, ordenado por `Voucher
até`) — a lista curta do que precisa sair agora. Deixe essa como primeira vista.

Em qualquer vista: `···` → **Properties** → esconda as 19 colunas de etapa.
Elas poluem a tabela e continuam acessíveis abrindo a operação.

---

## 4. Dar acesso ao time

Botão **Share** no canto superior direito → **Invite** → e-mail de cada pessoa
→ permissão **Can edit**.

Cuidado com o custo: editor no Notion consome assento pago. No plano Plus são
cerca de US$ 10 por pessoa por mês. Convidado como **Can comment** é gratuito,
mas quem só comenta não consegue marcar as etapas — não serve aqui.

Se todo mundo tem e-mail do mesmo domínio, o Notion permite liberar por
domínio em vez de convidar um a um.

---

## 5. Automação (opcional)

Em `···` → **Automations**, dá para criar:

- **Todo dia, se `Alerta` não estiver vazio → enviar Slack/e-mail.** É o
  lembrete do voucher, sem ninguém precisar olhar.
- **Quando `Voucher` for marcado → definir `Status`.** Desnecessário se você
  usou a fórmula acima; ela já faz isso.

Automações ficam nos planos pagos.

---

## O que o Notion resolve e a planilha não

- Registra sozinho quem marcou cada etapa e quando (histórico de cada página).
- Cada operação vira uma página: comentário, anexo, room list, print do hotel.
- Quadro, calendário e linha do tempo sobre os mesmos dados, sem duplicar nada.
- Funciona bem no celular.

## O que a planilha faz melhor

- Custa zero.
- Ver as 46 operações e as 19 etapas de uma vez, na mesma tela. No Notion
  isso fica escondido dentro de cada página.
- Exportar e fazer conta em cima.
