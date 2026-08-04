# 05 — Telas e Campos

## Mapa de rotas

| Rota | Acesso | Tela |
|---|---|---|
| `/` | Público | Formulário de solicitação |
| `/enviado/:protocolo` | Público | Confirmação de envio |
| `/s/:token` | Público (link) | Acompanhamento somente-leitura |
| `/login` | Público | Login único — direciona conforme o perfil |
| `/admin` | Operação | Lista de solicitações |
| `/admin/solicitacoes/:id` | Operação | Detalhe + preenchimento operacional |
| `/aprovacao` | Diretor | Suas pendências e histórico |
| `/aprovacao/:id` | Diretor | Análise e decisão |
| `/admin/cadastros/edicoes` | Gestor | CRUD de edições |
| `/admin/cadastros/diretores` | Gestor | CRUD de diretores |
| `/admin/cadastros/usuarios` | Gestor | CRUD de usuários admin |

---

## 1. Formulário público (`/`)

Layout em passos (wizard) para não assustar no celular. Barra de progresso no topo.

### Passo 1 — Destino e datas

**Bloco 1 — Para qual destino?** (lista sanfonada)

Cada linha é um destino: nome, hotel e contador (`DESTINO EXEMPLO A · HOTEL EXEMPLO A · 17 datas`).
Busca no topo. Clicar **abre a linha** e revela as datas daquele destino em
**caixas de seleção múltipla**, com atalho *marcar todas / limpar*. O contador
vira `3 de 17` conforme se marca.

Abrir outro destino fecha o anterior e limpa a seleção — uma solicitação cobre
um destino só.

**Bloco 2 — Seu período de hospedagem**

Só aparece depois que pelo menos uma data é marcada. Mostra o resumo das
operações escolhidas e os campos:

| Campo | Tipo | Validação |
|---|---|---|
| Data de entrada | Date picker | Obrigatório. Pré-preenchido com o início da **primeira** operação marcada. |
| Data de saída | Date picker | Obrigatório, > entrada. Pré-preenchido com o fim da **última** operação marcada. |
| Tipo de hospedagem | Cartões | Obrigatório. `Hotel do pax` / `Fora do hotel do pax`. |

> **Por que multisseleção com estadia única:** operações consecutivas do DESTINO EXEMPLO A
> (01–04/10, 04–07/10, 07–10/10) são cobertas por uma hospedagem contínua de
> 01/10 a 10/10, um par de voos e uma diária. Tratar como três viagens separadas
> geraria três reservas onde existe uma. As datas continuam editáveis para quem
> chega antes ou sai depois.

Ao escolher a edição, mostrar um card com as datas oficiais e pré-preencher
entrada/saída com elas. O usuário edita livremente — datas próximas mas
diferentes das do evento são o caso normal e não geram alerta.

### Passo 2 — Transporte

| Campo | Tipo | Validação |
|---|---|---|
| Precisa de transporte? | Radio Sim/Não | Obrigatório. |
| Modal | Radio `Aéreo` / `Rodoviário` | Obrigatório se transporte = Sim. |
| Aeroporto de saída | Select IATA com busca | Obrigatório se modal = Aéreo. |
| Aeroporto de chegada | Select IATA com busca | Obrigatório se modal = Aéreo. |
| Observações de transporte | Textarea (máx. 1000) | Obrigatório. Placeholder: *"Ex.: equipe de vídeo precisa de transfer até Cuiabá e depois entrar no embarque do pax."* |
| Precisa de locação de carro? | Radio Sim/Não | Obrigatório. |
| Observações da locação | Textarea | Obrigatório se locação = Sim. |

### Passo 3 — Equipe e colaboradores

| Campo | Tipo | Validação |
|---|---|---|
| Equipe | Select | Obrigatório. As 13 equipes listadas. |

Bloco repetível **Colaborador N** com botão `+ Adicionar novo colaborador` e
`Remover` (a partir do segundo):

| Campo | Tipo | Validação |
|---|---|---|
| Nome completo | Texto | Obrigatório, mín. 2 palavras. |
| CPF | Texto com máscara `000.000.000-00` | Obrigatório, dígito verificador válido, sem repetir na solicitação. |
| Data de nascimento | Date picker | Obrigatório, idade entre 16 e 90 anos. |

### Passo 4 — Solicitante e aprovador

| Campo | Tipo | Validação |
|---|---|---|
| Seu nome | Texto | Obrigatório. |
| Seu e-mail | E-mail | Obrigatório, formato válido. Para onde vai a confirmação. |
| Seu WhatsApp | Telefone com máscara `(00) 00000-0000` | Obrigatório, 10 ou 11 dígitos. |
| Diretor aprovador | Select | Obrigatório. Os 8 diretores. |

### Passo 5 — Revisão

Resumo de tudo em cards com link "editar" para cada passo. Checkbox de
consentimento LGPD (ver [07](07-seguranca-lgpd.md)). Botão **Enviar solicitação**.

