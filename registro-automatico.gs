/**
 * Registro automático — para a planilha "Controle de operações".
 *
 * A planilha sozinha não sabe quem marcou uma etapa nem quando: uma caixa
 * marcada é só VERDADEIRO. Este script resolve isso no Google Sheets. Ele faz
 * duas coisas, e nenhuma delas pede nada da equipe:
 *
 *   1. Toda vez que alguém marca ou desmarca uma etapa, grava uma linha na aba
 *      REGISTRO (quando, quem, qual operação, qual etapa) e deixa uma nota na
 *      própria célula — passe o mouse e veja quem fez.
 *   2. Uma vez por dia, de manhã, manda um e-mail com os vouchers vencidos e
 *      os que vencem na semana. Se não houver nenhum, não manda nada.
 *
 * ---------------------------------------------------------------------------
 * COMO INSTALAR (cinco minutos, uma vez só)
 *
 *   1. Suba o arquivo .xlsx para o Google Drive e abra com Google Planilhas.
 *      Depois: Arquivo → Salvar como Planilhas Google.
 *   2. Selecione o intervalo I2:AA47 e vá em Inserir → Caixa de seleção.
 *      As colunas viram caixas de verdade, de um clique só.
 *   3. Extensões → Apps Script. Apague o que estiver lá, cole este arquivo
 *      inteiro e salve.
 *   4. Rode a função `instalar` uma vez (menu suspenso no topo → instalar →
 *      Executar). O Google vai pedir autorização: aceite. É a sua conta
 *      autorizando o script da sua própria planilha.
 *   5. Em AVISAR_EMAIL, abaixo, coloque quem deve receber o resumo diário.
 *
 * Pronto. Não precisa mexer mais.
 * ---------------------------------------------------------------------------
 */

/** Quem recebe o resumo diário dos vouchers. Separe por vírgula. */
var AVISAR_EMAIL = 'bolacha@formahomolog.com.br'

/** Hora do resumo diário (0 a 23). 8 = entre 8h e 9h. */
var HORA_DO_RESUMO = 8

var ABA_OPERACOES = 'OPERAÇÕES'
var ABA_REGISTRO = 'REGISTRO'
var PRIMEIRA_ETAPA = 9 // coluna I
var ULTIMA_ETAPA = 27 // coluna AA

/**
 * Instala os dois gatilhos. Rode uma vez; rodar de novo não duplica nada.
 */
function instalar() {
  var planilha = SpreadsheetApp.getActive()

  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === 'aoEditar' || g.getHandlerFunction() === 'resumoDiario') {
      ScriptApp.deleteTrigger(g)
    }
  })

  // Precisa ser gatilho instalável, não a `onEdit` simples: só o instalável
  // tem permissão para ler quem está editando e para mandar e-mail.
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(planilha).onEdit().create()
  ScriptApp.newTrigger('resumoDiario').timeBased().everyDays(1).atHour(HORA_DO_RESUMO).create()

  garantirRegistro()
  SpreadsheetApp.getUi().alert(
    'Pronto. A partir de agora toda marcação vai para a aba REGISTRO, ' +
      'e o resumo dos vouchers sai por e-mail todo dia por volta das ' +
      HORA_DO_RESUMO + 'h.',
  )
}

/** Cria a aba REGISTRO se ainda não existir. */
function garantirRegistro() {
  var planilha = SpreadsheetApp.getActive()
  var aba = planilha.getSheetByName(ABA_REGISTRO)
  if (aba) return aba

  aba = planilha.insertSheet(ABA_REGISTRO)
  aba.getRange('A1:E1')
    .setValues([['QUANDO', 'QUEM', 'OPERAÇÃO', 'ETAPA', 'O QUE FEZ']])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1f3864')
  aba.setFrozenRows(1)
  aba.setColumnWidth(1, 140)
  aba.setColumnWidth(2, 220)
  aba.setColumnWidth(3, 160)
  aba.setColumnWidth(4, 200)
  aba.setColumnWidth(5, 110)
  return aba
}

/**
 * Roda a cada edição. Ignora tudo que não seja uma caixa de etapa.
 */
function aoEditar(evento) {
  var faixa = evento.range
  var aba = faixa.getSheet()
  if (aba.getName() !== ABA_OPERACOES) return

  var coluna = faixa.getColumn()
  var linha = faixa.getRow()
  if (coluna < PRIMEIRA_ETAPA || coluna > ULTIMA_ETAPA || linha < 2) return
  // Colar um bloco de células de uma vez não é marcação de tarefa; deixa passar.
  if (faixa.getNumRows() > 1 || faixa.getNumColumns() > 1) return

  var marcou = faixa.getValue() === true
  var quem = evento.user && evento.user.getEmail() ? evento.user.getEmail() : 'desconhecido'
  var operacao = aba.getRange(linha, 3).getValue()
  var etapa = aba.getRange(1, coluna).getValue()
  var agora = new Date()

  garantirRegistro().appendRow([
    agora,
    quem,
    operacao,
    etapa,
    marcou ? 'marcou' : 'desmarcou',
  ])

  // A nota na célula é o registro que a pessoa vê sem sair da linha.
  faixa.setNote(
    marcou
      ? 'Marcado por ' + quem + '\nem ' + Utilities.formatDate(agora, fuso(), 'dd/MM/yyyy HH:mm')
      : '',
  )
}

function fuso() {
  return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Sao_Paulo'
}

/**
 * Resumo diário: vouchers vencidos e os que vencem nos próximos 7 dias.
 * Silencioso quando não há nada a cobrar — e-mail que chega todo dia sem
 * novidade é e-mail que ninguém abre.
 */
function resumoDiario() {
  var aba = SpreadsheetApp.getActive().getSheetByName(ABA_OPERACOES)
  if (!aba) return

  var ultima = aba.getLastRow()
  if (ultima < 2) return

  var dados = aba.getRange(2, 1, ultima - 1, ULTIMA_ETAPA).getValues()
  // O voucher é a 12ª etapa: coluna T, índice 19 no vetor lido a partir de A.
  var VOUCHER = PRIMEIRA_ETAPA - 1 + 11
  var hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  var vencidos = []
  var chegando = []

  dados.forEach(function (linha) {
    if (linha[VOUCHER] === true) return // voucher já enviado
    if (!(linha[0] instanceof Date)) return

    var prazo = new Date(linha[0])
    prazo.setDate(prazo.getDate() - 7)
    prazo.setHours(0, 0, 0, 0)

    var dias = Math.round((prazo - hoje) / 86400000)
    var texto =
      linha[2] +
      ' (' +
      Utilities.formatDate(linha[0], fuso(), 'dd/MM') +
      ', ' +
      linha[3] +
      ') — voucher '

    if (dias < 0) vencidos.push(texto + 'venceu há ' + -dias + ' dia(s)')
    else if (dias <= 7) chegando.push(texto + (dias === 0 ? 'vence hoje' : 'vence em ' + dias + ' dia(s)'))
  })

  if (!vencidos.length && !chegando.length) return

  var corpo = ''
  if (vencidos.length) corpo += 'ATRASADOS\n' + vencidos.join('\n') + '\n\n'
  if (chegando.length) corpo += 'VENCEM ESTA SEMANA\n' + chegando.join('\n') + '\n\n'
  corpo += SpreadsheetApp.getActive().getUrl()

  MailApp.sendEmail({
    to: AVISAR_EMAIL,
    subject:
      'Vouchers: ' + vencidos.length + ' atrasado(s), ' + chegando.length + ' vencendo',
    body: corpo,
  })
}
