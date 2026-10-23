import { describe, expect, it } from 'vitest'

import {
  CONFIGURACAO_ETIQUETA_PADRAO,
  MODELOS_DE_ETIQUETA,
  descreverFormatoEtiqueta,
  lerEtiqueta,
  modeloDaConfiguracao,
  pareceEtiqueta,
  totalDigitosEtiqueta,
} from '@/lib/etiquetaBalanca'
import type { ConfiguracaoEtiqueta } from '@/types/etiquetaBalanca'

function modelo(id: string): ConfiguracaoEtiqueta {
  const encontrado = MODELOS_DE_ETIQUETA.find((m) => m.id === id)
  if (!encontrado) {
    throw new Error(`modelo ${id} nao existe`)
  }
  return encontrado.configuracao
}

// Mesmos casos do LeitorEtiquetaBalancaTest do backend.
describe('lerEtiqueta', () => {
  it('exemplo real do usuario: 2000542010000 -> produto 542, R$ 10,00', () => {
    expect(lerEtiqueta('2000542010000', CONFIGURACAO_ETIQUETA_PADRAO)).toEqual({
      codigoProduto: 542,
      tipo: 'VALOR',
      valor: 10,
    })
  })

  it('modelo Toledo codigo 4 + 0 + valor 6 (2 casas) + DV', () => {
    expect(lerEtiqueta('2054200010008', modelo('toledo-4-0-6-dv'))).toEqual({
      codigoProduto: 542,
      tipo: 'VALOR',
      valor: 10,
    })
  })

  it('modelo Toledo codigo 5 + 0 + valor 5 (2 casas) + DV', () => {
    expect(lerEtiqueta('2005420010002', modelo('toledo-5-0-5-dv'))).toEqual({
      codigoProduto: 542,
      tipo: 'VALOR',
      valor: 10,
    })
  })

  it('modelo peso codigo 6 + peso 5 (3 casas) + DV', () => {
    expect(lerEtiqueta('2000542007503', modelo('peso-6-5-dv'))).toEqual({
      codigoProduto: 542,
      tipo: 'PESO',
      valor: 0.75,
    })
  })

  it.each(['200054201000', '20005420100000'])('%s (12 ou 14 digitos) nao e etiqueta', (codigo) => {
    expect(lerEtiqueta(codigo, CONFIGURACAO_ETIQUETA_PADRAO)).toBeNull()
  })

  it('prefixo diferente nao e etiqueta', () => {
    expect(lerEtiqueta('7891000315507', CONFIGURACAO_ETIQUETA_PADRAO)).toBeNull()
  })

  it('conteudo nao numerico nao e etiqueta', () => {
    expect(lerEtiqueta('2000542O10000', CONFIGURACAO_ETIQUETA_PADRAO)).toBeNull()
  })

  it('digito verificador invalido nao e etiqueta', () => {
    expect(lerEtiqueta('2054200010009', modelo('toledo-4-0-6-dv'))).toBeNull()
  })

  it('prefixo de 2 digitos', () => {
    const config: ConfiguracaoEtiqueta = { ...CONFIGURACAO_ETIQUETA_PADRAO, prefixo: '20', digitosInformacao: 5 }
    expect(lerEtiqueta('2000054201000', config)).toEqual({ codigoProduto: 542, tipo: 'VALOR', valor: 1 })
  })
})

describe('modelos prontos', () => {
  it('sao os 4 da spec, com o padrao primeiro', () => {
    expect(MODELOS_DE_ETIQUETA).toHaveLength(4)
    expect(MODELOS_DE_ETIQUETA[0]?.configuracao).toEqual(CONFIGURACAO_ETIQUETA_PADRAO)
  })

  it.each(MODELOS_DE_ETIQUETA.map((m) => [m.nome, m.configuracao] as const))('%s soma 13 digitos', (_nome, config) => {
    expect(totalDigitosEtiqueta(config)).toBe(13)
  })

  it('reconhece o modelo de uma configuracao, ou nenhum (personalizado)', () => {
    expect(modeloDaConfiguracao(CONFIGURACAO_ETIQUETA_PADRAO)?.id).toBe('toledo-6-6')
    expect(modeloDaConfiguracao({ ...CONFIGURACAO_ETIQUETA_PADRAO, prefixo: '20', digitosInformacao: 5 })).toBeNull()
  })
})

describe('descreverFormatoEtiqueta', () => {
  it('descreve o padrao como na spec', () => {
    expect(descreverFormatoEtiqueta(CONFIGURACAO_ETIQUETA_PADRAO)).toBe(
      '2 · CCCCCC · VVVVVV (R$, 3 casas) · sem dígito verificador',
    )
  })

  it('mostra o preenchimento, o peso e o digito verificador', () => {
    expect(descreverFormatoEtiqueta(modelo('toledo-4-0-6-dv'))).toBe(
      '2 · CCCC · 0 · VVVVVV (R$, 2 casas) · com dígito verificador',
    )
    expect(descreverFormatoEtiqueta(modelo('peso-6-5-dv'))).toBe(
      '2 · CCCCCC · PPPPP (kg, 3 casas) · com dígito verificador',
    )
  })
})

describe('pareceEtiqueta', () => {
  it('13 digitos com o prefixo parece etiqueta, mesmo que nao leia um codigo valido', () => {
    expect(pareceEtiqueta('2000542010000', CONFIGURACAO_ETIQUETA_PADRAO)).toBe(true)
    expect(pareceEtiqueta('2000000010000', CONFIGURACAO_ETIQUETA_PADRAO)).toBe(true)
  })

  it('EAN comum, outro tamanho ou sem configuracao nao parece etiqueta', () => {
    expect(pareceEtiqueta('7891000315507', CONFIGURACAO_ETIQUETA_PADRAO)).toBe(false)
    expect(pareceEtiqueta('20005420100', CONFIGURACAO_ETIQUETA_PADRAO)).toBe(false)
    expect(pareceEtiqueta('2000542010000', null)).toBe(false)
  })
})
