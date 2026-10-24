import { describe, expect, it } from 'vitest'

import {
  CAMPOS_POR_SECAO,
  MAXIMO_CODIGOS_POR_EMBALAGEM,
  MAXIMO_EMBALAGENS,
  ROTULO_SECAO,
  SECOES_PRODUTO,
  caminhosComErroNasEmbalagens,
  MENSAGEM_CODIGO_REPETIDO,
  MENSAGEM_DIGITO_INVALIDO,
  MENSAGEM_LIMITE_CODIGOS,
  avaliarNovoCodigo,
  calcularMargemMarkup,
  calcularPrecoPelaMargem,
  calcularPrecoPeloMarkup,
  erroCodigoNaEtiqueta,
  markupDesejadoValido,
  campoDaChaveDoServidor,
  dataHojeSaoPaulo,
  erroFracaoAtacado,
  erroFracaoEstoqueInicial,
  interruptorDoCampo,
  margemDesejadaValida,
  situacaoPromocaoLocal,
  textoAbaixoDoCusto,
  textoAjudaAtacado,
  textoSeloPromocao,
  formatosDoProduto,
  idDoCampo,
  montarRequest,
  novaEmbalagem,
  nomeCurtoEfetivo,
  primeiroCampoComErro,
  produtoSchema,
  produtoSchemaCom,
  localizarCodigoForaDaLista,
  secaoDoCampo,
  valoresDoProduto,
  valoresIniciais,
  valoresParaCadastrarOutro,
  type EmbalagemFormValues,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { CX, KG, SC, UN, embalagemDaApi, produtoAtivo, produtoSimples, resumo } from '@/test/fixturesProduto'
import type { FormatoCodigoBarras, Produto } from '@/types/produto'

describe('produtoFormulario', () => {
  it('as secoes da tela unica, na ordem (Fase B2)', () => {
    expect(SECOES_PRODUTO).toEqual(['geral', 'codigos', 'precos', 'embalagens', 'estoque', 'historico'])
  })

  it('todo campo do formulario esta em exatamente uma secao', () => {
    const campos = SECOES_PRODUTO.flatMap((secao) => CAMPOS_POR_SECAO[secao])
    expect([...campos].sort()).toEqual(Object.keys(valoresIniciais()).sort())
    expect(new Set(campos).size).toBe(campos.length)
  })

  it('a Geral tem os essenciais primeiro e nao tem mais o codigo de barras', () => {
    expect(CAMPOS_POR_SECAO.geral).toEqual([
      'nome',
      'nomeCurto',
      'unidadeId',
      'precoVenda',
      'categoriaId',
      'marcaId',
      'fornecedores',
      'fornecedorUltimaCompraId',
      'descricao',
    ])
    expect(CAMPOS_POR_SECAO.precos).not.toContain('precoVenda')
  })

  it('a secao Codigos tem os codigos de barras primeiro, depois o codigo do produto com a balanca e o SKU', () => {
    expect(CAMPOS_POR_SECAO.codigos).toEqual(['codigoPendente', 'codigosBarras', 'codigo', 'vendidoBalanca', 'sku'])
  })

  it('codigo com balanca maior que a etiqueta e barrado no envio, com a mensagem da API', () => {
    const balanca = { codigo: '12345', vendidoBalanca: true }
    expect(erroCodigoNaEtiqueta(balanca, 4)).toBe(
      'Este código tem mais dígitos do que a etiqueta da balança comporta (4).',
    )
    expect(erroCodigoNaEtiqueta({ ...balanca, codigo: '0001234' }, 4)).toBeNull()
    expect(erroCodigoNaEtiqueta(balanca, 5)).toBeNull()
    expect(erroCodigoNaEtiqueta({ ...balanca, vendidoBalanca: false }, 4)).toBeNull()
    // Sem a configuracao carregada, o backend decide.
    expect(erroCodigoNaEtiqueta(balanca, null)).toBeNull()
  })

  it('primeiroCampoComErro segue a ordem das secoes e dos campos', () => {
    const comErro = new Set<keyof ProdutoFormValues>(['estoqueMaximo', 'custo', 'sku'])
    expect(primeiroCampoComErro((campo) => comErro.has(campo))).toEqual({ secao: 'codigos', campo: 'sku' })
    expect(primeiroCampoComErro((campo) => campo === 'precoVenda')).toEqual({ secao: 'geral', campo: 'precoVenda' })
    expect(primeiroCampoComErro((campo) => campo === 'embalagens')).toEqual({
      secao: 'embalagens',
      campo: 'embalagens',
    })
    expect(primeiroCampoComErro(() => false)).toBeNull()
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
      codigo: 542,
      vendidoBalanca: false,
      nome: 'Arroz 5kg',
      nomeCurto: 'Arroz TJ',
      unidadeId: 'un',
      categoriaId: 'mercearia',
      marcaId: 'tio-joao',
      fornecedorIds: ['dist-sul'],
      fornecedorUltimaCompraId: 'dist-sul',
      descricao: null,
      precoVenda: 25.9,
      custo: 18,
      precoMinimo: 20,
      controlaEstoque: true,
      estoqueMinimo: 2,
      estoqueMaximo: 50,
      pontoReposicao: 10,
      codigosBarras: ['7891000315507', 'ABC-123'],
      sku: 'SKU-ARROZ',
      promocao: null,
      atacado: null,
      embalagens: [],
    })
  })

  describe('codigo do produto e balanca (Fase B2)', () => {
    const base = { ...valoresIniciais('un'), nome: 'Açúcar a granel', precoVenda: '5' }
    const erroEm = (valores: ProdutoFormValues, campo: keyof ProdutoFormValues) =>
      produtoSchema.safeParse(valores).error?.issues.find((issue) => issue.path[0] === campo)?.message

    it('o codigo gravado volta sem zeros e vai como numero', () => {
      const valores = valoresDoProduto({ ...produtoAtivo, codigo: 542, vendidoBalanca: true })
      expect(valores).toMatchObject({ codigo: '542', vendidoBalanca: true })
      expect(montarRequest(valores)).toMatchObject({ codigo: 542, vendidoBalanca: true })
    })

    it('codigo digitado com zeros a esquerda vai como numero', () => {
      expect(produtoSchema.safeParse({ ...base, codigo: '000542' }).success).toBe(true)
      expect(montarRequest({ ...base, codigo: '000542' })).toMatchObject({ codigo: 542 })
    })

    it('produto antigo sem codigo vai com codigo null e balanca desligada (Review Focus 5)', () => {
      const valores = valoresDoProduto(produtoSimples)
      expect(valores).toMatchObject({ codigo: '', vendidoBalanca: false })
      expect(produtoSchema.safeParse(valores).success).toBe(true)
      expect(montarRequest(valores)).toMatchObject({ codigo: null, vendidoBalanca: false })
      expect(montarRequest(valores)).not.toHaveProperty('numero')
    })

    it.each(['0', '1234567', '12a'])('codigo "%s" e invalido, com a mensagem da API', (codigo) => {
      expect(erroEm({ ...base, codigo }, 'codigo')).toBe('O código do produto deve ter de 1 a 6 dígitos.')
    })

    it('"Vendido na balança" exige o codigo', () => {
      expect(erroEm({ ...base, vendidoBalanca: true }, 'codigo')).toBe(
        'Informe o código do produto para vendê-lo na balança.',
      )
      expect(produtoSchema.safeParse({ ...base, vendidoBalanca: true, codigo: '542' }).success).toBe(true)
    })

    it('produto novo comeca sem codigo e fora da balanca', () => {
      expect(valoresIniciais()).toMatchObject({ codigo: '', vendidoBalanca: false })
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

  it('montarRequest converte vazios em null e apara textos', () => {
    const request = montarRequest({
      ...valoresIniciais('un'),
      nome: '  Café  ',
      nomeCurto: '   ',
      precoVenda: '12.5',
    })
    expect(request).toMatchObject({
      nome: 'Café',
      nomeCurto: null,
      marcaId: null,
      fornecedorIds: [],
      fornecedorUltimaCompraId: null,
      custo: null,
    })
    expect(request).not.toHaveProperty('fornecedor')
  })

  it('o request leva os ids dos fornecedores e o da ultima compra', () => {
    const request = montarRequest(valoresDoProduto(produtoAtivo))
    expect(request).toMatchObject({ fornecedorIds: ['dist-sul'], fornecedorUltimaCompraId: 'dist-sul' })
  })

  it('o da ultima compra precisa estar na lista; a lista vai ate 20', () => {
    const base = { ...valoresIniciais('un'), nome: 'Arroz', precoVenda: '10' }
    const foraDaLista = produtoSchema.safeParse({ ...base, fornecedorUltimaCompraId: 'sul' })
    expect(foraDaLista.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['fornecedorUltimaCompraId', 'O fornecedor da última compra precisa estar na lista de fornecedores.'],
    ])
    const vinteEUm = Array.from({ length: 21 }, (_, i) => ({ id: `f${i}`, numero: i, nome: `F${i}`, ativo: true }))
    expect(produtoSchema.safeParse({ ...base, fornecedores: vinteEUm }).error?.issues[0]?.message).toBe(
      'Informe no máximo 20 fornecedores.',
    )
  })

  it('leva o erro de fornecedorIds do backend ao campo da lista', () => {
    expect(campoDaChaveDoServidor('fornecedorIds')).toBe('fornecedores')
    expect(campoDaChaveDoServidor('fornecedorIds[1]')).toBe('fornecedores')
    expect(campoDaChaveDoServidor('fornecedorUltimaCompraId')).toBe('fornecedorUltimaCompraId')
  })

  it('"cadastrar outro" mantem unidade, categoria, marca e a lista de fornecedores e limpa o resto', () => {
    const anteriores: ProdutoFormValues = {
      ...valoresDoProduto(produtoAtivo),
      embalagens: [{ ...novaEmbalagem(), unidadeId: 'cx', quantidade: '12' }],
    }
    expect(valoresParaCadastrarOutro(anteriores)).toEqual({
      ...valoresIniciais('un'),
      categoriaId: 'mercearia',
      marcaId: 'tio-joao',
      fornecedores: [{ id: 'dist-sul', numero: 1, nome: 'Distribuidora Sul', ativo: true }],
      // A ultima compra e um fato de cada produto.
      fornecedorUltimaCompraId: null,
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

  describe('preco pelo markup desejado (Fase B2)', () => {
    it.each([
      ['10', '30', '13.00'],
      ['10', '0', '10.00'],
      ['10', '30,5', '13.05'],
      ['7', '33.33', '9.33'],
      ['10', '9999,99', '1010.00'],
      ['0.01', '50', '0.02'],
    ])('custo %s com markup %s -> %s (meio para cima)', (custo, markup, esperado) => {
      expect(calcularPrecoPeloMarkup(custo, markup)).toBe(esperado)
    })

    it.each([
      ['', '30'],
      ['0', '30'],
      ['10', ''],
      ['10', '10000'],
      ['10', '-5'],
      ['10', '30,555'],
      ['99999999.99', '9999'],
    ])('custo %s com markup %s nao calcula', (custo, markup) => {
      expect(calcularPrecoPeloMarkup(custo, markup)).toBeNull()
    })

    it('markup desejado de 0 a 9.999,99 com ate 2 casas', () => {
      expect(markupDesejadoValido('0')).toBe(true)
      expect(markupDesejadoValido('150,5')).toBe(true)
      expect(markupDesejadoValido('9999.99')).toBe(true)
      expect(markupDesejadoValido('10000')).toBe(false)
      expect(markupDesejadoValido('1,234')).toBe(false)
    })
  })

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
  describe('estoque (Fase D)', () => {
    const base: ProdutoFormValues = { ...valoresIniciais('un'), nome: 'Arroz', precoVenda: '10' }

    function erros(valores: ProdutoFormValues): Record<string, string> {
      const resultado = produtoSchema.safeParse(valores)
      return Object.fromEntries((resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]))
    }

    it('produto novo controla estoque por padrão, sem estoque inicial', () => {
      expect(valoresIniciais()).toMatchObject({ controlaEstoque: true, estoqueInicial: '' })
    })

    it('a secao Estoque tem o interruptor, o estoque inicial e os níveis, nessa ordem (a embalagem saiu)', () => {
      expect(CAMPOS_POR_SECAO.estoque).toEqual([
        'controlaEstoque',
        'estoqueInicial',
        'estoqueMinimo',
        'pontoReposicao',
        'estoqueMaximo',
      ])
    })

    it('valoresDoProduto traz o controle gravado e os níveis com vírgula', () => {
      const valores = valoresDoProduto({
        ...produtoAtivo,
        controlaEstoque: false,
        estoqueMinimo: 2.5,
        pontoReposicao: 4.125,
        estoqueMaximo: 1500,
      })
      expect(valores).toMatchObject({
        controlaEstoque: false,
        estoqueInicial: '',
        estoqueMinimo: '2,5',
        pontoReposicao: '4,125',
        estoqueMaximo: '1500',
      })
    })

    it('níveis aceitam vírgula e vão como número no request', () => {
      const request = montarRequest({ ...base, estoqueMinimo: '2,5', pontoReposicao: '4.5', estoqueMaximo: '10' })
      expect(request).toMatchObject({ estoqueMinimo: 2.5, pontoReposicao: 4.5, estoqueMaximo: 10 })
      expect(erros({ ...base, estoqueMinimo: '2,5', pontoReposicao: '4.5', estoqueMaximo: '10' })).toEqual({})
    })

    it('mínimo ≤ ponto de reposição ≤ máximo, com o erro no campo', () => {
      expect(erros({ ...base, estoqueMinimo: '5', pontoReposicao: '3' })).toEqual({
        pontoReposicao: 'O ponto de reposição não pode ser menor que o estoque mínimo.',
      })
      expect(erros({ ...base, pontoReposicao: '8', estoqueMaximo: '6' })).toEqual({
        estoqueMaximo: 'O estoque máximo não pode ser menor que o ponto de reposição.',
      })
      expect(erros({ ...base, estoqueMinimo: '8', estoqueMaximo: '6' })).toEqual({
        estoqueMaximo: 'Estoque máximo não pode ser menor que o estoque mínimo.',
      })
      expect(erros({ ...base, estoqueMinimo: '5', pontoReposicao: '5', estoqueMaximo: '5' })).toEqual({})
    })

    it('níveis: negativo, inválido e mais de 3 casas', () => {
      expect(erros({ ...base, estoqueMinimo: '-2' })).toEqual({
        estoqueMinimo: 'Estoque mínimo não pode ser negativo.',
      })
      expect(erros({ ...base, pontoReposicao: 'abc' })).toEqual({ pontoReposicao: 'Informe um número válido.' })
      expect(erros({ ...base, estoqueMaximo: '1,2345' })).toEqual({
        estoqueMaximo: 'Use no máximo 3 casas decimais.',
      })
    })

    it('estoque inicial: opcional, maior que zero e com até 3 casas', () => {
      expect(erros({ ...base, estoqueInicial: '' })).toEqual({})
      expect(erros({ ...base, estoqueInicial: '2,5' })).toEqual({})
      expect(erros({ ...base, estoqueInicial: '0' })).toEqual({
        estoqueInicial: 'O estoque inicial deve ser maior que zero.',
      })
      expect(erros({ ...base, estoqueInicial: '1,2345' })).toEqual({
        estoqueInicial: 'Use no máximo 3 casas decimais.',
      })
      expect(erros({ ...base, estoqueInicial: 'abc' })).toEqual({ estoqueInicial: 'Informe um número válido.' })
    })

    it('com o controle desligado, o estoque inicial é ignorado', () => {
      expect(erros({ ...base, controlaEstoque: false, estoqueInicial: '0' })).toEqual({})
      expect(montarRequest({ ...base, controlaEstoque: false, estoqueInicial: '5' }, { novo: true })).toMatchObject({
        controlaEstoque: false,
        estoqueInicial: null,
      })
    })

    it('o estoque inicial só vai no cadastro (o PATCH nem leva a chave)', () => {
      expect(montarRequest({ ...base, estoqueInicial: '2,5' }, { novo: true })).toMatchObject({
        controlaEstoque: true,
        estoqueInicial: 2.5,
      })
      expect(montarRequest({ ...base, estoqueInicial: '' }, { novo: true })).toMatchObject({ estoqueInicial: null })
      const edicao = montarRequest({ ...valoresDoProduto(produtoSimples), estoqueInicial: '3' })
      expect(edicao).not.toHaveProperty('estoqueInicial')
      expect(edicao.controlaEstoque).toBe(true)
    })

    it('estoque inicial fracionado só em unidade fracionada', () => {
      const fracionada = { ...KG, fracionada: true }
      const valores = { ...base, estoqueInicial: '2,5' }
      expect(erroFracaoEstoqueInicial(valores, [UN, fracionada])).toBe('A unidade UN não aceita quantidade fracionada.')
      expect(erroFracaoEstoqueInicial({ ...valores, unidadeId: 'kg' }, [UN, fracionada])).toBeNull()
      expect(erroFracaoEstoqueInicial({ ...valores, estoqueInicial: '3' }, [UN])).toBeNull()
      expect(erroFracaoEstoqueInicial({ ...valores, controlaEstoque: false }, [UN])).toBeNull()
      expect(erroFracaoEstoqueInicial(valores, [])).toBeNull()
    })
  })

  describe('embalagens (Fase B3)', () => {
    const fracionadaKg = { ...KG, fracionada: true }
    const UNIDADES = [UN, CX, fracionadaKg, resumo(SC)]
    const schema = produtoSchemaCom(UNIDADES)
    const base: ProdutoFormValues = { ...valoresIniciais('un'), nome: 'Nexgard Combo', precoVenda: '89.90' }
    const caixa: EmbalagemFormValues = { ...novaEmbalagem(), unidadeId: 'cx', quantidade: '3' }

    /** Erros por caminho ("embalagens.0.quantidade"), com o espaco do R$ normalizado. */
    function erros(valores: ProdutoFormValues): Record<string, string> {
      const resultado = schema.safeParse(valores)
      return Object.fromEntries(
        (resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message.replace(/ /g, ' ')]),
      )
    }

    it('a secao Embalagens fica entre Preços e Estoque, com o rotulo e o campo da lista', () => {
      expect(SECOES_PRODUTO.slice(2, 5)).toEqual(['precos', 'embalagens', 'estoque'])
      expect(ROTULO_SECAO.embalagens).toBe('Embalagens')
      expect(CAMPOS_POR_SECAO.embalagens).toEqual(['embalagens'])
    })

    it('produto novo comeca sem embalagens; a nova embalagem vem vazia e fora da compra', () => {
      expect(valoresIniciais().embalagens).toEqual([])
      expect(novaEmbalagem()).toEqual({
        unidadeId: '',
        quantidade: '',
        preco: '',
        deCompra: false,
        codigosBarras: [],
        codigoPendente: '',
      })
    })

    it('valoresDoProduto traz as embalagens com a quantidade com virgula e o preco no formato do campo', () => {
      const produto: Produto = {
        ...produtoAtivo,
        unidade: resumo(fracionadaKg),
        embalagens: [
          embalagemDaApi({ id: 'e1', unidade: resumo(SC), quantidade: 25.5, preco: null, deCompra: true }),
          embalagemDaApi({ id: 'e2', unidade: resumo(CX), quantidade: 3, preco: 209.9, codigos: ['7891000315507'] }),
        ],
      }
      expect(valoresDoProduto(produto).embalagens).toEqual([
        { id: 'e1', unidadeId: 'sc', quantidade: '25,5', preco: '', deCompra: true, codigosBarras: [], codigoPendente: '' },
        {
          id: 'e2',
          unidadeId: 'cx',
          quantidade: '3',
          preco: '209.9',
          deCompra: false,
          codigosBarras: ['7891000315507'],
          codigoPendente: '',
        },
      ])
    })

    it('montarRequest: a nova vai sem id, a mantida com id, preco vazio vira null e "2,5" vira 2.5', () => {
      const request = montarRequest({
        ...base,
        unidadeId: 'kg',
        embalagens: [
          { ...caixa, id: 'e1', preco: '209.90', codigosBarras: ['7891000315507'], codigoPendente: '123' },
          { ...novaEmbalagem(), unidadeId: 'sc', quantidade: '2,5', deCompra: true },
        ],
      })
      expect(request.embalagens).toEqual([
        { id: 'e1', unidadeId: 'cx', quantidade: 3, preco: 209.9, deCompra: false, codigosBarras: ['7891000315507'] },
        { unidadeId: 'sc', quantidade: 2.5, preco: null, deCompra: true, codigosBarras: [] },
      ])
      expect(request.embalagens[1]).not.toHaveProperty('id')
      expect(request).not.toHaveProperty('unidadeCompraId')
      expect(request).not.toHaveProperty('fatorConversao')
    })

    it('embalagem valida passa', () => {
      expect(erros({ ...base, embalagens: [caixa, { ...caixa, quantidade: '12', preco: '899.00' }] })).toEqual({})
    })

    it('unidade obrigatoria e diferente da unidade de venda', () => {
      expect(erros({ ...base, embalagens: [{ ...caixa, unidadeId: '' }] })).toEqual({
        'embalagens.0.unidadeId': 'Informe a unidade da embalagem.',
      })
      expect(erros({ ...base, embalagens: [{ ...caixa, unidadeId: 'un' }] })).toEqual({
        'embalagens.0.unidadeId': 'A embalagem precisa de uma unidade diferente da unidade de venda (UN).',
      })
    })

    it('quantidade informada, maior que 1 e inteira se a unidade de venda nao e fracionada', () => {
      expect(erros({ ...base, embalagens: [{ ...caixa, quantidade: '' }] })).toEqual({
        'embalagens.0.quantidade': 'Informe a quantidade da embalagem.',
      })
      expect(erros({ ...base, embalagens: [{ ...caixa, quantidade: '1' }] })).toEqual({
        'embalagens.0.quantidade': 'A embalagem precisa conter mais de 1 UN.',
      })
      expect(erros({ ...base, embalagens: [{ ...caixa, quantidade: '2,5' }] })).toEqual({
        'embalagens.0.quantidade': 'UN não aceita quantidade fracionada. Informe um número inteiro.',
      })
      expect(erros({ ...base, embalagens: [{ ...caixa, quantidade: '2,5555' }] })).toEqual({
        'embalagens.0.quantidade': 'Use no máximo 3 casas decimais.',
      })
      // KG e fracionada: 25,5 passa.
      expect(erros({ ...base, unidadeId: 'kg', embalagens: [{ ...caixa, unidadeId: 'sc', quantidade: '25,5' }] })).toEqual({})
    })

    it('com a unidade de venda desconhecida (lista carregando), a fracao fica para o backend', () => {
      const valores = { ...base, unidadeId: 'outra', embalagens: [{ ...caixa, quantidade: '2,5' }] }
      expect(erros(valores)).toEqual({})
    })

    it('embalagem repetida (mesma unidade e quantidade) na segunda ocorrencia, na unidade (como a API)', () => {
      expect(erros({ ...base, embalagens: [caixa, { ...caixa, quantidade: '3,000' }] })).toEqual({
        'embalagens.1.unidadeId': 'Já existe a embalagem CX c/ 3 UN neste produto.',
      })
    })

    it('so uma embalagem de compra', () => {
      expect(
        erros({ ...base, embalagens: [{ ...caixa, deCompra: true }, { ...caixa, quantidade: '12', deCompra: true }] }),
      ).toEqual({ 'embalagens.1.deCompra': 'Só uma embalagem pode ser a de compra.' })
    })

    it('preco proprio maior que zero e, por unidade, nao abaixo do minimo', () => {
      expect(erros({ ...base, embalagens: [{ ...caixa, preco: '0.00' }] })).toEqual({
        'embalagens.0.preco': 'O preço da embalagem deve ser maior que zero.',
      })
      const comMinimo = { ...base, precoMinimo: '70.00' }
      expect(erros({ ...comMinimo, embalagens: [{ ...caixa, preco: '210.00' }] })).toEqual({})
      expect(erros({ ...comMinimo, embalagens: [{ ...caixa, preco: '209.99' }] })).toEqual({
        'embalagens.0.preco': 'O preço da embalagem dá R$ 69,99 por UN, abaixo do preço mínimo (R$ 70,00).',
      })
      expect(erros({ ...comMinimo, embalagens: [{ ...caixa, preco: '209.90' }] })).toEqual({
        'embalagens.0.preco': 'O preço da embalagem dá R$ 69,96 por UN, abaixo do preço mínimo (R$ 70,00).',
      })
      // Sem preco proprio, o calculado parte do preco da unidade: nada a conferir.
      expect(erros({ ...comMinimo, embalagens: [caixa] })).toEqual({})
    })

    it('ate 10 embalagens e ate 5 codigos por embalagem', () => {
      const onze = Array.from({ length: 11 }, (_, i) => ({ ...caixa, quantidade: String(i + 2) }))
      expect(erros({ ...base, embalagens: onze })).toEqual({ embalagens: 'Informe no máximo 10 embalagens.' })
      const seis = Array.from({ length: 6 }, (_, i) => `COD-${i}`)
      expect(erros({ ...base, embalagens: [{ ...caixa, codigosBarras: seis }] })).toEqual({
        'embalagens.0.codigosBarras': 'Informe no máximo 5 códigos de barras por embalagem.',
      })
      expect(MAXIMO_EMBALAGENS).toBe(10)
      expect(MAXIMO_CODIGOS_POR_EMBALAGEM).toBe(5)
    })

    it('o erro indexado da API vira o caminho do campo no formulario', () => {
      expect(campoDaChaveDoServidor('embalagens[1].quantidade')).toBe('embalagens.1.quantidade')
      expect(campoDaChaveDoServidor('embalagens[0].codigosBarras[2]')).toBe('embalagens.0.codigosBarras')
      expect(campoDaChaveDoServidor('embalagens[0].unidadeId')).toBe('embalagens.0.unidadeId')
      expect(campoDaChaveDoServidor('embalagens')).toBe('embalagens')
      expect(campoDaChaveDoServidor('embalagens[3]')).toBe('embalagens')
      expect(campoDaChaveDoServidor('embalagens[0].outra')).toBe('embalagens')
      // Os demais continuam iguais.
      expect(campoDaChaveDoServidor('codigosBarras[2]')).toBe('codigosBarras')
      expect(campoDaChaveDoServidor('promocao.preco')).toBe('precoPromocional')
    })

    it('caminhos com erro nas embalagens, na ordem da tela; pendente e lista contam uma vez', () => {
      const comErro = {
        1: { quantidade: { message: 'a' }, preco: { message: 'b' } },
        0: { codigoPendente: { message: 'c' }, codigosBarras: { message: 'd' } },
      }
      expect(caminhosComErroNasEmbalagens(comErro)).toEqual([
        'embalagens.0.codigoPendente',
        'embalagens.1.quantidade',
        'embalagens.1.preco',
      ])
      expect(caminhosComErroNasEmbalagens({ root: { message: 'Informe no máximo 10 embalagens.' } })).toEqual([
        'embalagens',
      ])
      expect(caminhosComErroNasEmbalagens({ message: 'Informe no máximo 10 embalagens.' })).toEqual(['embalagens'])
      expect(caminhosComErroNasEmbalagens(undefined)).toEqual([])
    })

    it('idDoCampo e secaoDoCampo entendem o caminho de uma embalagem', () => {
      expect(idDoCampo('embalagens.2.quantidade')).toBe('embalagens.2.quantidade')
      expect(idDoCampo('embalagens.2.codigoPendente')).toBe('embalagens.2.codigosBarras')
      expect(secaoDoCampo('embalagens.2.preco')).toBe('embalagens')
      expect(secaoDoCampo('custo')).toBe('precos')
    })

    it('os codigos das embalagens tambem contam como gravados (nao sao rebloqueados)', () => {
      const gravados = formatosDoProduto({
        ...produtoAtivo,
        embalagens: [embalagemDaApi({ id: 'e1', unidade: resumo(CX), quantidade: 3, preco: null, codigos: ['X-1'] })],
      })
      expect(gravados.get('X-1')).toBe('OUTRO')
      expect(gravados.get('7891000315507')).toBe('EAN13')
    })

    it('codigo de outra lista do produto e barrado dizendo onde ele esta', () => {
      expect(avaliarNovoCodigo('X1', [], new Map(), 5, () => 'na embalagem CX c/ 3 UN')).toEqual({
        tipo: 'bloqueado',
        motivo: 'Este código já está na embalagem CX c/ 3 UN.',
      })
      expect(avaliarNovoCodigo('X1', [], new Map(), 5, () => null)).toMatchObject({ tipo: 'aceito' })
    })

    it('localizarCodigoForaDaLista: a unidade e as outras embalagens, com o rotulo ou a posicao', () => {
      const valores = {
        unidadeId: 'un',
        codigosBarras: ['A'],
        embalagens: [
          { ...caixa, codigosBarras: ['B'] },
          { ...novaEmbalagem(), codigosBarras: ['C'] },
        ],
      }
      const siglas = new Map([
        ['un', 'UN'],
        ['cx', 'CX'],
      ])
      const daUnidade = localizarCodigoForaDaLista(valores, 'unidade', siglas)
      expect(daUnidade('A')).toBeNull()
      expect(daUnidade('B')).toBe('na embalagem CX c/ 3 UN')
      expect(daUnidade('C')).toBe('na embalagem 2 (nova)')
      expect(daUnidade('Z')).toBeNull()
      const daCaixa = localizarCodigoForaDaLista(valores, 0, siglas)
      expect(daCaixa('A')).toBe('na unidade (UN) deste produto')
      expect(daCaixa('B')).toBeNull()
      expect(localizarCodigoForaDaLista(valores, 0, new Map())('A')).toBe('na unidade de venda deste produto')
    })

    it('o limite do "Adicionar código" e por parametro (5 nas embalagens)', () => {
      const cinco = Array.from({ length: 5 }, (_, i) => `C${i}`)
      expect(avaliarNovoCodigo('X1', cinco, new Map(), 5)).toEqual({
        tipo: 'bloqueado',
        motivo: 'Limite de 5 códigos de barras atingido.',
      })
      expect(avaliarNovoCodigo('X1', cinco, new Map())).toMatchObject({ tipo: 'aceito' })
    })
  })
})
