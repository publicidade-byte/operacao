/**
 * Modo demonstração — permite ver o formulário público sem Supabase configurado.
 *
 * Ativa APENAS quando VITE_DEMO=1 (rode com `npm run demo`).
 * Nunca é ligado no build de produção: o workflow do GitHub Actions não define
 * essa variável, então `ehDemo` é sempre false no site publicado.
 *
 * Os dados abaixo são FICTÍCIOS de propósito. O calendário real de operações
 * vive no banco (tabela `edicoes`) e não é versionado — ver README.
 */
import type { Diretor, Edicao } from './types'

export const ehDemo = import.meta.env.VITE_DEMO === '1'

const ed = (
  codigo: string,
  destino: string,
  hotel: string,
  data_inicio: string,
  data_fim: string,
  noites: number,
): Edicao => ({
  id: codigo,
  codigo,
  destino,
  hotel,
  data_inicio,
  data_fim,
  noites,
  ativa: true,
})

/**
 * Amostra fictícia. Inclui um destino com várias datas (DEMO ALFA), que é o
 * caso que a seleção múltipla resolve.
 */
export const EDICOES_DEMO: Edicao[] = [
  ed('DEMO-01', 'DEMO ALFA', 'HOTEL EXEMPLO A', '2026-10-01', '2026-10-04', 4),
  ed('DEMO-02', 'DEMO ALFA', 'HOTEL EXEMPLO A', '2026-10-04', '2026-10-07', 4),
  ed('DEMO-03', 'DEMO ALFA', 'HOTEL EXEMPLO A', '2026-10-07', '2026-10-10', 4),
  ed('DEMO-04', 'DEMO ALFA', 'HOTEL EXEMPLO A', '2026-10-10', '2026-10-13', 4),
  ed('DEMO-05', 'DEMO BRAVO', 'HOTEL EXEMPLO B', '2026-10-05', '2026-10-08', 4),
  ed('DEMO-06', 'DEMO BRAVO', 'HOTEL EXEMPLO B', '2026-11-12', '2026-11-15', 4),
  ed('DEMO-07', 'DEMO CHARLIE', 'RESORT EXEMPLO C', '2026-11-03', '2026-11-06', 4),
  ed('DEMO-08', 'DEMO DELTA', 'POUSADA EXEMPLO D', '2026-12-08', '2026-12-13', 6),
]

/** Aprovadores fictícios. Os reais ficam na tabela `diretores`. */
export const DIRETORES_DEMO: Diretor[] = [
  'Diretor Exemplo 1',
  'Diretor Exemplo 2',
  'Diretor Exemplo 3',
].map((nome, i) => ({
  id: `demo-${i}`,
  nome,
  email: null,
  slack_user_id: null,
  ativo: true,
  ordem: i + 1,
}))
