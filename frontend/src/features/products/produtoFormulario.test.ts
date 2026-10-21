import { describe, expect, it } from 'vitest'

import {
  ABAS_PRODUTO,
  CAMPOS_POR_ABA,
  MENSAGEM_CODIGO_REPETIDO,
  MENSAGEM_DIGITO_INVALIDO,
  MENSAGEM_LIMITE_CODIGOS,
  avaliarNovoCodigo,
  calcularMargemMarkup,
  calcularPrecoPelaMargem,
  campoDaChaveDoServidor,
  dataHojeSaoPaulo,
  erroFracaoAtacado,
  interruptorDoCampo,
  margemDesejadaValida,
  situacaoPromocaoLocal,
  textoAbaixoDoCusto,
  textoAjudaAtacado,
  textoSeloPromocao,
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
import { CX, KG, UN, produtoAtivo, resumo } from '@/test/fixturesProduto'
import type { FormatoCodigoBarras } from '@/types/produto'

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
    const SEM_GRAVADOS: ReadonlyMap<string, FormatoCodigoBarras> = new Map()

    it('normaliza e aceita, devolvendo a lista nova', () => {
      expect(avaliarNovoCodigo(' 7891 000315507\n', ['96385074'], SEM_GRAVADOS)).toEqual({
        tipo: 'aceito',
        codigo: '7891000315507',
        lista: ['96385074', '7891000315507'],
      })
      expect(avaliarNovoCodigo('ABC-1', [], SEM_GRAVADOS)).toMatchObject({ tipo: 'aceito', codigo: 'ABC-1' })
    })

    it('texto vazio nao e erro', () => {
      expect(avaliarNovoCodigo('   ', [], SEM_GRAVADOS)).toEqual({ tipo: 'vazio' })
    })

    it('barra repetido, limite, tamanho e digito invalido de codigo novo', () => {
      expect(avaliarNovoCodigo('96385074', ['96385074'], SEM_GRAVADOS)).toEqual({ tipo: 'bloqueado', motivo: MENSAGEM_CODIGO_REPETIDO })
      const vinte = Array.from({ length: 20 }, (_, i) => `C${i}`)
      expect(avaliarNovoCodigo('X1', vinte, SEM_GRAVADOS)).toEqual({ tipo: 'bloqueado', motivo: MENSAGEM_LIMITE_CODIGOS })
      expect(avaliarNovoCodigo('A'.repeat(51), [], SEM_GRAVADOS)).toMatchObject({ tipo: 'bloqueado' })
      expect(avaliarNovoCodigo('7891000315508', [], SEM_GRAVADOS)).toEqual({ tipo: 'bloqueado', motivo: MENSAGEM_DIGITO_INVALIDO })
    })

    it('codigo com nome de propriedade de objeto nao e tomado por "ja gravado" (S4)', () => {
      const gravados = formatosDoProduto(produtoAtivo)
      expect(gravados.has('constructor')).toBe(false)
      expect(avaliarNovoCodigo('constructor', [], gravados)).toMatchObject({ tipo: 'aceito', codigo: 'constructor' })
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
      promocao: null,
      atacado: null,
    })
  })

  it('promocao e atacado gravados voltam ligados no formulario e no request', () => {
    const produto = {
      ...produtoAtivo,
      promocao: { preco: 8.9, inicio: '2026-11-01', fim: '2026-11-15', situacao: 'AGENDADA' as const },
      atacado: { preco: 4.2, quantidadeMinima: 12 },
    }
    const valores = valoresDoProduto(produto)
    expect(valores).toMatchObject({
      promocaoAtiva: true,
      precoPromocional: '8.9',
      promocaoInicio: '2026-11-01',
      promocaoFim: '2026-11-15',
      atacadoAtivo: true,
      precoAtacado: '4.2',
      quantidadeMinimaAtacado: '12',
    })
    expect(montarRequest(valores)).toMatchObject({
      promocao: { preco: 8.9, inicio: '2026-11-01', fim: '2026-11-15' },
      atacado: { preco: 4.2, quantidadeMinima: 12 },
    })
  })

  it('interruptor desligado envia promocao e atacado nulos, mesmo com campos preenchidos', () => {
    const request = montarRequest({
      ...valoresIniciais('un'),
      nome: 'Café',
      precoVenda: '10',
      promocaoAtiva: false,
      precoPromocional: '8',
      promocaoInicio: '2026-11-01',
      promocaoFim: '2026-11-15',
      atacadoAtivo: false,
      precoAtacado: '9',
      quantidadeMinimaAtacado: '6',
    })
    expect(request.promocao).toBeNull()
    expect(request.atacado).toBeNull()
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

  /** O "R$" sai com espaco inseparavel (Intl), como no resto da tela. */
  const comEspacoSimples = (texto: string | null) => texto?.replace(/ /g, ' ') ?? null

  describe('preco pela margem desejada', () => {
    it.each([
      ['10', '50', '20.00'],
      ['7', '30', '10.00'],
      ['3', '33,33', '4.50'],
      ['3', '33.33', '4.50'],
      ['18', '0', '18.00'],
      ['10', '99,99', '100000.00'],
    ])('custo %s e margem %s -> %s', (custo, margem, preco) => {
      expect(calcularPrecoPelaMargem(custo, margem)).toBe(preco)
    })

    it.each([
      ['10', '100'],
      ['10', '120'],
      ['', '30'],
      ['0', '30'],
      ['10', ''],
      ['10', '-5'],
      ['10', 'abc'],
      ['10', '30,555'],
      // Resultado acima de 12 digitos.
      ['99999999.99', '99,99'],
    ])('custo "%s" e margem "%s" nao calculam (null)', (custo, margem) => {
      expect(calcularPrecoPelaMargem(custo, margem)).toBeNull()
    })

    it.each([
      ['30', true],
      ['0', true],
      ['99,99', true],
      ['33.3', true],
      ['100', false],
      ['30,555', false],
      ['-5', false],
      ['abc', false],
      ['', false],
    ])('margem "%s" valida: %s', (margem, valida) => {
      expect(margemDesejadaValida(margem)).toBe(valida)
    })
  })

  describe('situacao da promocao enquanto edita', () => {
    it('agendada, vigente (inclusive nas pontas) e encerrada', () => {
      expect(situacaoPromocaoLocal('2026-11-01', '2026-11-15', '2026-10-31')).toBe('AGENDADA')
      expect(situacaoPromocaoLocal('2026-11-01', '2026-11-15', '2026-11-01')).toBe('VIGENTE')
      expect(situacaoPromocaoLocal('2026-11-01', '2026-11-15', '2026-11-15')).toBe('VIGENTE')
      expect(situacaoPromocaoLocal('2026-11-15', '2026-11-15', '2026-11-15')).toBe('VIGENTE')
      expect(situacaoPromocaoLocal('2026-11-01', '2026-11-15', '2026-11-16')).toBe('ENCERRADA')
    })

    it('sem datas ou com fim antes do inicio, sem situacao', () => {
      expect(situacaoPromocaoLocal('', '2026-11-15', '2026-11-05')).toBeNull()
      expect(situacaoPromocaoLocal('2026-11-15', '2026-11-01', '2026-11-05')).toBeNull()
    })

    it('textos do selo, com o ano so quando nao e o de hoje', () => {
      const hoje = '2026-11-05'
      expect(textoSeloPromocao('VIGENTE', '2026-11-01', '2026-11-15', hoje)).toBe('Vigente até 15/11')
      expect(textoSeloPromocao('AGENDADA', '2026-11-10', '2026-11-15', hoje)).toBe('Agendada para 10/11')
      expect(textoSeloPromocao('ENCERRADA', '2026-10-01', '2026-10-15', hoje)).toBe(
        'Encerrada em 15/10. O produto voltou ao preço normal.',
      )
      expect(textoSeloPromocao('VIGENTE', '2026-12-20', '2027-01-10', '2026-12-25')).toBe('Vigente até 10/01/2027')
      expect(textoSeloPromocao('ENCERRADA', '2025-12-01', '2025-12-31', hoje)).toBe(
        'Encerrada em 31/12/2025. O produto voltou ao preço normal.',
      )
    })

    it('hoje e o dia de Sao Paulo, nao o do navegador nem o UTC (Review Focus 1)', () => {
      // 01:30 UTC de 16/11 = 22:30 de 15/11 em Sao Paulo.
      expect(dataHojeSaoPaulo(new Date('2026-11-16T01:30:00Z'))).toBe('2026-11-15')
      expect(dataHojeSaoPaulo(new Date('2026-01-09T12:00:00Z'))).toBe('2026-01-09')
    })
  })

  describe('aviso de preco abaixo do custo', () => {
    it('diz a diferenca e o custo', () => {
      expect(comEspacoSimples(textoAbaixoDoCusto('4.5', '5'))).toBe(
        'R$ 0,50 abaixo do custo (R$ 5,00). Vender por este preço dá prejuízo.',
      )
      expect(comEspacoSimples(textoAbaixoDoCusto('0.1', '0.3'))).toBe(
        'R$ 0,20 abaixo do custo (R$ 0,30). Vender por este preço dá prejuízo.',
      )
    })

    it('sem aviso com preco igual ou acima do custo, ou sem um dos valores', () => {
      expect(textoAbaixoDoCusto('12', '12')).toBeNull()
      expect(textoAbaixoDoCusto('13', '12')).toBeNull()
      expect(textoAbaixoDoCusto('', '12')).toBeNull()
      expect(textoAbaixoDoCusto('10', '')).toBeNull()
    })
  })

  it('ajuda do atacado com a quantidade e o preco em pt-BR', () => {
    expect(comEspacoSimples(textoAjudaAtacado('12', '4.2', 'UN'))).toBe(
      'A partir de 12 UN, o preço passa a ser R$ 4,20 por unidade.',
    )
    expect(comEspacoSimples(textoAjudaAtacado('2.5', '4.2', 'KG'))).toBe(
      'A partir de 2,5 KG, o preço passa a ser R$ 4,20 por KG.',
    )
    expect(comEspacoSimples(textoAjudaAtacado('12', '4.2', undefined))).toBe(
      'A partir de 12, o preço passa a ser R$ 4,20 por unidade.',
    )
    expect(textoAjudaAtacado('', '4.2', 'UN')).toBeNull()
    expect(textoAjudaAtacado('12', '', 'UN')).toBeNull()
  })

  describe('erros do servidor nos blocos de promocao e atacado', () => {
    it.each([
      ['promocao.preco', 'precoPromocional'],
      ['promocao.inicio', 'promocaoInicio'],
      ['promocao.fim', 'promocaoFim'],
      ['atacado.preco', 'precoAtacado'],
      ['atacado.quantidadeMinima', 'quantidadeMinimaAtacado'],
      ['promocao', 'precoPromocional'],
      ['atacado', 'precoAtacado'],
    ])('chave %s -> campo %s', (chave, campo) => {
      expect(campoDaChaveDoServidor(chave)).toBe(campo)
    })

    it('demais chaves: o nome sem indice, e "constructor" nao casa com o prototipo', () => {
      expect(campoDaChaveDoServidor('codigosBarras[2]')).toBe('codigosBarras')
      expect(campoDaChaveDoServidor('constructor')).toBe('constructor')
    })

    it.each([
      ['precoPromocional', 'promocaoAtiva'],
      ['promocaoInicio', 'promocaoAtiva'],
      ['promocaoFim', 'promocaoAtiva'],
      ['precoAtacado', 'atacadoAtivo'],
      ['quantidadeMinimaAtacado', 'atacadoAtivo'],
      ['custo', null],
    ] as const)('campo %s -> interruptor %s', (campo, interruptor) => {
      expect(interruptorDoCampo(campo)).toBe(interruptor)
    })
  })

  it('quantidade fracionada do atacado so em unidade fracionada', () => {
    const fracionada = { ...KG, fracionada: true }
    const base = { ...valoresIniciais('un'), atacadoAtivo: true, precoAtacado: '4', quantidadeMinimaAtacado: '2.5' }
    expect(erroFracaoAtacado(base, [UN, fracionada])).toBe('A unidade UN não aceita quantidade fracionada.')
    expect(erroFracaoAtacado({ ...base, unidadeId: 'kg' }, [UN, fracionada])).toBeNull()
    expect(erroFracaoAtacado({ ...base, quantidadeMinimaAtacado: '12' }, [UN])).toBeNull()
    expect(erroFracaoAtacado({ ...base, atacadoAtivo: false }, [UN])).toBeNull()
    // Unidade desconhecida (lista carregando): o backend decide.
    expect(erroFracaoAtacado(base, [])).toBeNull()
  })

  describe('schema da promocao e do atacado', () => {
    const base: ProdutoFormValues = { ...valoresIniciais('un'), nome: 'Arroz', precoVenda: '10', precoMinimo: '5' }
    const promocao = { promocaoAtiva: true, precoPromocional: '8', promocaoInicio: '2026-11-01', promocaoFim: '2026-11-15' }
    const atacado = { atacadoAtivo: true, precoAtacado: '9', quantidadeMinimaAtacado: '12' }

    function erros(valores: ProdutoFormValues): Record<string, string> {
      const resultado = produtoSchema.safeParse(valores)
      return Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))
    }

    it('aceita promocao e atacado validos, e promocao encerrada', () => {
      expect(erros({ ...base, ...promocao, ...atacado })).toEqual({})
      expect(erros({ ...base, ...promocao, promocaoInicio: '2020-01-01', promocaoFim: '2020-01-31' })).toEqual({})
    })

    it('interruptor desligado ignora os campos do bloco', () => {
      expect(
        erros({ ...base, promocaoAtiva: false, precoPromocional: '50', atacadoAtivo: false, quantidadeMinimaAtacado: '1' }),
      ).toEqual({})
    })

    it('promocao ligada exige preco, inicio e fim', () => {
      expect(erros({ ...base, promocaoAtiva: true })).toEqual({
        precoPromocional: 'Informe o preço promocional.',
        promocaoInicio: 'Informe o início da promoção.',
        promocaoFim: 'Informe o fim da promoção.',
      })
    })

    it('barra fim antes do inicio', () => {
      expect(erros({ ...base, ...promocao, promocaoFim: '2026-10-31' })).toEqual({
        promocaoFim: 'O fim da promoção não pode ser antes do início.',
      })
    })

    it('preco promocional maior que zero, menor que o de venda e nao abaixo do minimo', () => {
      expect(erros({ ...base, ...promocao, precoPromocional: '0.00' })).toEqual({
        precoPromocional: 'Preço promocional deve ser maior que zero.',
      })
      expect(erros({ ...base, ...promocao, precoPromocional: '10.00' })).toEqual({
        precoPromocional: 'Preço promocional deve ser menor que o preço de venda.',
      })
      expect(erros({ ...base, ...promocao, precoPromocional: '4.99' })).toEqual({
        precoPromocional: 'Preço promocional não pode ser menor que o preço mínimo.',
      })
    })

    it('atacado ligado exige preco e quantidade, com as mesmas regras de preco', () => {
      expect(erros({ ...base, atacadoAtivo: true })).toEqual({
        precoAtacado: 'Informe o preço de atacado.',
        quantidadeMinimaAtacado: 'Informe a quantidade mínima do atacado.',
      })
      expect(erros({ ...base, ...atacado, precoAtacado: '10' })).toEqual({
        precoAtacado: 'Preço de atacado deve ser menor que o preço de venda.',
      })
      expect(erros({ ...base, ...atacado, precoAtacado: '4' })).toEqual({
        precoAtacado: 'Preço de atacado não pode ser menor que o preço mínimo.',
      })
    })

    it('quantidade minima do atacado maior que 1 e com ate 3 casas', () => {
      expect(erros({ ...base, ...atacado, quantidadeMinimaAtacado: '1' })).toEqual({
        quantidadeMinimaAtacado: 'A quantidade mínima do atacado deve ser maior que 1.',
      })
      expect(erros({ ...base, ...atacado, quantidadeMinimaAtacado: '1.0005' })).toEqual({
        quantidadeMinimaAtacado: 'A quantidade mínima do atacado deve ter no máximo 3 casas decimais.',
      })
      expect(erros({ ...base, ...atacado, quantidadeMinimaAtacado: '1.001' })).toEqual({})
    })
  })
})
