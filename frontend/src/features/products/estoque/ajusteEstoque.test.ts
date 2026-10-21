import { describe, expect, it } from 'vitest'

import {
  ROTULO_MOTIVO,
  ROTULO_TIPO,
  calcularPrevia,
  mensagemDeSucesso,
  motivoPadrao,
  motivosDoTipo,
  rotuloConfirmar,
  textoDaPrevia,
  textoMovimento,
  validarAjuste,
  type DadosAjuste,
} from '@/features/products/estoque/ajusteEstoque'
import type { MovimentoEstoque } from '@/types/estoque'

const MOVIMENTO: MovimentoEstoque = {
  id: 'mov-1',
  tipo: 'SAIDA',
  motivo: 'PERDA_AVARIA',
  origem: 'AJUSTE_MANUAL',
  quantidade: -2,
  saldoAnterior: 12,
  saldoNovo: 10,
  observacao: 'Caixa amassada',
  usuarioNome: 'Ana Souza',
  criadoEm: '2026-10-21T15:20:00',
}

describe('ajusteEstoque', () => {
  it('motivosDoTipo segue a ordem da spec, sem os motivos do sistema', () => {
    expect(motivosDoTipo('ENTRADA')).toEqual(['COMPRA', 'DEVOLUCAO_CLIENTE', 'OUTRO'])
    expect(motivosDoTipo('SAIDA')).toEqual(['PERDA_AVARIA', 'VENCIDO', 'USO_INTERNO', 'DEVOLUCAO_FORNECEDOR', 'OUTRO'])
    expect(motivosDoTipo('AJUSTE')).toEqual(['CONTAGEM', 'OUTRO'])
  })

  it('motivo pré-selecionado: Compra na entrada, Contagem na contagem e nenhum na saída', () => {
    expect(motivoPadrao('ENTRADA')).toBe('COMPRA')
    expect(motivoPadrao('AJUSTE')).toBe('CONTAGEM')
    expect(motivoPadrao('SAIDA')).toBe('')
  })

  it('rótulos de tipo e motivo em pt-BR', () => {
    expect(ROTULO_TIPO).toEqual({ ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE: 'Contagem' })
    expect(ROTULO_MOTIVO.PERDA_AVARIA).toBe('Perda/avaria')
    expect(ROTULO_MOTIVO.ESTOQUE_INICIAL).toBe('Estoque inicial')
    expect(ROTULO_MOTIVO.CONTAGEM).toBe('Contagem/inventário')
  })

  describe('calcularPrevia', () => {
    const ok = (saldoNovo: number, variacao: number) => ({ saldoNovo, variacao, erro: null, confere: null })

    it('entrada soma, saída subtrai e contagem vai para o contado, com a variação', () => {
      expect(calcularPrevia('ENTRADA', 5, 12, 'UN')).toEqual(ok(17, 5))
      expect(calcularPrevia('SAIDA', 2, 12, 'UN')).toEqual(ok(10, -2))
      expect(calcularPrevia('AJUSTE', 10, 12, 'UN')).toEqual(ok(10, -2))
      expect(calcularPrevia('AJUSTE', 0, 12, 'UN')).toEqual(ok(0, -12))
    })

    it('saída igual ao saldo zera; acima dele é saldo insuficiente', () => {
      expect(calcularPrevia('SAIDA', 3, 3, 'UN')).toEqual(ok(0, -3))
      expect(calcularPrevia('SAIDA', 4, 3, 'UN')).toEqual({
        saldoNovo: null,
        variacao: null,
        erro: 'Saldo insuficiente: há 3 UN.',
        confere: null,
      })
      expect(calcularPrevia('SAIDA', 3.001, 3, 'KG').erro).toBe('Saldo insuficiente: há 3 KG.')
    })

    it('contagem igual ao saldo confere (tom neutro, sem erro)', () => {
      expect(calcularPrevia('AJUSTE', 12, 12, 'UN')).toEqual({
        saldoNovo: null,
        variacao: null,
        erro: null,
        confere: 'A contagem confere com o saldo (12 UN). Não há nada a ajustar.',
      })
    })

    it('conta em milésimos, sem erro de ponto flutuante, e formata com vírgula', () => {
      expect(calcularPrevia('SAIDA', 0.1, 0.3, 'KG')).toEqual(ok(0.2, -0.1))
      expect(calcularPrevia('ENTRADA', 0.2, 0.1, 'KG')).toEqual(ok(0.3, 0.2))
      expect(calcularPrevia('AJUSTE', 2.5, 2.5, 'KG').confere).toBe(
        'A contagem confere com o saldo (2,5 KG). Não há nada a ajustar.',
      )
    })
  })

  it('textoDaPrevia: a contagem mostra também a diferença', () => {
    const previa = (tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE', quantidade: number) =>
      textoDaPrevia(tipo, 12, calcularPrevia(tipo, quantidade, 12, 'UN'), 'UN')
    expect(previa('ENTRADA', 5)).toBe('Saldo: 12 UN → 17 UN')
    expect(previa('SAIDA', 2)).toBe('Saldo: 12 UN → 10 UN')
    expect(previa('AJUSTE', 10)).toBe('Saldo: 12 UN → 10 UN (−2 UN)')
    expect(previa('AJUSTE', 15)).toBe('Saldo: 12 UN → 15 UN (+3 UN)')
    expect(previa('AJUSTE', 0)).toBe('Saldo: 12 UN → 0 UN (−12 UN)')
    expect(previa('AJUSTE', 12)).toBeNull()
    expect(previa('SAIDA', 13)).toBeNull()
  })

  it('rotuloConfirmar diz a ação', () => {
    expect(rotuloConfirmar('ENTRADA', null, 'UN')).toBe('Registrar entrada')
    expect(rotuloConfirmar('SAIDA', calcularPrevia('SAIDA', 2, 12, 'UN'), 'UN')).toBe('Registrar saída')
    expect(rotuloConfirmar('AJUSTE', calcularPrevia('AJUSTE', 10, 12, 'UN'), 'UN')).toBe('Ajustar para 10 UN')
    expect(rotuloConfirmar('AJUSTE', calcularPrevia('AJUSTE', 0, 12, 'UN'), 'UN')).toBe('Zerar estoque')
    expect(rotuloConfirmar('AJUSTE', calcularPrevia('AJUSTE', 12, 12, 'UN'), 'UN')).toBe('Fechar')
    expect(rotuloConfirmar('AJUSTE', null, 'UN')).toBe('Registrar contagem')
  })

  describe('validarAjuste', () => {
    const contexto = { saldo: 12, sigla: 'UN', fracionada: false }
    const saida: DadosAjuste = { tipo: 'SAIDA', quantidade: '2', motivo: 'PERDA_AVARIA', observacao: '' }

    it('dados válidos devolvem a quantidade sem erros', () => {
      expect(validarAjuste(saida, contexto)).toEqual({ quantidade: 2, erros: {}, confere: false })
      expect(validarAjuste({ ...saida, quantidade: '2,5' }, { ...contexto, fracionada: true })).toEqual({
        quantidade: 2.5,
        erros: {},
        confere: false,
      })
    })

    it('quantidade obrigatória, > 0 na entrada e na saída, até 3 casas', () => {
      expect(validarAjuste({ ...saida, quantidade: '' }, contexto).erros).toEqual({ quantidade: 'Informe a quantidade.' })
      expect(validarAjuste({ ...saida, quantidade: '0' }, contexto).erros).toEqual({
        quantidade: 'Informe uma quantidade maior que zero.',
      })
      expect(validarAjuste({ ...saida, quantidade: '-1' }, contexto).erros).toEqual({
        quantidade: 'Informe uma quantidade maior que zero.',
      })
      expect(validarAjuste({ ...saida, quantidade: '1,2345' }, contexto).erros).toEqual({
        quantidade: 'Use no máximo 3 casas decimais.',
      })
    })

    it('na contagem, o saldo contado pode ser zero, mas não negativo nem vazio', () => {
      const contagem: DadosAjuste = { tipo: 'AJUSTE', quantidade: '0', motivo: 'CONTAGEM', observacao: '' }
      expect(validarAjuste(contagem, contexto)).toEqual({ quantidade: 0, erros: {}, confere: false })
      expect(validarAjuste({ ...contagem, quantidade: '' }, contexto).erros).toEqual({
        quantidade: 'Informe o saldo contado.',
      })
      expect(validarAjuste({ ...contagem, quantidade: '-1' }, contexto).erros).toEqual({
        quantidade: 'O saldo contado não pode ser negativo.',
      })
    })

    it('fração só em unidade fracionada', () => {
      expect(validarAjuste({ ...saida, quantidade: '2,5' }, contexto).erros).toEqual({
        quantidade: 'A unidade UN não aceita quantidade fracionada.',
      })
    })

    it('saldo insuficiente barra o envio; contagem igual ao saldo não é erro, mas confere', () => {
      expect(validarAjuste({ ...saida, quantidade: '13' }, contexto).erros).toEqual({
        quantidade: 'Saldo insuficiente: há 12 UN.',
      })
      expect(
        validarAjuste({ tipo: 'AJUSTE', quantidade: '12', motivo: 'CONTAGEM', observacao: '' }, contexto),
      ).toEqual({ quantidade: 12, erros: {}, confere: true })
    })

    it('motivo obrigatório e do tipo; "Outro" exige observação', () => {
      expect(validarAjuste({ ...saida, motivo: '' }, contexto).erros).toEqual({ motivo: 'Selecione o motivo.' })
      expect(validarAjuste({ ...saida, motivo: 'COMPRA' }, contexto).erros).toEqual({ motivo: 'Selecione o motivo.' })
      expect(validarAjuste({ ...saida, motivo: 'OUTRO', observacao: '   ' }, contexto).erros).toEqual({
        observacao: 'Descreva o motivo.',
      })
      expect(validarAjuste({ ...saida, motivo: 'OUTRO', observacao: 'Doação' }, contexto).erros).toEqual({})
    })
  })

  it('mensagemDeSucesso diz o que foi feito e o saldo novo', () => {
    const entrada: MovimentoEstoque = { ...MOVIMENTO, tipo: 'ENTRADA', motivo: 'COMPRA', quantidade: 5, saldoNovo: 17 }
    expect(mensagemDeSucesso(entrada, 'UN')).toBe('Entrada de 5 UN registrada. Saldo: 17 UN.')
    expect(mensagemDeSucesso(MOVIMENTO, 'UN')).toBe('Saída de 2 UN registrada. Saldo: 10 UN.')
    expect(mensagemDeSucesso({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM' }, 'UN')).toBe(
      'Estoque ajustado para 10 UN (−2 UN).',
    )
    expect(
      mensagemDeSucesso({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM', quantidade: 2.5, saldoNovo: 14.5 }, 'KG'),
    ).toBe('Estoque ajustado para 14,5 KG (+2,5 KG).')
    expect(
      mensagemDeSucesso({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM', quantidade: -12, saldoNovo: 0 }, 'UN'),
    ).toBe('Estoque zerado (−12 UN).')
  })

  describe('textoMovimento', () => {
    it('saída: tipo e motivo, quantidade com sinal de menos e a sigla, saldos', () => {
      expect(textoMovimento(MOVIMENTO, 'UN')).toEqual({
        titulo: 'Saída · Perda/avaria',
        quantidade: '−2 UN',
        saldos: '12 → 10',
        saldosFalados: 'saldo de 12 para 10',
      })
    })

    it('entrada com sinal de mais e fração com vírgula; contagem aparece como "Ajuste"', () => {
      expect(
        textoMovimento(
          {
            ...MOVIMENTO,
            tipo: 'ENTRADA',
            motivo: 'ESTOQUE_INICIAL',
            origem: 'CADASTRO',
            quantidade: 2.5,
            saldoAnterior: 0,
            saldoNovo: 2.5,
          },
          'KG',
        ),
      ).toEqual({
        titulo: 'Entrada · Estoque inicial',
        quantidade: '+2,5 KG',
        saldos: '0 → 2,5',
        saldosFalados: 'saldo de 0 para 2,5',
      })
      expect(textoMovimento({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM' }, 'UN').titulo).toBe(
        'Ajuste · Contagem/inventário',
      )
    })
  })
})
