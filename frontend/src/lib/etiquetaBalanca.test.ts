import { describe, expect, it } from 'vitest'

import {
  CONFIGURACAO_ETIQUETA_PADRAO,
  MODELOS_DE_ETIQUETA,
  descreverFormatoEtiqueta,
  exemploDeEtiqueta,
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

  it('codigo 000000 nao e um codigo de produto', () => {
    expect(lerEtiqueta('2000000010000', CONFIGURACAO_ETIQUETA_PADRAO)).toBeNull()
  })

  it('o preenchimento tem de ser zeros', () => {
    const comDoisDePreenchimento: ConfiguracaoEtiqueta = {
      ...CONFIGURACAO_ETIQUETA_PADRAO,
      digitosCodigo: 4,
      digitosPreenchimento: 2,
      casasDecimais: 2,
    }
    expect(lerEtiqueta('2054200001000', comDoisDePreenchimento)).toEqual({ codigoProduto: 542, tipo: 'VALOR', valor: 10 })
    expect(lerEtiqueta('2054250001000', comDoisDePreenchimento)).toBeNull()
    expect(lerEtiqueta('2054205001000', comDoisDePreenchimento)).toBeNull()
  })

  it('valor zero e lido', () => {
    expect(lerEtiqueta('2000542000000', CONFIGURACAO_ETIQUETA_PADRAO)).toEqual({ codigoProduto: 542, tipo: 'VALOR', valor: 0 })
  })

  it('valor com a escala certa, sem erro de ponto flutuante', () => {
    // 0,29 e 1,13 nao saem exatos de uma divisao por 100 em ponto flutuante.
    expect(lerEtiqueta('2005420000294', modelo('toledo-5-0-5-dv'))?.valor).toBe(0.29)
    expect(lerEtiqueta('2000542001130', CONFIGURACAO_ETIQUETA_PADRAO)?.valor).toBe(1.13)
  })

  it('DV invalido no modelo de peso nao e etiqueta', () => {
    expect(lerEtiqueta('2000542007504', modelo('peso-6-5-dv'))).toBeNull()
  })

  it.each(['200054201000a', '2000542 10000', '-200054201000', ' 2000542010000', ''])(
    '"%s" (espaco, sinal ou letra) nao e etiqueta',
    (codigo) => {
      expect(lerEtiqueta(codigo, CONFIGURACAO_ETIQUETA_PADRAO)).toBeNull()
    },
  )

  it('codigo maximo 999999 e 9999 no modelo de 4', () => {
    expect(lerEtiqueta('2999999010000', CONFIGURACAO_ETIQUETA_PADRAO)?.codigoProduto).toBe(999999)
    expect(lerEtiqueta('2999900010005', modelo('toledo-4-0-6-dv'))).toEqual({
      codigoProduto: 9999,
      tipo: 'VALOR',
      valor: 10,
    })
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

describe('exemploDeEtiqueta', () => {
  const digitos = (config: ConfiguracaoEtiqueta) => exemploDeEtiqueta(config)?.grupos.map((grupo) => grupo.digitos)

  it('monta o exemplo do padrao: 2 000542 010000 -> produto 542, R$ 10,00', () => {
    const exemplo = exemploDeEtiqueta(CONFIGURACAO_ETIQUETA_PADRAO)
    expect(exemplo?.grupos).toEqual([
      { digitos: '2', legenda: 'início' },
      { digitos: '000542', legenda: 'código do produto' },
      { digitos: '010000', legenda: 'valor' },
    ])
    expect(exemplo?.significado).toMatch(/^produto 542, R\$\s10,00$/)
  })

  it('com preenchimento e DV, os zeros e o verificador aparecem (e o exemplo e uma etiqueta valida)', () => {
    const config = modelo('toledo-4-0-6-dv')
    expect(exemploDeEtiqueta(config)?.grupos.map((grupo) => grupo.legenda)).toEqual([
      'início',
      'código do produto',
      'zeros',
      'valor',
      'verificador',
    ])
    expect(digitos(config)?.join('')).toBe('2054200010008')
    expect(lerEtiqueta('2054200010008', config)).toEqual({ codigoProduto: 542, tipo: 'VALOR', valor: 10 })
  })

  it('peso mostra kg e, sem caber o maior valor, usa um menor', () => {
    expect(exemploDeEtiqueta(modelo('peso-6-5-dv'))?.significado).toBe('produto 542, 0,750 kg')
    const valor4Digitos3Casas: ConfiguracaoEtiqueta = {
      ...CONFIGURACAO_ETIQUETA_PADRAO,
      digitosInformacao: 4,
      digitosPreenchimento: 2,
    }
    expect(digitos(valor4Digitos3Casas)).toEqual(['2', '000542', '00', '1000'])
    expect(exemploDeEtiqueta(valor4Digitos3Casas)?.significado).toMatch(/R\$\s1,00$/)
  })

  it('formato invalido nao tem exemplo', () => {
    expect(exemploDeEtiqueta({ ...CONFIGURACAO_ETIQUETA_PADRAO, digitosCodigo: 5 })).toBeNull()
    expect(exemploDeEtiqueta({ ...CONFIGURACAO_ETIQUETA_PADRAO, prefixo: '' })).toBeNull()
  })
})
