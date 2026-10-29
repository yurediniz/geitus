import { describe, it, expect } from 'vitest'

import {
  fraseDaConfirmacao,
  MENSAGEM_EMBALAGENS_INTEIRAS,
  MENSAGEM_ETIQUETA_INTEIRA,
  MENSAGEM_UNIDADE_INTEIRA,
  quantidadeDaLinha,
  reembolsoInicial,
  somaDoReembolso,
  valorPrevisto,
} from '@/features/pdv/devolucao'
import type { FormaParaReembolso, LinhaParaDevolucao } from '@/types/pdv'

function linha(parcial: Partial<LinhaParaDevolucao> = {}): LinhaParaDevolucao {
  return {
    ordem: 1,
    nome: 'Ração',
    unidade: 'UN',
    embalagemRotulo: null,
    etiqueta: false,
    fracionada: false,
    precoUnitario: 10 / 3,
    quantidade: 3,
    devolvida: 0,
    disponivel: 3,
    valorLiquido: 10,
    valorDisponivel: 10,
    ...parcial,
  }
}

function forma(parcial: Partial<FormaParaReembolso> & Pick<FormaParaReembolso, 'forma'>): FormaParaReembolso {
  return { recebido: 0, reembolsado: 0, disponivel: 0, ...parcial }
}

describe('devolucao', () => {
  describe('valorPrevisto', () => {
    it('proporcional ao liquido, meio para cima; quem zera a linha leva o resto', () => {
      expect(valorPrevisto(linha(), 1)).toBe(3.33)
      expect(valorPrevisto(linha({ devolvida: 2, disponivel: 1, valorDisponivel: 3.34 }), 1)).toBe(3.34)
      expect(valorPrevisto(linha(), 3)).toBe(10)
      expect(valorPrevisto(linha(), 0)).toBe(0)
    })

    it('nunca passa do que resta na linha', () => {
      const centavosPicados = linha({ quantidade: 6, disponivel: 3, devolvida: 3, valorLiquido: 0.03, valorDisponivel: 0 })
      expect(valorPrevisto(centavosPicados, 1)).toBe(0)
    })
  })

  describe('quantidadeDaLinha', () => {
    it('vazio ou zero nao devolve; inteira em UN; ate o disponivel', () => {
      expect(quantidadeDaLinha(linha(), '')).toEqual({ quantidade: 0 })
      expect(quantidadeDaLinha(linha(), '0')).toEqual({ quantidade: 0 })
      expect(quantidadeDaLinha(linha(), '2')).toEqual({ quantidade: 2 })
      expect(quantidadeDaLinha(linha(), '1,5')).toEqual({ erro: MENSAGEM_UNIDADE_INTEIRA })
      expect(quantidadeDaLinha(linha({ devolvida: 1, disponivel: 2 }), '3')).toEqual({
        erro: 'Só restam 2 UN para devolver nesta linha.',
      })
      expect(quantidadeDaLinha(linha(), 'abc')).toEqual({ erro: 'Informe um número válido.' })
    })

    it('fracionada aceita ate 3 casas; embalagem so inteira; etiqueta so inteira', () => {
      const quilos = linha({ unidade: 'KG', fracionada: true, quantidade: 2.5, disponivel: 2.5 })
      expect(quantidadeDaLinha(quilos, '1,25')).toEqual({ quantidade: 1.25 })
      expect(quantidadeDaLinha(quilos, '1,2345')).toEqual({ erro: 'Use no máximo 3 casas decimais.' })

      const caixas = linha({ unidade: 'CX c/ 12 UN', embalagemRotulo: 'CX c/ 12 UN', fracionada: false })
      expect(quantidadeDaLinha(caixas, '1,5')).toEqual({ erro: MENSAGEM_EMBALAGENS_INTEIRAS })

      const etiqueta = linha({ unidade: 'KG', etiqueta: true, fracionada: true, quantidade: 1.25, disponivel: 1.25 })
      expect(quantidadeDaLinha(etiqueta, '1')).toEqual({ erro: MENSAGEM_ETIQUETA_INTEIRA })
      expect(quantidadeDaLinha(etiqueta, '1.25')).toEqual({ quantidade: 1.25 })
    })
  })

  describe('reembolsoInicial', () => {
    it('com uma forma, ela leva tudo', () => {
      expect(reembolsoInicial([forma({ forma: 'DINHEIRO', disponivel: 30 })], 20)).toEqual({ DINHEIRO: '20.00' })
    })

    it('com varias, distribui na ordem ate o disponivel de cada uma', () => {
      const formas = [forma({ forma: 'DINHEIRO', disponivel: 15 }), forma({ forma: 'PIX', disponivel: 10 })]
      expect(reembolsoInicial(formas, 20)).toEqual({ DINHEIRO: '15.00', PIX: '5.00' })
      expect(reembolsoInicial(formas, 0)).toEqual({ DINHEIRO: '', PIX: '' })
    })

    it('a soma volta em reais, sem erro de ponto flutuante', () => {
      expect(somaDoReembolso({ DINHEIRO: '0.10', PIX: '0.20' })).toBe(0.3)
      expect(somaDoReembolso({ DINHEIRO: '' })).toBe(0)
    })
  })

  describe('fraseDaConfirmacao', () => {
    it('diz o reembolso e o destino de cada linha', () => {
      expect(
        fraseDaConfirmacao(
          [{ forma: 'DINHEIRO', valor: 24.9 }],
          [{ quantidade: 3, unidade: 'UN', destino: 'ESTOQUE' }],
        ).replace(/ /g, ' '),
      ).toBe('Devolver R$ 24,90 em dinheiro e voltar 3 UN ao estoque')
      expect(
        fraseDaConfirmacao(
          [
            { forma: 'DINHEIRO', valor: 10 },
            { forma: 'PIX', valor: 5 },
          ],
          [
            { quantidade: 2, unidade: 'UN', destino: 'ESTOQUE' },
            { quantidade: 1, unidade: 'KG', destino: 'AVARIADO' },
          ],
        ).replace(/ /g, ' '),
      ).toBe('Devolver R$ 10,00 em dinheiro e R$ 5,00 no PIX e voltar 2 UN ao estoque e registrar 1 KG como avariado')
    })

    it('soma as linhas da mesma unidade e destino', () => {
      expect(
        fraseDaConfirmacao(
          [{ forma: 'DINHEIRO', valor: 48.8 }],
          [
            { quantidade: 1, unidade: 'UN', destino: 'ESTOQUE' },
            { quantidade: 1, unidade: 'UN', destino: 'ESTOQUE' },
            { quantidade: 0.5, unidade: 'KG', destino: 'ESTOQUE' },
          ],
        ).replace(/\u00a0/g, ' '),
      ).toBe('Devolver R$ 48,80 em dinheiro e voltar 2 UN e 0,5 KG ao estoque')
    })

    it('sem valor a devolver, so registra', () => {
      expect(fraseDaConfirmacao([], [{ quantidade: 1, unidade: 'UN', destino: 'ESTOQUE' }])).toBe(
        'Registrar a devolução e voltar 1 UN ao estoque',
      )
    })
  })
})
