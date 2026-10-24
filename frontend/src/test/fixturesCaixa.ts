/**
 * Dados de teste do modulo Caixa. So dados: os mocks de servico ficam em cada
 * arquivo de teste.
 */
import type { MovimentoDeCaixa, PontoDeCaixa, SessaoDeCaixa } from '@/types/caixa'

export const ABERTA_AS_0802 = '2026-10-24T08:02:00-03:00'

export function movimentoDeTeste(parcial: Partial<MovimentoDeCaixa> = {}): MovimentoDeCaixa {
  return {
    id: 'mov-abertura',
    tipo: 'ABERTURA',
    valor: 150,
    motivo: null,
    usuarioNome: 'Ana Souza',
    criadoEm: ABERTA_AS_0802,
    ...parcial,
  }
}

/** Sessao ABERTA no Caixa 1 por Ana Souza as 08:02, com fundo de R$ 150,00 e R$ 320,00 na gaveta. */
export function sessaoDeTeste(parcial: Partial<SessaoDeCaixa> = {}): SessaoDeCaixa {
  return {
    id: 's-ana',
    ponto: { id: 'p-1', nome: 'Caixa 1' },
    status: 'ABERTA',
    abertaPorNome: 'Ana Souza',
    abertaEm: ABERTA_AS_0802,
    fundoTroco: 150,
    dinheiroNaGaveta: 320,
    fechamentoCego: false,
    valorEsperado: null,
    valorContado: null,
    diferenca: null,
    contadaPorNome: null,
    contadaEm: null,
    justificativa: null,
    fechadaPorNome: null,
    fechadaEm: null,
    movimentos: [
      movimentoDeTeste({ id: 'mov-suprimento', tipo: 'SUPRIMENTO', valor: 170, motivo: 'Reforço de troco', criadoEm: '2026-10-24T10:15:00-03:00' }),
      movimentoDeTeste(),
    ],
    podeOperar: true,
    ...parcial,
  }
}

export function pontoDeTeste(parcial: Partial<PontoDeCaixa> = {}): PontoDeCaixa {
  return { id: 'p-1', nome: 'Caixa 1', ativo: true, ultimoFundoTroco: 150, situacao: null, ...parcial }
}
