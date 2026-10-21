import { describe, expect, it } from 'vitest'

import {
  ABAS_PRODUTO,
  CAMPOS_POR_ABA,
  MENSAGEM_CODIGO_REPETIDO,
  MENSAGEM_DIGITO_INVALIDO,
  MENSAGEM_LIMITE_CODIGOS,
  avaliarNovoCodigo,
  calcularMargemMarkup,
  formatosDoProduto,
  idDoCampo,
  montarRequest,
  nomeCurtoEfetivo,
  primeiroCampoComErro,
  produtoSchema,
  valoresDoProduto,
  valoresIniciais,
  valoresParaCadastrarOutro,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { CX, produtoAtivo, resumo } from '@/test/fixturesProduto'

describe('produtoFormulario', () => {
  it('todo campo do formulario esta em alguma aba; so os codigos de barras estao em duas (Geral e Codigos)', () => {
    const campos = ABAS_PRODUTO.flatMap((aba) => CAMPOS_POR_ABA[aba])
    expect([...new Set(campos)].sort()).toEqual(Object.keys(valoresIniciais()).sort())
    const repetidos = campos.filter((campo, indice) => campos.indexOf(campo) !== indice)
    expect(repetidos.sort()).toEqual(['codigoPendente', 'codigosBarras'])
    for (const campo of repetidos) {
      expect(CAMPOS_POR_ABA.geral).toContain(campo)
      expect(CAMPOS_POR_ABA.codigos).toContain(campo)
    }
  })

  it('preco de venda fica na aba Geral (cadastro rapido), nao em Precos', () => {
    expect(CAMPOS_POR_ABA.geral.slice(0, 6)).toEqual([
      'nome',
      'nomeCurto',
      'unidadeId',
      'precoVenda',
      'codigoPendente',
      'codigosBarras',
    ])
    expect(CAMPOS_POR_ABA.precos).not.toContain('precoVenda')
  })

  it('primeiroCampoComErro segue a ordem das abas e dos campos', () => {
    const comErro = new Set<keyof ProdutoFormValues>(['estoqueMaximo', 'custo', 'sku'])
    expect(primeiroCampoComErro((campo) => comErro.has(campo))).toEqual({ aba: 'precos', campo: 'custo' })
    expect(primeiroCampoComErro((campo) => campo === 'precoVenda')).toEqual({ aba: 'geral', campo: 'precoVenda' })
    expect(primeiroCampoComErro(() => false)).toBeNull()
  })

  it('primeiroCampoComErro fica na aba atual quando ela tambem mostra o campo', () => {
    const codigos = (campo: keyof ProdutoFormValues) => campo === 'codigosBarras'
    expect(primeiroCampoComErro(codigos)).toEqual({ aba: 'geral', campo: 'codigosBarras' })
    expect(primeiroCampoComErro(codigos, 'codigos')).toEqual({ aba: 'codigos', campo: 'codigosBarras' })
    expect(primeiroCampoComErro(codigos, 'precos')).toEqual({ aba: 'geral', campo: 'codigosBarras' })
  })

  it('idDoCampo: o texto pendente e focado no campo "Adicionar código"', () => {
    expect(idDoCampo('codigoPendente')).toBe('codigosBarras')
    expect(idDoCampo('nome')).toBe('nome')
  })

  describe('avaliarNovoCodigo', () => {
    it('normaliza e aceita, devolvendo a lista nova', () => {
      expect(avaliarNovoCodigo(' 7891 000315507\n', ['96385074'], {})).toEqual({
        tipo: 'aceito',
        codigo: '7891000315507',
        lista: ['96385074', '7891000315507'],
      })
      expect(avaliarNovoCodigo('ABC-1', [], {})).toMatchObject({ tipo: 'aceito', codigo: 'ABC-1' })
    })

    it('texto vazio nao e erro', () => {
      expect(avaliarNovoCodigo('   ', [], {})).toEqual({ tipo: 'vazio' })
    })

    it('barra repetido, limite, tamanho e digito invalido de codigo novo', () => {
      expect(avaliarNovoCodigo('96385074', ['96385074'], {})).toEqual({ tipo: 'bloqueado', motivo: MENSAGEM_CODIGO_REPETIDO })
      const vinte = Array.from({ length: 20 }, (_, i) => `C${i}`)
      expect(avaliarNovoCodigo('X1', vinte, {})).toEqual({ tipo: 'bloqueado', motivo: MENSAGEM_LIMITE_CODIGOS })
      expect(avaliarNovoCodigo('A'.repeat(51), [], {})).toMatchObject({ tipo: 'bloqueado' })
      expect(avaliarNovoCodigo('7891000315508', [], {})).toEqual({ tipo: 'bloqueado', motivo: MENSAGEM_DIGITO_INVALIDO })
    })

    it('codigo ja gravado (OUTRO com digito invalido) volta sem bloqueio', () => {
      const gravados = formatosDoProduto({
        ...produtoAtivo,
        codigosBarras: [{ codigo: '7891000315508', formato: 'OUTRO' }],
      })
      expect(avaliarNovoCodigo('7891000315508', [], gravados)).toMatchObject({ tipo: 'aceito' })
    })
  })

  it('valoresDoProduto e montarRequest fazem a volta completa, mantendo os codigos na ordem', () => {
    const produto = {
      ...produtoAtivo,
      nomeCurto: 'Arroz TJ',
      codigosBarras: [
        { codigo: '7891000315507', formato: 'EAN13' as const },
        { codigo: 'ABC-123', formato: 'OUTRO' as const },
      ],
    }

    // O texto pendente de "Adicionar código" nunca vai no request.
    expect(montarRequest({ ...valoresDoProduto(produto), codigoPendente: '123' })).toEqual({
      nome: 'Arroz 5kg',
      nomeCurto: 'Arroz TJ',
      unidadeId: 'un',
      categoriaId: 'mercearia',
      unidadeCompraId: null,
      fatorConversao: null,
      marca: 'Tio João',
      fornecedor: 'Distribuidora Sul',
      descricao: null,
      precoVenda: 25.9,
      custo: 18,
      precoMinimo: 20,
      estoqueMinimo: 2,
      estoqueMaximo: 50,
      pontoReposicao: 10,
      codigosBarras: ['7891000315507', 'ABC-123'],
      sku: 'SKU-ARROZ',
    })
  })

  it('compra igual a venda aparece como "Mesma da venda"', () => {
    const valores = valoresDoProduto({ ...produtoAtivo, unidadeCompra: produtoAtivo.unidade, fatorConversao: 1 })
    expect(valores.unidadeCompraId).toBe('')
    expect(valores.fatorConversao).toBe('')

    const comCaixa = valoresDoProduto({ ...produtoAtivo, unidadeCompra: resumo(CX), fatorConversao: 12 })
    expect(comCaixa.unidadeCompraId).toBe('cx')
    expect(comCaixa.fatorConversao).toBe('12')
  })

  it('montarRequest converte vazios em null e apara textos', () => {
    const request = montarRequest({
      ...valoresIniciais('un'),
      nome: '  Café  ',
      nomeCurto: '   ',
      fornecedor: ' Atacadão ',
      precoVenda: '12.5',
    })
    expect(request).toMatchObject({ nome: 'Café', nomeCurto: null, fornecedor: 'Atacadão', marca: null, custo: null })
  })

  it('"cadastrar outro" mantem unidade, categoria, marca e fornecedor e limpa o resto', () => {
    const anteriores: ProdutoFormValues = {
      ...valoresDoProduto(produtoAtivo),
      unidadeCompraId: 'cx',
      fatorConversao: '12',
    }
    expect(valoresParaCadastrarOutro(anteriores)).toEqual({
      ...valoresIniciais('un'),
      categoriaId: 'mercearia',
      marca: 'Tio João',
      fornecedor: 'Distribuidora Sul',
    })
  })

  it('schema limita nome curto a 30 e codigos a 20', () => {
    const base = { ...valoresIniciais('un'), nome: 'Arroz', precoVenda: '10' }
    expect(produtoSchema.safeParse({ ...base, nomeCurto: 'x'.repeat(30) }).success).toBe(true)
    expect(produtoSchema.safeParse({ ...base, nomeCurto: 'x'.repeat(31) }).success).toBe(false)

    const vinteEUm = Array.from({ length: 21 }, (_, i) => `COD-${i}`)
    const resultado = produtoSchema.safeParse({ ...base, codigosBarras: vinteEUm })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toBe('Informe no máximo 20 códigos de barras.')
  })

  it('calcula margem e markup como o backend', () => {
    expect(calcularMargemMarkup('25.9', '18')).toEqual({ margem: 30.5, markup: 43.89 })
    expect(calcularMargemMarkup('10', '0')).toEqual({ margem: 100, markup: null })
    expect(calcularMargemMarkup('0', '5')).toEqual({ margem: null, markup: -100 })
    expect(calcularMargemMarkup('10', '')).toEqual({ margem: null, markup: null })
    expect(calcularMargemMarkup('abc', '5')).toEqual({ margem: null, markup: null })
  })

  it('nomeCurtoEfetivo usa o nome curto ou os 30 primeiros caracteres do nome, aparados', () => {
    expect(nomeCurtoEfetivo('Ração Golden Adulto Frango e Arroz 15kg', ' Golden Frango 15kg ')).toBe('Golden Frango 15kg')
    expect(nomeCurtoEfetivo('Ração Golden Adulto Frango e Arroz 15kg', '')).toBe('Ração Golden Adulto Frango e A')
    expect(nomeCurtoEfetivo('Arroz 5kg', '   ')).toBe('Arroz 5kg')
    // Corte no 30o caractere caindo num espaco: aparado no fim.
    expect(nomeCurtoEfetivo('Biscoito Recheado Chocolate 1 Pacote', '')).toBe('Biscoito Recheado Chocolate 1')
    expect(nomeCurtoEfetivo('', '')).toBe('')
  })
})
