# 01 — Visão e Requisitos

## 1. Problema

Hoje as solicitações de hospedagem e transporte das equipes do Forma 9 chegam
dispersas (WhatsApp, e-mail, planilha), sem padronização de campos, sem trilha de
aprovação e sem um lugar único onde a operação consolide voos, localizadores e
horários. Isso gera retrabalho, dados faltando na hora da emissão e nenhuma
rastreabilidade de quem aprovou o quê.

## 2. Objetivo

Um sistema web onde:

1. Qualquer colaborador solicite hospedagem/transporte para si e para colegas da
   mesma equipe, em um formulário único e obrigatório;
2. A equipe operacional administre as solicitações em um painel logado,
   preenchendo os dados de viagem (voos, localizadores, ônibus, preços);
3. O diretor responsável aprove ou reprove **dentro do sistema**, em área logada
   própria, sendo avisado da pendência pelo Slack;
4. Ao final, o solicitante receba por e-mail a confirmação consolidada.

## 3. Atores

| Ator | Acesso | O que faz |
|---|---|---|
| **Solicitante** | Público, sem login | Preenche o formulário, recebe o e-mail final. Recebe um link de acompanhamento com token. |
| **Operacional (admin)** | Área logada | Vê todas as solicitações, preenche dados de viagem, dispara Slack, registra aprovação, envia e-mail final. |
| **Gestor (admin)** | Área logada | Tudo do operacional + gerenciar usuários admin, destinos e diretores. |
| **Diretor aprovador** | Área logada própria | Vê as solicitações atribuídas a ele, analisa custo e logística, aprova ou reprova **dentro do sistema**. |

> **Decisão:** o diretor **aprova no sistema**, em uma área logada separada da
> operação. O Slack apenas **avisa** que existe pendência, com link direto.
> Isso garante que a decisão registrada é de fato do diretor (autenticada,
> com carimbo de data/hora), sem depender de transcrição manual.
>
> A área do diretor **não exibe CPF nem data de nascimento** — ele decide com
> base em custo, datas e logística. Ver [07 — Segurança e LGPD](07-seguranca-lgpd.md).

## 4. Requisitos funcionais

### RF-01 — Solicitação
- RF-01.1 Selecionar o destino em uma **lista sanfonada**: clicar no destino
  (ex. `DESTINO EXEMPLO A — HOTEL EXEMPLO A`) abre as datas daquele destino, em **multisseleção**.
  Destinos repetem ao longo do ano — DESTINO EXEMPLO A tem 17 operações — e é comum a
  mesma pessoa cobrir várias seguidas.
- RF-01.1a Uma solicitação pode cobrir **várias operações do mesmo destino**,
  com **um único período de hospedagem** abrangendo todas (entrada = início da
  primeira, saída = fim da última, ambas editáveis). Operações de destinos
  diferentes exigem solicitações separadas — são viagens distintas.
- RF-01.2 Informar **data de entrada** e **data de saída** manualmente. Podem
  divergir das datas do evento; o sistema apenas **avisa** (não bloqueia) quando
  divergirem.
- RF-01.3 Selecionar a **equipe**: Equipe Médica, Equipe Técnica, Diretoria,
  Lojinha da Forma, Fotix, Comercial, Conselho, R.E., Marketing, Monitoria,
  Segurança, Salva-Vidas, DJ.
- RF-01.4 Selecionar o **diretor aprovador** entre os cadastrados na tabela
  `diretores` (8 no momento). Os nomes não são versionados — ficam no banco.
- RF-01.5 Informar dados do **solicitante**: e-mail e WhatsApp.
- RF-01.6 Informar, **por colaborador**: nome completo, CPF, data de nascimento.
- RF-01.7 Adicionar **vários colaboradores** na mesma solicitação
  (botão "Adicionar novo colaborador"). Mínimo 1, sem limite rígido.
- RF-01.8 Indicar **tipo de hospedagem**: hotel do pax ou fora do hotel do pax.
- RF-01.9 Indicar se **precisa de transporte** e, se sim, o modal: aéreo ou
  rodoviário.
