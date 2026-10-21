import { describe, expect, it } from 'vitest'

import {
  ROTULO_MOTIVO,
  ROTULO_TIPO,
  calcularPrevia,
  motivosDoTipo,
  textoMovimento,
  validarAjuste,
  type DadosAjuste,
} from '@/features/products/estoque/ajusteEstoque'
import type { MovimentoEstoque } from '@/types/estoque'

describe('ajusteEstoque', () => {
  it('motivosDoTipo segue a ordem da spec, sem os motivos do sistema', () => {
    expect(motivosDoTipo('ENTRADA')).toEqual(['COMPRA', 'DEVOLUCAO_CLIENTE', 'OUTRO'])
    expect(motivosDoTipo('SAIDA')).toEqual(['PERDA_AVARIA', 'VENCIDO', 'USO_INTERNO', 'DEVOLUCAO_FORNECEDOR', 'OUTRO'])
    expect(motivosDoTipo('AJUSTE')).toEqual(['CONTAGEM', 'OUTRO'])
  })

  it('rótulos de tipo e motivo em pt-BR', () => {
    expect(ROTULO_TIPO).toEqual({ ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE: 'Contar e ajustar para' })
    expect(ROTULO_MOTIVO.PERDA_AVARIA).toBe('Perda/avaria')
    expect(ROTULO_MOTIVO.ESTOQUE_INICIAL).toBe('Estoque inicial')
    expect(ROTULO_MOTIVO.CONTAGEM).toBe('Contagem/inventário')
  })

  describe('calcularPrevia', () => {
    it('entrada soma, saída subtrai e ajuste vai para o contado', () => {
      expect(calcularPrevia('ENTRADA', 5, 12, 'UN')).toEqual({ saldoNovo: 17, erro: null })
      expect(calcularPrevia('SAIDA', 2, 12, 'UN')).toEqual({ saldoNovo: 10, erro: null })
      expect(calcularPrevia('AJUSTE', 10, 12, 'UN')).toEqual({ saldoNovo: 10, erro: null })
      expect(calcularPrevia('AJUSTE', 0, 12, 'UN')).toEqual({ saldoNovo: 0, erro: null })
    })

    it('saída igual ao saldo zera; acima dele é saldo insuficiente', () => {
      expect(calcularPrevia('SAIDA', 3, 3, 'UN')).toEqual({ saldoNovo: 0, erro: null })
      expect(calcularPrevia('SAIDA', 4, 3, 'UN')).toEqual({ saldoNovo: null, erro: 'Saldo insuficiente: há 3 UN.' })
      expect(calcularPrevia('SAIDA', 3.001, 3, 'KG').erro).toBe('Saldo insuficiente: há 3 KG.')
    })

    it('ajuste para o mesmo saldo não muda nada', () => {
      expect(calcularPrevia('AJUSTE', 12, 12, 'UN')).toEqual({ saldoNovo: null, erro: 'O saldo já é 12 UN.' })
    })

    it('conta em milésimos, sem erro de ponto flutuante, e formata com vírgula', () => {
      expect(calcularPrevia('SAIDA', 0.1, 0.3, 'KG')).toEqual({ saldoNovo: 0.2, erro: null })
      expect(calcularPrevia('ENTRADA', 0.2, 0.1, 'KG')).toEqual({ saldoNovo: 0.3, erro: null })
      expect(calcularPrevia('AJUSTE', 2.5, 2.5, 'KG').erro).toBe('O saldo já é 2,5 KG.')
    })
  })

  describe('validarAjuste', () => {
    const contexto = { saldo: 12, sigla: 'UN', fracionada: false }
    const saida: DadosAjuste = { tipo: 'SAIDA', quantidade: '2', motivo: 'PERDA_AVARIA', observacao: '' }

    it('dados válidos devolvem a quantidade sem erros', () => {
      expect(validarAjuste(saida, contexto)).toEqual({ quantidade: 2, erros: {} })
      expect(validarAjuste({ ...saida, quantidade: '2,5' }, { ...contexto, fracionada: true })).toEqual({
        quantidade: 2.5,
        erros: {},
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

    it('no ajuste, o saldo contado pode ser zero, mas não negativo nem vazio', () => {
      const ajuste: DadosAjuste = { tipo: 'AJUSTE', quantidade: '0', motivo: 'CONTAGEM', observacao: '' }
      expect(validarAjuste(ajuste, contexto)).toEqual({ quantidade: 0, erros: {} })
      expect(validarAjuste({ ...ajuste, quantidade: '' }, contexto).erros).toEqual({
        quantidade: 'Informe o saldo contado.',
      })
      expect(validarAjuste({ ...ajuste, quantidade: '-1' }, contexto).erros).toEqual({
        quantidade: 'O saldo contado não pode ser negativo.',
      })
    })

    it('fração só em unidade fracionada', () => {
      expect(validarAjuste({ ...saida, quantidade: '2,5' }, contexto).erros).toEqual({
        quantidade: 'A unidade UN não aceita quantidade fracionada.',
      })
    })

    it('os erros da prévia (saldo insuficiente, mesmo saldo) barram o envio', () => {
      expect(validarAjuste({ ...saida, quantidade: '13' }, contexto).erros).toEqual({
        quantidade: 'Saldo insuficiente: há 12 UN.',
      })
      expect(
        validarAjuste({ tipo: 'AJUSTE', quantidade: '12', motivo: 'CONTAGEM', observacao: '' }, contexto).erros,
      ).toEqual({ quantidade: 'O saldo já é 12 UN.' })
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

  describe('textoMovimento', () => {
    const movimento: MovimentoEstoque = {
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

    it('saída: tipo e motivo, quantidade com sinal de menos e a sigla, saldos', () => {
      expect(textoMovimento(movimento, 'UN')).toEqual({
        titulo: 'Saída · Perda/avaria',
        quantidade: '−2 UN',
        saldos: '12 → 10',
      })
    })

    it('entrada com sinal de mais e fração com vírgula; ajuste aparece como "Ajuste"', () => {
      expect(
        textoMovimento(
          { ...movimento, tipo: 'ENTRADA', motivo: 'ESTOQUE_INICIAL', origem: 'CADASTRO', quantidade: 2.5, saldoAnterior: 0, saldoNovo: 2.5 },
          'KG',
        ),
      ).toEqual({ titulo: 'Entrada · Estoque inicial', quantidade: '+2,5 KG', saldos: '0 → 2,5' })
      expect(textoMovimento({ ...movimento, tipo: 'AJUSTE', motivo: 'CONTAGEM' }, 'UN').titulo).toBe(
        'Ajuste · Contagem/inventário',
      )
    })
  })
})
