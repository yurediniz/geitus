import { describe, expect, it } from 'vitest'

import { notaDaOrigemDoCusto, textoDaOrigemNoHistorico } from '@/features/products/origemDoCusto'
import type { CustoOrigem, HistoricoPreco } from '@/types/produto'

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
  entrada: { quantidade: 36, embalagemRotulo: 'CX c/ 18 UN', quantidadeDeEmbalagens: 2 },
  usuarioNome: 'Ana Souza',
  alteradoEm: '2026-10-24T10:00:00',
}

const COMPRA_EM_CAIXAS: CustoOrigem = {
  tipo: 'ENTRADA_COMPRA',
  em: '2026-10-24T10:15:00',
  quantidade: 36,
  embalagemRotulo: 'CX c/ 18 UN',
  quantidadeDeEmbalagens: 2,
}

describe('origemDoCusto', () => {
  describe('notaDaOrigemDoCusto (seção Preços)', () => {
    it('entrada por compra em embalagem: o custo por unidade, a data e a compra', () => {
      expect(semNbsp(notaDaOrigemDoCusto(10, COMPRA_EM_CAIXAS, 'UN'))).toBe(
        'Último custo de entrada: R$ 10,00 por UN, em 24/10/2026 (compra de 2 CX c/ 18 UN).',
      )
    })

    it('entrada por compra com fornecedor: "de {fornecedor}" no fim (spec de Fornecedores e marcas)', () => {
      const comFornecedor: CustoOrigem = { ...COMPRA_EM_CAIXAS, fornecedorNome: 'Distribuidora Sul' }
      expect(semNbsp(notaDaOrigemDoCusto(10, comFornecedor, 'UN'))).toBe(
        'Último custo de entrada: R$ 10,00 por UN, em 24/10/2026 (compra de 2 CX c/ 18 UN), de Distribuidora Sul.',
      )
      const semEmbalagem: CustoOrigem = { ...comFornecedor, embalagemRotulo: null, quantidadeDeEmbalagens: null }
      expect(semNbsp(notaDaOrigemDoCusto(10, semEmbalagem, 'UN'))).toBe(
        'Último custo de entrada: R$ 10,00 por UN, em 24/10/2026, de Distribuidora Sul.',
      )
    })

    it('entrada por compra em unidades: sem a embalagem', () => {
      const emUnidades: CustoOrigem = {
        ...COMPRA_EM_CAIXAS,
        quantidade: 10,
        embalagemRotulo: null,
        quantidadeDeEmbalagens: null,
      }
      expect(semNbsp(notaDaOrigemDoCusto(10, emUnidades, 'UN'))).toBe(
        'Último custo de entrada: R$ 10,00 por UN, em 24/10/2026.',
      )
    })

    it('edição manual: a data', () => {
      const editado: CustoOrigem = {
        tipo: 'EDICAO',
        em: '2026-10-24T11:00:00',
        quantidade: null,
        embalagemRotulo: null,
        quantidadeDeEmbalagens: null,
      }
      expect(notaDaOrigemDoCusto(10.5, editado, 'UN')).toBe('Custo editado manualmente em 24/10/2026.')
    })

    it('origem nula ou ausente (produto anterior à Fase B4) ou sem custo: nenhuma nota', () => {
      expect(notaDaOrigemDoCusto(10, null, 'UN')).toBeNull()
      expect(notaDaOrigemDoCusto(10, undefined, 'UN')).toBeNull()
      expect(notaDaOrigemDoCusto(null, COMPRA_EM_CAIXAS, 'UN')).toBeNull()
    })
  })

  describe('textoDaOrigemNoHistorico', () => {
    it('entrada de compra, com as embalagens quando houve', () => {
      expect(textoDaOrigemNoHistorico(LINHA_CUSTO)).toBe('Entrada de compra (2 CX c/ 18 UN)')
      const emUnidades: HistoricoPreco = {
        ...LINHA_CUSTO,
        entrada: { quantidade: 10, embalagemRotulo: null, quantidadeDeEmbalagens: null },
      }
      expect(textoDaOrigemNoHistorico(emUnidades)).toBe('Entrada de compra')
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, entrada: null })).toBe('Entrada de compra')
    })

    it('edição: "Editado"; preços (sem origem, nula ou ausente): nada', () => {
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, origem: 'EDICAO', entrada: null })).toBe('Editado')
      expect(textoDaOrigemNoHistorico({ ...LINHA_CUSTO, campo: 'PRECO_VENDA', origem: null, entrada: null })).toBeNull()
      const semOrigem = { ...LINHA_CUSTO, campo: 'PRECO_VENDA', origem: undefined, entrada: undefined }
      expect(textoDaOrigemNoHistorico(semOrigem as unknown as HistoricoPreco)).toBeNull()
    })
  })
})