- RF-01.10 Se aéreo: informar **aeroporto de saída** e **aeroporto de chegada**.
- RF-01.11 Campo aberto de **observações de transporte** (ex.: "equipe de vídeo
  precisa de transfer até Cuiabá e depois entrar no embarque do pax").
- RF-01.12 Indicar se **precisa de locação de carro**.
- RF-01.13 **Todos os campos são obrigatórios**, com exceção condicional: campos
  de aéreo só são exigidos quando o modal for aéreo; nenhum campo de transporte é
  exigido quando "precisa de transporte" for "não".
- RF-01.14 Ao enviar, o solicitante recebe um número de protocolo e um link de
  acompanhamento somente-leitura.

### RF-02 — Painel administrativo
- RF-02.1 Login com e-mail e senha (ou magic link) restrito a usuários
  cadastrados.
- RF-02.2 Lista de solicitações com filtros por destino, equipe, status, diretor
  aprovador e período; busca por nome/CPF/protocolo.
- RF-02.3 Tela de detalhe da solicitação com todos os dados enviados.
- RF-02.4 Edição dos **dados operacionais por colaborador**:
  - Voo de ida: companhia, número do voo, data/hora de partida e chegada,
    aeroportos, localizador, bagagem, preço;
  - Voo de volta: mesmos campos;
  - Ônibus: horário de ida, horário de volta, empresa, ponto de embarque;
  - Hospedagem: hotel efetivo, tipo de quarto, acompanhante de quarto, check-in,
    check-out, custo da diária;
  - Locação de carro: locadora, categoria, retirada/devolução, custo;
  - Custo total consolidado da solicitação.
- RF-02.5 Botão **"Enviar para aprovação"** → move o status e avisa o diretor
  no Slack, com link direto para a área de aprovação.
- RF-02.6 Acompanhar a decisão do diretor (somente leitura) e poder **reenviar o
  aviso no Slack** ou **reabrir para edição** enquanto estiver pendente.
- RF-02.7 Botão **"Enviar confirmação ao solicitante"** → e-mail com o resumo
  completo. Habilitado apenas quando o status for `aprovado`.
- RF-02.8 **Histórico de eventos** (audit log) por solicitação: quem fez o quê e
  quando.
- RF-02.9 Exportar solicitações em CSV/XLSX para conciliação.
- RF-02.10 Gerenciar cadastros: destinos/edições, equipes, diretores, usuários
  admin.

### RF-03 — Área do diretor aprovador
- RF-03.1 Login com o mesmo formulário da operação; o sistema identifica o perfil
  e direciona para a área correta.
- RF-03.2 Lista com as solicitações **atribuídas a ele**: pendentes em destaque
  no topo, decididas no histórico abaixo.
- RF-03.3 Tela de análise com: composição do custo (aéreo, rodoviário,
  hospedagem, carro), o que foi pedido, e a viagem montada por colaborador.
- RF-03.4 Botões **Aprovar** e **Reprovar**, com confirmação em duas etapas.
  Motivo obrigatório na reprovação, observação opcional na aprovação.
- RF-03.5 O diretor **não vê CPF nem data de nascimento** de ninguém.
- RF-03.6 O diretor só enxerga solicitações onde ele é o aprovador designado, e
  só consegue decidir enquanto o status for `aguardando aprovação`.

## 5. Requisitos não-funcionais

| Código | Requisito |
|---|---|
| RNF-01 | Interface em português do Brasil, responsiva (o formulário será preenchido no celular com frequência). |
| RNF-02 | Formulário público acessível sem login, protegido contra spam (rate limit + honeypot ou Turnstile). |
| RNF-03 | CPF e data de nascimento são dados pessoais: acesso restrito ao admin, mascarados na listagem, nunca em URL. Ver [07 — Segurança e LGPD](07-seguranca-lgpd.md). |
| RNF-04 | Toda alteração no painel gera registro no audit log com autor e timestamp. |
| RNF-05 | Nenhum dado sensível trafega ou é armazenado no frontend além do necessário à sessão. |
| RNF-06 | Fuso horário fixo: `America/Sao_Paulo`. Datas armazenadas como `date`, horários de voo como `timestamptz`. |
| RNF-07 | Backup diário do banco (nativo do Supabase). |

## 6. Fora de escopo (v1)

- Emissão/integração direta com GDS, Amadeus ou consolidadora aérea;
- Aprovação por botão dentro do próprio Slack (a decisão acontece no sistema);
- Login do colaborador solicitante / área "minhas solicitações" com senha;
- Controle de orçamento por centro de custo;
- App mobile nativo.

## 7. Premissas a confirmar

1. **Ano das edições** — a planilha não traz o ano. Assumido 2026.
2. **Domínio e repositório** — qual repositório e qual domínio já configurado?
3. **Slack** — existe um workspace da Forma onde o bot possa postar? Canal único
   de aprovações ou DM para cada diretor?
4. **Remetente de e-mail** — qual domínio será usado para enviar
   (`@formahomolog.com.br`?) e há acesso ao DNS para configurar SPF/DKIM?
5. **Prazo/corte** — existe uma antecedência mínima para solicitar (ex.: 15 dias
   antes do evento)? Se sim, o sistema pode alertar.
6. **Lista de aeroportos** — usar lista fixa IATA dos aeroportos brasileiros ou
   campo de texto livre com autocomplete?
