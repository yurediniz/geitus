import { describe, expect, it } from 'vitest'

import {
  MAXIMO_DIGITOS_MOEDA,
  digitosParaValor,
  formatarMoedaDigitando,
  interpretarValorColado,
  valorParaDigitos,
} from '@/lib/moeda'

describe('moeda', () => {
  describe('digitosParaValor (preenche da direita para a esquerda)', () => {
    it.each([
      ['1', '0.01'],
      ['12', '0.12'],
      ['123', '1.23'],
      ['1234', '12.34'],
      ['123456', '1234.56'],
    ])('%s -> %s', (digitos, valor) => {
      expect(digitosParaValor(digitos)).toBe(valor)
    })

    it('zeros a esquerda sao descartados', () => {
      expect(digitosParaValor('0012')).toBe('0.12')
    })

    it('so zeros vale zero; sem digitos fica vazio', () => {
      expect(digitosParaValor('0')).toBe('0.00')
      expect(digitosParaValor('')).toBe('')
    })

    it('ignora o que nao e digito', () => {
      expect(digitosParaValor('12a3')).toBe('1.23')
    })
  })

  describe('valorParaDigitos', () => {
    it.each([
      ['12.34', '1234'],
      ['10', '1000'],
      ['25.9', '2590'],
      ['0.05', '5'],
      ['0.00', ''],
      ['', ''],
      ['abc', ''],
    ])('%s -> "%s"', (valor, digitos) => {
      expect(valorParaDigitos(valor)).toBe(digitos)
    })
  })

  describe('formatarMoedaDigitando', () => {
    it.each([
      ['12.34', '12,34'],
      ['1234.56', '1.234,56'],
      ['25.9', '25,90'],
      ['10', '10,00'],
      ['0.01', '0,01'],
      ['0.00', '0,00'],
      ['1234567890.12', '1.234.567.890,12'],
      ['', ''],
      ['abc', ''],
    ])('%s -> "%s"', (valor, exibido) => {
      expect(formatarMoedaDigitando(valor)).toBe(exibido)
    })
  })

  it('limite de 12 digitos (10 inteiros + 2 decimais, como o NUMERIC(12,2))', () => {
    expect(MAXIMO_DIGITOS_MOEDA).toBe(12)
    expect(formatarMoedaDigitando(digitosParaValor('123456789012'))).toBe('1.234.567.890,12')
  })

  describe('interpretarValorColado (numero, nao sequencia de digitos)', () => {
    it.each([
      ['12,5', '12.50'],
      ['12.50', '12.50'],
      ['1.234,56', '1234.56'],
      ['R$ 9,90', '9.90'],
      ['R$ 1.234,56', '1234.56'],
      ['1,234.56', '1234.56'],
      ['1.234', '1234.00'],
      ['7', '7.00'],
      ['0', '0.00'],
      [' 3,999 ', '4.00'],
    ])('%s -> %s', (texto, valor) => {
      expect(interpretarValorColado(texto)).toBe(valor)
    })

    it.each(['abc', '', 'R$', '-5', '12,5x', '1,2,3,4', '12345678901,00'])('"%s" nao forma valor -> null', (texto) => {
      expect(interpretarValorColado(texto)).toBeNull()
    })
  })
})
