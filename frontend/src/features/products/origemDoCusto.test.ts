import { describe, expect, it } from 'vitest'

import {
  notaDaOrigemDoCusto,
  quantidadeEmEmbalagens,
  textoDaOrigemNoHistorico,
} from '@/features/products/origemDoCusto'
import type { HistoricoPreco } from '@/types/produto'

/** O "R$" do Intl vem com espaco nao separavel: os textos esperados usam o espaco comum. */
function semNbsp(texto: string | null): string | null {
  return texto === null ? null : texto.replace(/ /g, ' ')
}

const LINHA_CUSTO: HistoricoPreco = {
  campo: 'CUSTO',
  valorAnterior: 9.5,
  valorNovo: 10,
  embalagemRotulo: null,
  origem: 'ENTRADA_COMPRA',
  entrada: { quantidade: 36, embalagemRotulo: 'CX c/ 18 UN' },
  usuarioNome: 'Ana Souza',
  alteradoEm: '2026-10-24T10:00:00',
}

describe('origemDoCusto', () => {
  it('quantidadeEmEmbalagens: as unidades da compra contadas em embalagens', () => {
    expect(quantidadeEmEmbalagens(36, 'CX c/ 18 UN')).toBe('2 CX c/ 18 UN')
    expect(quantidadeEmEmbalagens(51, 'SC c/ 25,5 KG')).toBe('2 SC c/ 25,5 KG')
    expect(quantidadeEmEmbalagens(36, null)).toBeNull()
    expect(quantidadeEmEmbalagens(null, 'CX c/ 18 UN')).toBeNull()
    // Rotulo fora do formato: so o rotulo, sem inventar a conta.
    expect(quantidadeEmEmbalagens(36, 'Caixa grande')).toBe('Caixa grande')
  })

  describe('notaDaOrigemDoCusto (seção Preços)', () => {
    it('entrada por compra em embalagem: o custo, a data e as embalagens', () => {
      const nota = notaDaOrigemDoCusto(10, {
        tipo: 'ENTRADA_COMPRA',
        em: '2026-10-24T10:15:00',
        quantidade: 36,
        embalagemRotulo: 'CX c/ 18 UN',
      })
      expect(semNbsp(nota)).toBe('Último custo de entrada: R$ 10,00 em 24/10/2026 (2 CX c/ 18 UN).')
    })

    it('entrada por compra em unidades: sem a embalagem', () => {
      const nota = notaDaOrigemDoCusto(10, {
        tipo: 'ENTRADA_COMPRA',
        em: '2026-10-24T10:15:00',
        quantidade: 10,
        embalagemRotulo: null,
      })
      expect(semNbsp(nota)).toBe('Último custo de entrada: R$ 10,00 em 24/10/2026.')
    })

    it('edição manual: a data', () => {
      const nota = notaDaOrigemDoCusto(10.5, {
        tipo: 'EDICAO',
        em: '2026-10-24T11:00:00',
        quantidade: null,
        embalagemRotulo: null,
      })
      expect(nota).toBe('Custo editado manualmente em 24/10/2026.')
    })

    it('origem nula (produto anterior à Fase B4) ou sem custo: nenhuma nota', () => {
      expect(notaDaOrigemDoCusto(10, null)).toBeNull()
      expect(
        notaDaOrigemDoCusto(null, { tipo: 'ENTRADA_COMPRA', em: '2026-10-24T10:15:00', quantidade: 1, embalagemRotulo: null }),
      ).toBeNull()
    })
  })

  describe('textoDaOrigemNoHistorico', () => {
    it('entrada de compra, com as embalagens quando houve', () => {
      expect(textoDaOrigemNoHistorico(LINHA_CUSTO)).toBe('Entrada de compra (2 CX c/ 18 UN)')
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, entrada: { quantidade: 10, embalagemRotulo: null } })).toBe(
        'Entrada de compra',
      )
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, entrada: null })).toBe('Entrada de compra')
    })

    it('edição: "Editado"; preços (sem origem): nada', () => {
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, origem: 'EDICAO', entrada: null })).toBe('Editado')
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, campo: 'PRECO_VENDA', origem: null, entrada: null })).toBeNull()
    })
  })
})
