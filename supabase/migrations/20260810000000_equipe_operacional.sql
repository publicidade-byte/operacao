-- Equipe "Operacional".
--
-- Faltava na lista, então quem é da operação vinha marcando "Outros" e
-- escrevendo Operacional no campo livre — o que funciona, mas deixa a
-- equipe fora do filtro e espalha grafias diferentes da mesma coisa.
--
-- ATENÇÃO: `alter type ... add value` não pode ser usado na MESMA transação
-- em que o valor é referenciado. Por isso este arquivo só adiciona o valor;
-- qualquer UPDATE que use 'OPERACIONAL' precisa vir num arquivo depois.

alter type equipe_tipo add value if not exists 'OPERACIONAL';