### Comportamento
- Rascunho salvo em `localStorage` a cada alteração (não perde ao recarregar).
- Botão de envio desabilita durante o request; erro exibe mensagem e mantém os dados.
- Proteção anti-spam: honeypot + Cloudflare Turnstile + rate limit por IP na Edge Function.

---

## 2. Confirmação (`/enviado/:protocolo`)

Número do protocolo em destaque, link de acompanhamento (com botão copiar),
aviso de que o e-mail de confirmação foi enviado e o que acontece a seguir.

## 3. Acompanhamento (`/s/:token`)

Somente leitura: protocolo, status com linha do tempo, destino, datas, equipe,
nomes dos colaboradores (**sem CPF**), diretor aprovador. Quando `CONCLUIDA`,
mostra também os dados de viagem — sem preços.

---

## 4. Painel — Lista (`/admin`)

**Filtros:** status (chips), edição/destino, equipe, diretor, período de criação,
busca livre (protocolo, nome, e-mail, CPF).

**Colunas:** Protocolo · Destino · Datas · Equipe · Nº pax · Solicitante ·
Diretor · Status · Custo total · Atualizado em.

**Ações em massa:** exportar CSV/XLSX da seleção.

**Indicadores no topo:** contagem por status, edições com solicitações
pendentes nos próximos 15 dias.

**Sinalizadores por linha:** ⚠ CPF duplicado em outra solicitação da mesma
edição · 🕐 aguardando aprovação há mais de 3 dias.

## 5. Painel — Detalhe (`/admin/solicitacoes/:id`)

### Cabeçalho
Protocolo, status, botões contextuais (`Assumir`, `Enviar para aprovação`,
`Registrar aprovação`, `Enviar confirmação`, `Cancelar`), custo total.

### Aba "Solicitação"
Todos os dados enviados pelo solicitante, em modo leitura, com botão de editar
para o gestor (edição gera evento no log).

### Aba "Operacional"
Um card por colaborador (nome, CPF mascarado `***.456.789-**`, nascimento).
Dentro de cada card:

**Voo de ida / Voo de volta**
| Campo | Tipo |
|---|---|
| Companhia aérea | Texto |
| Número do voo | Texto |
| Aeroporto de origem / destino | IATA |
| Data e hora de partida / chegada | Datetime |
| Localizador | Texto (maiúsculas) |
| Bagagem despachada | Sim/Não |
| Preço | Moeda BRL |
| Observações | Texto |

**Transporte rodoviário**
Empresa · Horário de ida · Local de embarque (ida) · Horário de volta ·
Local de embarque (volta) · Preço · Observações.

**Hospedagem**
Hotel · Tipo de quarto · Dividindo quarto com · Check-in · Check-out ·
Valor da diária · Código da reserva · Observações.

**Locação de carro** (nível da solicitação, não do colaborador)
Locadora · Categoria · Local e data/hora de retirada · Local e data/hora de
devolução · Condutor (select entre os colaboradores) · Preço · Observações.

Rodapé: custo total calculado + campo de sobrescrita manual (só gestor).

**Ferramenta de produtividade:** botão *"Replicar para todos os colaboradores"*
em voo e hospedagem — a maioria das equipes viaja junta no mesmo voo.

### Aba "Aprovação" — somente leitura
A decisão acontece na área do diretor. Aqui a operação só acompanha: se está
aguardando, quem é o responsável, e a decisão registrada com data/hora e
observação. Ações disponíveis no cabeçalho: **Reenviar aviso no Slack** e
**Reabrir para edição**.

### Aba "Histórico"
Timeline de `eventos_solicitacao`: autor, ação, campos alterados, timestamp.

---

## 6. Área do diretor (`/aprovacao`)

### Lista
Pendências no topo, em cartões com borda amarela (a cor de "precisa de você"):
protocolo, destino, equipe, nº de pax, período, solicitante e **custo total em
destaque**. Abaixo, o histórico das já decididas em lista compacta.

Quando não há nada pendente, estado vazio explícito: *"Tudo em dia."*

### Análise e decisão (`/aprovacao/:id`)

1. **Cabeçalho** — protocolo, destino, equipe, pax e custo total em bloco preto.
2. **Composição do custo** — quatro caixas: aéreo, rodoviário, hospedagem, carro.
   É a informação que sustenta a decisão.
3. **O que foi solicitado** — datas da operação, estadia, tipo de hospedagem,
   transporte, locação e observações do solicitante.
4. **Pessoas e viagem** — por colaborador: voos com horários e preço, ônibus,
   hotel e diária. **Sem CPF, sem data de nascimento.**
5. **Decisão** — dois botões (Aprovar / Reprovar). Ao escolher, abre confirmação
   com resumo do que vai acontecer e campo de observação — opcional na aprovação,
   **obrigatório na reprovação**. Só então o botão de confirmar aparece.

A decisão chama `aprovar_solicitacao()` no banco, que valida autoria e status
antes de gravar. Se a operação tiver reaberto a solicitação nesse meio-tempo, a
função recusa com mensagem clara em vez de gravar em cima.
