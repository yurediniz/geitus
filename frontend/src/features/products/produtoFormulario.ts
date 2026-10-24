/**
 * Formulario do produto: schema Zod, valores iniciais, mapeamentos de/para a
 * API e a distribuicao dos campos pelas secoes. Sem React: testavel isolado.
 */
import { z } from 'zod'

import { digitoVerificadorValido, ehCandidatoGs1, normalizarCodigo } from '@/lib/codigoBarras'
import { interpretarCodigoProduto } from '@/lib/codigoProduto'
import { rotuloDaEmbalagem, valorPorUnidadeAbaixoDoMinimo } from '@/lib/embalagem'
import type { UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import { formatarMoeda } from '@/features/products/formatacaoProduto'
import { MAXIMO_DIGITOS_MOEDA, digitosParaValor, valorParaDigitos } from '@/lib/moeda'
import { MENSAGEM_QUANTIDADE, interpretarQuantidade, quantidadeParaTexto, validarQuantidade } from '@/lib/quantidade'
import type {
  EmbalagemRequest,
  FormatoCodigoBarras,
  Produto,
  ProdutoRequest,
  SituacaoPromocao,
} from '@/types/produto'

const textoOpcional = (max: number, mensagem: string) =>
  z.string().trim().max(max, mensagem)

const numeroObrigatorio = z.string().trim()
  .min(1, 'Informe o preço de venda.')
  .refine((valor) => Number.isFinite(Number(valor)), 'Informe um número válido.')
  .refine((valor) => Number(valor) >= 0, 'Preço de venda não pode ser negativo.')

const numeroOpcional = (mensagemNegativo: string) =>
  z.string().trim()
    .refine((valor) => valor === '' || Number.isFinite(Number(valor)), 'Informe um número válido.')
    .refine((valor) => valor === '' || Number(valor) >= 0, mensagemNegativo)

/** Nivel de estoque opcional: texto com virgula ou ponto, >= 0 e com ate 3 casas. */
const quantidadeOpcional = (mensagemNegativo: string) =>
  z.string().trim().superRefine((valor, ctx) => {
    const resultado = validarQuantidade(valor)
    if ('erro' in resultado && resultado.erro !== 'vazio') {
      const message = resultado.erro === 'negativo' ? mensagemNegativo : MENSAGEM_QUANTIDADE[resultado.erro]
      ctx.addIssue({ code: 'custom', message })
    }
  })

/** Limite de codigos de barras por produto (o backend aplica o mesmo). */
export const MAXIMO_CODIGOS_BARRAS = 20

/** Tamanho maximo do nome curto (cupom e botoes do PDV). */
export const TAMANHO_MAXIMO_NOME_CURTO = 30

/**
 * Nome usado no cupom e no PDV, com a regra do backend (`nomeCurtoEfetivo`):
 * o nome curto, ou os 30 primeiros caracteres do nome, aparados.
 */
export function nomeCurtoEfetivo(nome: string, nomeCurto: string): string {
  const curto = nomeCurto.trim()
  if (curto !== '') {
    return curto
  }
  return nome.trim().slice(0, TAMANHO_MAXIMO_NOME_CURTO).trim()
}

/** O que as regras de promocao e atacado leem do formulario (antes da validacao do Zod). */
interface ValoresPrecoEspecial {
  precoVenda: string
  precoMinimo: string
  promocaoAtiva: boolean
  precoPromocional: string
  promocaoInicio: string
  promocaoFim: string
  atacadoAtivo: boolean
  precoAtacado: string
  quantidadeMinimaAtacado: string
}

type CampoPrecoEspecial = 'precoPromocional' | 'precoAtacado'

/**
 * Regras comuns do preco promocional e do de atacado (spec 4.3 e 4.4), com as
 * mensagens do backend: informado, > 0, < preco de venda e >= preco minimo.
 */
function validarPrecoEspecial(
  valores: ValoresPrecoEspecial,
  ctx: z.RefinementCtx,
  campo: CampoPrecoEspecial,
  nome: 'promocional' | 'de atacado',
) {
  const erro = (message: string) => ctx.addIssue({ path: [campo], code: 'custom', message })
  const texto = valores[campo].trim()
  if (texto === '') {
    erro(`Informe o preço ${nome}.`)
    return
  }
  const preco = Number(texto)
  const venda = numeroValido(valores.precoVenda)
  const minimo = numeroValido(valores.precoMinimo)
  if (!Number.isFinite(preco)) {
    erro('Informe um número válido.')
  } else if (preco <= 0) {
    erro(`Preço ${nome} deve ser maior que zero.`)
  } else if (venda !== null && preco >= venda) {
    erro(`Preço ${nome} deve ser menor que o preço de venda.`)
  } else if (minimo !== null && preco < minimo) {
    erro(`Preço ${nome} não pode ser menor que o preço mínimo.`)
  }
}

function validarPromocao(valores: ValoresPrecoEspecial, ctx: z.RefinementCtx) {
  if (!valores.promocaoAtiva) {
    return
  }
  validarPrecoEspecial(valores, ctx, 'precoPromocional', 'promocional')
  const { promocaoInicio: inicio, promocaoFim: fim } = valores
  if (inicio === '') {
    ctx.addIssue({ path: ['promocaoInicio'], code: 'custom', message: 'Informe o início da promoção.' })
  }
  if (fim === '') {
    ctx.addIssue({ path: ['promocaoFim'], code: 'custom', message: 'Informe o fim da promoção.' })
  } else if (inicio !== '' && fim < inicio) {
    // Datas yyyy-mm-dd comparam na ordem do texto.
    ctx.addIssue({ path: ['promocaoFim'], code: 'custom', message: 'O fim da promoção não pode ser antes do início.' })
  }
}

interface ValoresEstoque {
  controlaEstoque: boolean
  estoqueInicial: string
  estoqueMinimo: string
  pontoReposicao: string
  estoqueMaximo: string
}

/**
 * Regras do estoque (spec 4.4 e 4.6): estoque inicial > 0 com ate 3 casas (so
 * com o controle ligado) e minimo <= ponto de reposicao <= maximo quando os
 * dois lados estao informados. Os niveis valem mesmo com o controle desligado:
 * eles sao enviados do mesmo jeito.
 */
function validarEstoque(valores: ValoresEstoque, ctx: z.RefinementCtx) {
  const erro = (campo: keyof ValoresEstoque, message: string) => ctx.addIssue({ path: [campo], code: 'custom', message })
  const inicial = valores.controlaEstoque ? validarQuantidade(valores.estoqueInicial) : null
  if (inicial !== null && ('valor' in inicial ? inicial.valor <= 0 : inicial.erro === 'negativo')) {
    erro('estoqueInicial', 'O estoque inicial deve ser maior que zero.')
  } else if (inicial !== null && 'erro' in inicial && inicial.erro !== 'vazio' && inicial.erro !== 'negativo') {
    erro('estoqueInicial', MENSAGEM_QUANTIDADE[inicial.erro])
  }

  const minimo = interpretarQuantidade(valores.estoqueMinimo)
  const ponto = interpretarQuantidade(valores.pontoReposicao)
  const maximo = interpretarQuantidade(valores.estoqueMaximo)
  if (minimo !== null && ponto !== null && ponto < minimo) {
    erro('pontoReposicao', 'O ponto de reposição não pode ser menor que o estoque mínimo.')
  }
  if (maximo !== null && ponto !== null && maximo < ponto) {
    erro('estoqueMaximo', 'O estoque máximo não pode ser menor que o ponto de reposição.')
  } else if (maximo !== null && minimo !== null && maximo < minimo) {
    erro('estoqueMaximo', 'Estoque máximo não pode ser menor que o estoque mínimo.')
  }
}

export const MENSAGEM_CODIGO_PRODUTO_INVALIDO = 'O código do produto deve ter de 1 a 6 dígitos.'
export const MENSAGEM_BALANCA_SEM_CODIGO = 'Informe o código do produto para vendê-lo na balança.'

/**
 * Codigo do produto (spec B2 §2), com as mensagens da API: vazio e permitido,
 * salvo com "Vendido na balança"; senao de 1 a 6 digitos (zeros a esquerda
 * aceitos e ignorados).
 */
function validarCodigoProduto(valores: { codigo: string; vendidoBalanca: boolean }, ctx: z.RefinementCtx) {
  const codigo = interpretarCodigoProduto(valores.codigo)
  const erro = (message: string) => ctx.addIssue({ path: ['codigo'], code: 'custom', message })
  if (codigo === 'invalido') {
    erro(MENSAGEM_CODIGO_PRODUTO_INVALIDO)
  } else if (codigo === null && valores.vendidoBalanca) {
    erro(MENSAGEM_BALANCA_SEM_CODIGO)
  }
}

/** Ajuda do codigo com "Vendido na balança": quantos digitos a etiqueta configurada comporta. */
export function textoTamanhoNaEtiqueta(digitosCodigo: number): string {
  return `A etiqueta da balança comporta até ${digitosCodigo} dígitos.`
}

/**
 * Codigo com "Vendido na balança" maior que a etiqueta configurada (a mensagem
 * do backend, spec B2 §2). Checado no envio, com a configuracao ja buscada;
 * sem ela (null), o backend decide.
 */
export function erroCodigoNaEtiqueta(
  valores: Pick<ProdutoFormValues, 'codigo' | 'vendidoBalanca'>,
  digitosCodigo: number | null,
): string | null {
  const codigo = interpretarCodigoProduto(valores.codigo)
  if (!valores.vendidoBalanca || digitosCodigo === null || typeof codigo !== 'number') {
    return null
  }
  return String(codigo).length > digitosCodigo
    ? `Este código tem mais dígitos do que a etiqueta da balança comporta (${digitosCodigo}).`
    : null
}

function validarAtacado(valores: ValoresPrecoEspecial, ctx: z.RefinementCtx) {
  if (!valores.atacadoAtivo) {
    return
  }
  validarPrecoEspecial(valores, ctx, 'precoAtacado', 'de atacado')
  const erro = (message: string) => ctx.addIssue({ path: ['quantidadeMinimaAtacado'], code: 'custom', message })
  const texto = valores.quantidadeMinimaAtacado.trim()
  const quantidade = Number(texto)
  if (texto === '') {
    erro('Informe a quantidade mínima do atacado.')
  } else if (!Number.isFinite(quantidade)) {
    erro('Informe um número válido.')
  } else if (quantidade <= 1) {
    erro('A quantidade mínima do atacado deve ser maior que 1.')
  } else if (!/^\d+(\.\d{1,3})?$/.test(texto)) {
    // NUMERIC(12,3) no backend.
    erro('A quantidade mínima do atacado deve ter no máximo 3 casas decimais.')
  }
}

// --- Embalagens (Fase B3) ------------------------------------------------------

/** Limites da spec B3 §2 (o backend aplica os mesmos). */
export const MAXIMO_EMBALAGENS = 10
export const MAXIMO_CODIGOS_POR_EMBALAGEM = 5

/**
 * Uma embalagem no formulario. A quantidade e texto com virgula (como as
 * quantidades de estoque); o preco, a string do `CampoMoeda` ('' = sem preco
 * proprio). `codigoPendente` e o texto de "Adicionar código" da embalagem
 * ainda nao adicionado (nao vai no request; o salvar tenta adiciona-lo).
 */
export interface EmbalagemFormValues {
  /** UUID da embalagem gravada; ausente na nova. */
  id?: string
  unidadeId: string
  quantidade: string
  preco: string
  deCompra: boolean
  codigosBarras: string[]
  codigoPendente: string
}

/** Campos de uma embalagem, na ordem da tela (contagem de erros e foco). */
export const CAMPOS_DA_EMBALAGEM = [
  'unidadeId',
  'quantidade',
  'preco',
  'deCompra',
  'codigoPendente',
  'codigosBarras',
] as const
export type CampoDaEmbalagem = (typeof CAMPOS_DA_EMBALAGEM)[number]

/** Embalagem nova (botao "Adicionar embalagem"): vazia e fora da compra. */
export function novaEmbalagem(): EmbalagemFormValues {
  return { unidadeId: '', quantidade: '', preco: '', deCompra: false, codigosBarras: [], codigoPendente: '' }
}

const embalagemSchema = z.object({
  id: z.string().optional(),
  unidadeId: z.string(),
  quantidade: z.string(),
  preco: z.string().trim(),
  deCompra: z.boolean(),
  codigosBarras: z
    .array(z.string())
    .max(MAXIMO_CODIGOS_POR_EMBALAGEM, `Informe no máximo ${MAXIMO_CODIGOS_POR_EMBALAGEM} códigos de barras por embalagem.`),
  codigoPendente: z.string(),
})

/** O que as regras das embalagens leem do formulario. */
interface ValoresEmbalagens {
  unidadeId: string
  precoMinimo: string
  embalagens: readonly EmbalagemFormValues[]
}

/**
 * Regras de cada embalagem (spec B3 §2 e §3.3), com as mensagens da API e na
 * ordem do backend: unidade diferente da de venda, quantidade > 1, fracao pela
 * unidade de venda, repetida, uma so de compra e preco > 0 sem ficar, por
 * unidade, abaixo do minimo. Com a unidade de venda desconhecida (lista
 * carregando), a fracao fica para o backend.
 */
function validarEmbalagens(valores: ValoresEmbalagens, unidades: readonly UnidadeComFracao[], ctx: z.RefinementCtx) {
  const venda = unidades.find((unidade) => unidade.id === valores.unidadeId)
  const siglaDeVenda = venda?.sigla ?? ''
  const vistas = new Set<string>()
  let temCompra = false
  valores.embalagens.forEach((embalagem, indice) => {
    const erro = (campo: CampoDaEmbalagem, message: string) =>
      ctx.addIssue({ path: ['embalagens', indice, campo], code: 'custom', message })
    if (embalagem.unidadeId === '') {
      erro('unidadeId', 'Selecione a unidade da embalagem.')
    } else if (embalagem.unidadeId === valores.unidadeId) {
      erro('unidadeId', `A embalagem precisa de uma unidade diferente da unidade de venda (${siglaDeVenda}).`)
    } else {
      const erroQuantidade = erroDaQuantidadeDaEmbalagem(embalagem.quantidade, venda)
      const chave = `${embalagem.unidadeId}|${interpretarQuantidade(embalagem.quantidade)}`
      if (erroQuantidade) {
        erro('quantidade', erroQuantidade)
      } else if (vistas.has(chave)) {
        const sigla = unidades.find((unidade) => unidade.id === embalagem.unidadeId)?.sigla ?? ''
        const rotulo = rotuloDaEmbalagem(sigla, embalagem.quantidade, siglaDeVenda)
        erro('quantidade', `Já existe a embalagem ${rotulo} neste produto.`)
      }
      vistas.add(chave)
    }
    if (embalagem.deCompra && temCompra) {
      erro('deCompra', 'Só uma embalagem pode ser a de compra.')
    }
    temCompra = temCompra || embalagem.deCompra
    const erroPreco = erroDoPrecoDaEmbalagem(embalagem, valores.precoMinimo, siglaDeVenda)
    if (erroPreco) {
      erro('preco', erroPreco)
    }
  })
}

/** "A embalagem precisa conter mais de 1 UN." (sem a sigla enquanto a unidade nao e conhecida). */
function mensagemMaisDeUm(venda: UnidadeComFracao | undefined): string {
  return `A embalagem precisa conter mais de 1 ${venda?.sigla ?? 'unidade de venda'}.`
}

function erroDaQuantidadeDaEmbalagem(texto: string, venda: UnidadeComFracao | undefined): string | null {
  const resultado = validarQuantidade(texto)
  if ('erro' in resultado) {
    if (resultado.erro === 'vazio') {
      return 'Informe a quantidade da embalagem.'
    }
    return resultado.erro === 'negativo' ? mensagemMaisDeUm(venda) : MENSAGEM_QUANTIDADE[resultado.erro]
  }
  if (resultado.valor <= 1) {
    return mensagemMaisDeUm(venda)
  }
  if (venda && !venda.fracionada && !Number.isInteger(resultado.valor)) {
    return `${venda.sigla} não aceita quantidade fracionada. Informe um número inteiro.`
  }
  return null
}

function erroDoPrecoDaEmbalagem(embalagem: EmbalagemFormValues, precoMinimo: string, siglaDeVenda: string): string | null {
  const preco = embalagem.preco.trim()
  if (preco === '') {
    return null
  }
  if (!(Number(preco) > 0)) {
    return 'O preço da embalagem deve ser maior que zero.'
  }
  const porUnidade = valorPorUnidadeAbaixoDoMinimo(preco, embalagem.quantidade, precoMinimo)
  if (porUnidade === null) {
    return null
  }
  return `O preço da embalagem dá ${formatarMoeda(Number(porUnidade))} por ${siglaDeVenda}, abaixo do preço mínimo (${formatarMoeda(Number(precoMinimo))}).`
}

const camposDoProduto = {
  nome: z.string().trim()
    .min(1, 'Informe o nome do produto.')
    .max(150, 'Nome deve ter no máximo 150 caracteres.'),
  nomeCurto: textoOpcional(30, 'Nome curto deve ter no máximo 30 caracteres.'),
  unidadeId: z.string().min(1, 'Selecione a unidade de venda.'),
  categoriaId: z.string().nullable(),
  marca: textoOpcional(100, 'Marca deve ter no máximo 100 caracteres.'),
  fornecedor: textoOpcional(100, 'Fornecedor deve ter no máximo 100 caracteres.'),
  descricao: textoOpcional(1000, 'Descrição deve ter no máximo 1000 caracteres.'),
  precoVenda: numeroObrigatorio,
  custo: numeroOpcional('Custo não pode ser negativo.'),
  precoMinimo: numeroOpcional('Preço mínimo não pode ser negativo.'),
  /** Interruptor "Controlar estoque" (ligado por padrao). Desligado, o saldo fica guardado. */
  controlaEstoque: z.boolean(),
  /** So no cadastro novo: vira a primeira entrada de estoque (validado no superRefine). */
  estoqueInicial: z.string().trim(),
  estoqueMinimo: quantidadeOpcional('Estoque mínimo não pode ser negativo.'),
  estoqueMaximo: quantidadeOpcional('Estoque máximo não pode ser negativo.'),
  pontoReposicao: quantidadeOpcional('Ponto de reposição não pode ser negativo.'),
  /** Codigo do produto como digitado (zeros a esquerda aceitos); validado no superRefine. */
  codigo: z.string(),
  /** "Vendido na balança": exige o codigo (validado no superRefine). */
  vendidoBalanca: z.boolean(),
  sku: textoOpcional(50, 'SKU deve ter no máximo 50 caracteres.'),
  codigosBarras: z.array(z.string()).max(MAXIMO_CODIGOS_BARRAS, 'Informe no máximo 20 códigos de barras.'),
  /**
   * Texto digitado em "Adicionar código" e ainda nao adicionado. Fica no
   * formulario (conta como alteracao), mas nao vai
   * no request: ao salvar, a pagina tenta adiciona-lo a lista antes de enviar.
   */
  codigoPendente: z.string(),
  /** Interruptor do bloco de promocao: desligado, o request vai com `promocao: null`. */
  promocaoAtiva: z.boolean(),
  precoPromocional: z.string().trim(),
  /** Datas do `<input type="date">` (yyyy-mm-dd), inicio e fim inclusivos. */
  promocaoInicio: z.string(),
  promocaoFim: z.string(),
  /** Interruptor do bloco de atacado: desligado, o request vai com `atacado: null`. */
  atacadoAtivo: z.boolean(),
  precoAtacado: z.string().trim(),
  quantidadeMinimaAtacado: z.string().trim(),
  /** Embalagens de venda (Fase B3), na ordem da tela. */
  embalagens: z.array(embalagemSchema).max(MAXIMO_EMBALAGENS, `Informe no máximo ${MAXIMO_EMBALAGENS} embalagens.`),
}

/**
 * Schema do formulario com as unidades conhecidas (lista do catalogo + a do
 * produto): as regras das embalagens dependem da sigla e da fracao da unidade
 * de venda. A pagina valida com a lista mais recente.
 */
export function produtoSchemaCom(unidades: readonly UnidadeComFracao[]) {
  return z.object(camposDoProduto).superRefine((valores, ctx) => {
    validarPromocao(valores, ctx)
    validarAtacado(valores, ctx)
    validarEstoque(valores, ctx)
    validarCodigoProduto(valores, ctx)
    validarEmbalagens(valores, unidades, ctx)
    const preenchido = (valor: string) => valor.trim() !== ''
    if (
      preenchido(valores.precoMinimo) &&
      preenchido(valores.precoVenda) &&
      Number(valores.precoMinimo) > Number(valores.precoVenda)
    ) {
      ctx.addIssue({
        path: ['precoMinimo'],
        code: 'custom',
        message: 'Preço mínimo não pode ser maior que o preço de venda.',
      })
    }
  })
}

/** Schema sem a lista de unidades (as regras que dependem dela ficam para o backend). */
export const produtoSchema = produtoSchemaCom([])

export type ProdutoFormValues = z.infer<typeof produtoSchema>

/**
 * Secoes da pagina do produto (tela unica, spec B2 §4), na ordem de exibicao.
 * Historico so existe na edicao.
 */
export const SECOES_PRODUTO = ['geral', 'codigos', 'precos', 'embalagens', 'estoque', 'historico'] as const
export type SecaoProduto = (typeof SECOES_PRODUTO)[number]

export const ROTULO_SECAO: Readonly<Record<SecaoProduto, string>> = {
  geral: 'Geral',
  codigos: 'Códigos',
  precos: 'Preços',
  embalagens: 'Embalagens',
  estoque: 'Estoque',
  historico: 'Histórico',
}

/**
 * Campos de cada secao, na ordem da tela: alimenta a contagem de erros do
 * atalho e diz qual campo focar ao salvar com erro. Todo campo do formulario
 * aparece em exatamente uma secao (garantido por teste). Historico e so
 * leitura: nenhum campo.
 */
export const CAMPOS_POR_SECAO: Readonly<Record<SecaoProduto, readonly (keyof ProdutoFormValues)[]>> = {
  geral: ['nome', 'nomeCurto', 'unidadeId', 'precoVenda', 'categoriaId', 'marca', 'fornecedor', 'descricao'],
  codigos: ['codigoPendente', 'codigosBarras', 'codigo', 'vendidoBalanca', 'sku'],
  precos: [
    'custo',
    'precoMinimo',
    'promocaoAtiva',
    'precoPromocional',
    'promocaoInicio',
    'promocaoFim',
    'atacadoAtivo',
    'precoAtacado',
    'quantidadeMinimaAtacado',
  ],
  estoque: [
    'controlaEstoque',
    'estoqueInicial',
    'estoqueMinimo',
    'pontoReposicao',
    'estoqueMaximo',
  ],
  embalagens: ['embalagens'],
  historico: [],
}

/** Secao que mostra o campo (aceita o caminho de um campo de embalagem, "embalagens.0.preco"). */
export function secaoDoCampo(caminho: string): SecaoProduto {
  const campo = caminho.split('.')[0]
  return SECOES_PRODUTO.find((secao) => (CAMPOS_POR_SECAO[secao] as readonly string[]).includes(campo)) ?? 'geral'
}

/** Para onde ir ao salvar com erro: o primeiro campo em erro, na ordem das secoes, e a secao dele. */
export function primeiroCampoComErro(
  comErro: (campo: keyof ProdutoFormValues) => boolean,
): { secao: SecaoProduto; campo: keyof ProdutoFormValues } | null {
  for (const secao of SECOES_PRODUTO) {
    const campo = CAMPOS_POR_SECAO[secao].find(comErro)
    if (campo) {
      return { secao, campo }
    }
  }
  return null
}

/**
 * Id do elemento que recebe o foco de cada campo: o proprio caminho
 * ("embalagens.0.quantidade"), salvo o texto pendente, que e o campo
 * "Adicionar código" da lista (`codigosBarras` ou `embalagens.0.codigosBarras`).
 */
export function idDoCampo(caminho: string): string {
  return caminho.replace(/(^|\.)codigoPendente$/, '$1codigosBarras')
}

/** Objeto com uma `message` de texto (um erro do RHF). */
function temMensagem(valor: unknown): boolean {
  return typeof valor === 'object' && valor !== null && 'message' in valor && typeof valor.message === 'string'
}

/**
 * Caminhos dos campos com erro nas embalagens, na ordem da tela (embalagem a
 * embalagem, campo a campo), para a contagem no atalho e o foco ao salvar. O
 * texto pendente e a lista de codigos da mesma embalagem contam uma vez (vale o
 * pendente, que e o campo focado). O erro da lista inteira (mais de 10) vem
 * como "embalagens". Recebe o `errors.embalagens` do RHF.
 */
export function caminhosComErroNasEmbalagens(erros: unknown): string[] {
  if (typeof erros !== 'object' || erros === null) {
    return []
  }
  const lista = erros as Record<string, unknown>
  const caminhos = temMensagem(lista) || temMensagem(lista.root) ? ['embalagens'] : []
  const indices = Object.keys(lista)
    .filter((chave) => /^\d+$/.test(chave))
    .map(Number)
    .sort((a, b) => a - b)
  for (const indice of indices) {
    const campos = lista[indice]
    if (typeof campos !== 'object' || campos === null) {
      continue
    }
    const daEmbalagem = campos as Record<string, unknown>
    for (const campo of CAMPOS_DA_EMBALAGEM) {
      const emDobro = campo === 'codigosBarras' && temMensagem(daEmbalagem.codigoPendente)
      if (!emDobro && temMensagem(daEmbalagem[campo])) {
        caminhos.push(`embalagens.${indice}.${campo}`)
      }
    }
  }
  return caminhos
}

/** Valores de um produto novo; `unidadePadraoId` ja escolhe a unidade de venda. */
export function valoresIniciais(unidadePadraoId = ''): ProdutoFormValues {
  return {
    nome: '',
    nomeCurto: '',
    unidadeId: unidadePadraoId,
    categoriaId: null,
    marca: '',
    fornecedor: '',
    descricao: '',
    precoVenda: '',
    custo: '',
    precoMinimo: '',
    controlaEstoque: true,
    estoqueInicial: '',
    estoqueMinimo: '',
    estoqueMaximo: '',
    pontoReposicao: '',
    codigo: '',
    vendidoBalanca: false,
    sku: '',
    codigosBarras: [],
    codigoPendente: '',
    promocaoAtiva: false,
    precoPromocional: '',
    promocaoInicio: '',
    promocaoFim: '',
    atacadoAtivo: false,
    precoAtacado: '',
    quantidadeMinimaAtacado: '',
    embalagens: [],
  }
}

/** Campos que "Salvar e cadastrar outro" mantem para o cadastro em sequencia. */
export function valoresParaCadastrarOutro(
  anteriores: ProdutoFormValues,
): ProdutoFormValues {
  return {
    ...valoresIniciais(anteriores.unidadeId),
    categoriaId: anteriores.categoriaId,
    marca: anteriores.marca,
    fornecedor: anteriores.fornecedor,
  }
}

function numeroParaTexto(valor: number | null): string {
  return valor === null ? '' : String(valor)
}

/** Valores do formulario a partir do produto vindo da API (modo edicao). */
export function valoresDoProduto(produto: Produto): ProdutoFormValues {
  return {
    nome: produto.nome,
    nomeCurto: produto.nomeCurto ?? '',
    unidadeId: produto.unidade.id,
    categoriaId: produto.categoria?.id ?? null,
    marca: produto.marca ?? '',
    fornecedor: produto.fornecedor ?? '',
    descricao: produto.descricao ?? '',
    precoVenda: String(produto.precoVenda),
    custo: numeroParaTexto(produto.custo),
    precoMinimo: numeroParaTexto(produto.precoMinimo),
    controlaEstoque: produto.controlaEstoque,
    estoqueInicial: '',
    estoqueMinimo: quantidadeParaTexto(produto.estoqueMinimo),
    estoqueMaximo: quantidadeParaTexto(produto.estoqueMaximo),
    pontoReposicao: quantidadeParaTexto(produto.pontoReposicao),
    codigo: numeroParaTexto(produto.codigo),
    vendidoBalanca: produto.vendidoBalanca,
    sku: produto.sku ?? '',
    codigosBarras: produto.codigosBarras.map((codigo) => codigo.codigo),
    codigoPendente: '',
    promocaoAtiva: produto.promocao !== null,
    precoPromocional: numeroParaTexto(produto.promocao?.preco ?? null),
    promocaoInicio: produto.promocao?.inicio ?? '',
    promocaoFim: produto.promocao?.fim ?? '',
    atacadoAtivo: produto.atacado !== null,
    precoAtacado: numeroParaTexto(produto.atacado?.preco ?? null),
    quantidadeMinimaAtacado: numeroParaTexto(produto.atacado?.quantidadeMinima ?? null),
    embalagens: produto.embalagens.map((embalagem) => ({
      id: embalagem.id,
      unidadeId: embalagem.unidade.id,
      quantidade: quantidadeParaTexto(embalagem.quantidade),
      preco: numeroParaTexto(embalagem.preco),
      deCompra: embalagem.deCompra,
      codigosBarras: embalagem.codigosBarras.map((codigo) => codigo.codigo),
      codigoPendente: '',
    })),
  }
}

function textoOuNulo(valor: string): string | null {
  const texto = valor.trim()
  return texto === '' ? null : texto
}

function numeroOuNulo(valor: string): number | null {
  const texto = valor.trim()
  return texto === '' ? null : Number(texto)
}

/**
 * Corpo do POST/PATCH. A lista de codigos vai sempre inteira (o PATCH a
 * substitui); promocao e atacado vao sempre, `null` com o interruptor desligado.
 * O estoque inicial so existe no cadastro (`novo`) e com o controle ligado; o
 * PATCH nem leva a chave.
 */
export function montarRequest(valores: ProdutoFormValues, { novo = false }: { novo?: boolean } = {}): ProdutoRequest {
  const estoqueInicial = novo
    ? { estoqueInicial: valores.controlaEstoque ? interpretarQuantidade(valores.estoqueInicial) : null }
    : {}
  const codigo = interpretarCodigoProduto(valores.codigo)
  return {
    ...estoqueInicial,
    // O schema ja barrou o invalido; por garantia, ele nunca vai no request.
    codigo: codigo === 'invalido' ? null : codigo,
    vendidoBalanca: valores.vendidoBalanca,
    nome: valores.nome.trim(),
    nomeCurto: textoOuNulo(valores.nomeCurto),
    unidadeId: valores.unidadeId,
    categoriaId: valores.categoriaId,
    marca: textoOuNulo(valores.marca),
    fornecedor: textoOuNulo(valores.fornecedor),
    descricao: textoOuNulo(valores.descricao),
    precoVenda: Number(valores.precoVenda),
    custo: numeroOuNulo(valores.custo),
    precoMinimo: numeroOuNulo(valores.precoMinimo),
    controlaEstoque: valores.controlaEstoque,
    // Niveis aceitam virgula; vazio vira null.
    estoqueMinimo: interpretarQuantidade(valores.estoqueMinimo),
    estoqueMaximo: interpretarQuantidade(valores.estoqueMaximo),
    pontoReposicao: interpretarQuantidade(valores.pontoReposicao),
    codigosBarras: valores.codigosBarras,
    sku: textoOuNulo(valores.sku),
    promocao: valores.promocaoAtiva
      ? { preco: Number(valores.precoPromocional), inicio: valores.promocaoInicio, fim: valores.promocaoFim }
      : null,
    atacado: valores.atacadoAtivo
      ? { preco: Number(valores.precoAtacado), quantidadeMinima: Number(valores.quantidadeMinimaAtacado) }
      : null,
    embalagens: valores.embalagens.map(embalagemDoRequest),
  }
}

/** Uma embalagem do request: a nova vai sem `id`; o texto pendente nunca vai. */
function embalagemDoRequest(embalagem: EmbalagemFormValues): EmbalagemRequest {
  return {
    ...(embalagem.id ? { id: embalagem.id } : {}),
    unidadeId: embalagem.unidadeId,
    // O schema ja barrou a quantidade invalida.
    quantidade: interpretarQuantidade(embalagem.quantidade) ?? 0,
    preco: numeroOuNulo(embalagem.preco),
    deCompra: embalagem.deCompra,
    codigosBarras: embalagem.codigosBarras,
  }
}

// --- Codigos de barras -------------------------------------------------------

/** Tamanho maximo de um codigo (coluna `VARCHAR(50)` do backend). */
export const TAMANHO_MAXIMO_CODIGO = 50

export const MENSAGEM_CODIGO_REPETIDO = 'Este código já está na lista.'
/** Codigo que ja esta na lista da unidade ou de outra embalagem do mesmo produto. */
export const MENSAGEM_CODIGO_EM_OUTRA_LISTA = 'Este código já está em outra lista deste produto.'
export const MENSAGEM_DIGITO_INVALIDO =
  'Este código não confere (o último dígito não bate). Leia de novo ou confira os números.'
/** Codigo barrado pelo limite da lista ("Limite de 20 códigos de barras atingido."). */
export function mensagemLimiteCodigos(limite: number): string {
  return `Limite de ${limite} códigos de barras atingido.`
}
export const MENSAGEM_LIMITE_CODIGOS = mensagemLimiteCodigos(MAXIMO_CODIGOS_BARRAS)
export const MENSAGEM_CODIGO_LONGO = `O código deve ter no máximo ${TAMANHO_MAXIMO_CODIGO} caracteres.`

/** Formatos dos codigos ja gravados no produto, por codigo. */
export type FormatosGravados = ReadonlyMap<string, FormatoCodigoBarras>

/**
 * Formatos gravados do produto em edicao (vazio no cadastro): os da unidade e
 * os das embalagens. Um codigo gravado pode mudar de lista sem ser rebloqueado.
 */
export function formatosDoProduto(produto: Produto | null): FormatosGravados {
  const codigos = [
    ...(produto?.codigosBarras ?? []),
    ...(produto?.embalagens ?? []).flatMap((embalagem) => embalagem.codigosBarras),
  ]
  return new Map(codigos.map(({ codigo, formato }) => [codigo, formato]))
}

/** Resultado de tentar colocar o texto digitado na lista de codigos. */
export type ResultadoNovoCodigo =
  | { tipo: 'vazio' }
  | { tipo: 'bloqueado'; motivo: string }
  | { tipo: 'aceito'; codigo: string; lista: string[] }

/**
 * Regras para adicionar um codigo (as mesmas do backend): normaliza o texto,
 * barra repetido (na lista ou em `outrasListas` do mesmo produto: a unidade e
 * as embalagens), mais que o `limite` (20 na unidade, 5 na embalagem), mais de
 * 50 caracteres e codigo novo com digito verificador invalido. Um codigo ja
 * gravado (ex.: `OUTRO` migrado com digito invalido) volta sem bloqueio.
 */
export function avaliarNovoCodigo(
  entrada: string,
  lista: readonly string[],
  formatosGravados: FormatosGravados,
  limite: number = MAXIMO_CODIGOS_BARRAS,
  outrasListas: readonly string[] = [],
): ResultadoNovoCodigo {
  const codigo = normalizarCodigo(entrada)
  if (codigo === '') {
    return { tipo: 'vazio' }
  }
  if (lista.includes(codigo)) {
    return { tipo: 'bloqueado', motivo: MENSAGEM_CODIGO_REPETIDO }
  }
  if (outrasListas.includes(codigo)) {
    return { tipo: 'bloqueado', motivo: MENSAGEM_CODIGO_EM_OUTRA_LISTA }
  }
  if (lista.length >= limite) {
    return { tipo: 'bloqueado', motivo: mensagemLimiteCodigos(limite) }
  }
  if (codigo.length > TAMANHO_MAXIMO_CODIGO) {
    return { tipo: 'bloqueado', motivo: MENSAGEM_CODIGO_LONGO }
  }
  const jaGravado = formatosGravados.has(codigo)
  if (!jaGravado && ehCandidatoGs1(codigo) && !digitoVerificadorValido(codigo)) {
    return { tipo: 'bloqueado', motivo: MENSAGEM_DIGITO_INVALIDO }
  }
  return { tipo: 'aceito', codigo, lista: [...lista, codigo] }
}

// --- Unidades ----------------------------------------------------------------

export interface OpcaoUnidade {
  id: string
  rotulo: string
}

/**
 * Opcoes do select de unidade: as ativas ("UN — Unidade") e, se houver, a
 * unidade atual do produto mesmo inativa, marcada "(inativa)". O backend aceita
 * manter a atual inativa, mas recusa escolher outra inativa.
 */
export function opcoesDeUnidade(unidades: UnidadeMedida[], atual: UnidadeResumo | null): OpcaoUnidade[] {
  const rotular = (sigla: string, descricao: string) => `${sigla} — ${descricao}`
  const ativas = unidades
    .filter((unidade) => unidade.ativo)
    .map((unidade) => ({ id: unidade.id, rotulo: rotular(unidade.sigla, unidade.descricao) }))
  if (!atual || ativas.some((opcao) => opcao.id === atual.id)) {
    return ativas
  }
  // Com a lista ainda carregando, mostra a atual sem afirmar o status.
  const conhecida = unidades.some((unidade) => unidade.id === atual.id)
  const rotulo = rotular(atual.sigla, atual.descricao)
  return [...ativas, { id: atual.id, rotulo: conhecida ? `${rotulo} (inativa)` : rotulo }]
}

/** Sigla que o cadastro de produto novo ja traz escolhida, se existir e estiver ativa. */
const SIGLA_UNIDADE_PADRAO = 'UN'

/** Id da unidade padrao (UN ativa) ou '' se nao houver. */
export function idUnidadePadrao(unidades: UnidadeMedida[]): string {
  return unidades.find((unidade) => unidade.ativo && unidade.sigla === SIGLA_UNIDADE_PADRAO)?.id ?? ''
}

// --- Precos ------------------------------------------------------------------

/** Numero de um texto do formulario; null se vazio ou invalido. */
export function numeroValido(valor: string): number | null {
  const texto = valor.trim()
  if (texto === '') {
    return null
  }
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Margem e markup derivados dos valores digitados, com as regras do backend:
 * margem = (preco - custo) / preco * 100 (exige preco > 0); markup =
 * (preco - custo) / custo * 100 (exige custo > 0). Null quando nao calculavel.
 */
export function calcularMargemMarkup(
  precoVenda: string,
  custo: string,
): { margem: number | null; markup: number | null } {
  const preco = numeroValido(precoVenda)
  const valorCusto = numeroValido(custo)
  if (preco === null || valorCusto === null || valorCusto < 0) {
    return { margem: null, markup: null }
  }
  return {
    margem: preco > 0 ? arredondar2(((preco - valorCusto) / preco) * 100) : null,
    markup: valorCusto > 0 ? arredondar2(((preco - valorCusto) / valorCusto) * 100) : null,
  }
}

/**
 * Aviso de preco abaixo do custo, que nao bloqueia o salvamento: "R$ 0,50
 * abaixo do custo (R$ 5,00). Vender por este preço dá prejuízo.". Null com
 * preco igual ou acima do custo, ou sem um dos dois valores.
 */
export function textoAbaixoDoCusto(preco: string, custo: string): string | null {
  const valorPreco = numeroValido(preco)
  const valorCusto = numeroValido(custo)
  if (valorPreco === null || valorCusto === null || valorPreco >= valorCusto) {
    return null
  }
  const diferenca = arredondar2(valorCusto - valorPreco)
  return `${formatarMoeda(diferenca)} abaixo do custo (${formatarMoeda(valorCusto)}). Vender por este preço dá prejuízo.`
}

/** Margem desejada com virgula ou ponto e ate 2 casas: de 0 a 99,99. */
export function margemDesejadaValida(margem: string): boolean {
  return margemEmCentesimos(margem) !== null
}

/** Margem desejada com virgula ou ponto e ate 2 casas, de 0 a 99,99, em centesimos de ponto percentual. */
function margemEmCentesimos(margem: string): bigint | null {
  const partes = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(margem.trim())
  if (!partes) {
    return null
  }
  const [, inteiros, decimais = ''] = partes
  return BigInt(`${inteiros}${decimais.padEnd(2, '0')}`)
}

/**
 * Preco de venda pela margem desejada: custo / (1 - margem / 100), arredondado
 * para centavos (meio para cima). A conta e feita em inteiros para nao herdar
 * erro de ponto flutuante (custo 7 e margem 30 -> "10.00"). Null sem custo > 0,
 * com margem fora de 0 a 99,99 ou com resultado acima de 12 digitos.
 */
export function calcularPrecoPelaMargem(custo: string, margem: string): string | null {
  const centavosCusto = BigInt(valorParaDigitos(custo) || '0')
  const centesimosMargem = margemEmCentesimos(margem)
  if (centavosCusto <= 0n || centesimosMargem === null) {
    return null
  }
  const divisor = 10000n - centesimosMargem
  // a / b com meio para cima, em inteiros: (2a + b) / 2b.
  const centavosPreco = (2n * centavosCusto * 10000n + divisor) / (2n * divisor)
  const digitos = centavosPreco.toString()
  return digitos.length > MAXIMO_DIGITOS_MOEDA ? null : digitosParaValor(digitos)
}

/** Markup desejado com virgula ou ponto e ate 2 casas: de 0 a 9.999,99. */
export function markupDesejadoValido(markup: string): boolean {
  return markupEmCentesimos(markup) !== null
}

/** Markup desejado com virgula ou ponto e ate 2 casas, de 0 a 9.999,99, em centesimos de ponto percentual. */
function markupEmCentesimos(markup: string): bigint | null {
  const partes = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(markup.trim())
  if (!partes) {
    return null
  }
  const [, inteiros, decimais = ''] = partes
  return BigInt(`${inteiros}${decimais.padEnd(2, '0')}`)
}

/**
 * Preco de venda pelo markup desejado: custo x (1 + markup / 100), arredondado
 * para centavos (meio para cima), com a conta em inteiros como a da margem
 * (custo 10 e markup 30 -> "13.00"). Null sem custo > 0, com markup fora de 0 a
 * 9.999,99 ou com resultado acima de 12 digitos.
 */
export function calcularPrecoPeloMarkup(custo: string, markup: string): string | null {
  const centavosCusto = BigInt(valorParaDigitos(custo) || '0')
  const centesimosMarkup = markupEmCentesimos(markup)
  if (centavosCusto <= 0n || centesimosMarkup === null) {
    return null
  }
  // custo * (10000 + m) / 10000 com meio para cima, em inteiros: (2a + b) / 2b.
  const centavosPreco = (2n * centavosCusto * (10000n + centesimosMarkup) + 10000n) / 20000n
  const digitos = centavosPreco.toString()
  return digitos.length > MAXIMO_DIGITOS_MOEDA ? null : digitosParaValor(digitos)
}

// --- Promocao e atacado ------------------------------------------------------

/** Campos de texto de cada bloco opcional (limpos ao desligar o interruptor). */
export const CAMPOS_PROMOCAO = ['precoPromocional', 'promocaoInicio', 'promocaoFim'] as const
export const CAMPOS_ATACADO = ['precoAtacado', 'quantidadeMinimaAtacado'] as const
export type CampoDeBloco = (typeof CAMPOS_PROMOCAO)[number] | (typeof CAMPOS_ATACADO)[number]

/**
 * Chaves de `campos` do backend que nao tem o mesmo nome no formulario
 * (promocao e atacado sao objetos aninhados no request). Map, e nao objeto,
 * para uma chave como "constructor" nao casar com o prototipo.
 */
const CAMPO_DO_FORMULARIO_POR_CHAVE: ReadonlyMap<string, keyof ProdutoFormValues> = new Map([
  ['promocao', 'precoPromocional'],
  ['promocao.preco', 'precoPromocional'],
  ['promocao.inicio', 'promocaoInicio'],
  ['promocao.fim', 'promocaoFim'],
  ['atacado', 'precoAtacado'],
  ['atacado.preco', 'precoAtacado'],
  ['atacado.quantidadeMinima', 'quantidadeMinimaAtacado'],
])

/** Chave indexada de um campo de embalagem: `embalagens[1].quantidade` (e `...codigosBarras[2]`). */
const CHAVE_DE_EMBALAGEM = /^embalagens\[(\d+)\]\.(\w+)/

/**
 * Campo do formulario de uma chave de `campos` do backend: os aninhados de
 * promocao/atacado pelo mapa; os de embalagem pelo caminho
 * (`embalagens[1].quantidade` -> `embalagens.1.quantidade`; sem um campo
 * conhecido, a lista `embalagens`); os demais pelo nome sem indice
 * (`codigosBarras[2]` -> `codigosBarras`). Pode nao ser um campo do formulario.
 */
export function campoDaChaveDoServidor(chave: string): string {
  const doMapa = CAMPO_DO_FORMULARIO_POR_CHAVE.get(chave)
  if (doMapa) {
    return doMapa
  }
  const daEmbalagem = CHAVE_DE_EMBALAGEM.exec(chave)
  if (daEmbalagem) {
    const [, indice, campo] = daEmbalagem
    return (CAMPOS_DA_EMBALAGEM as readonly string[]).includes(campo) ? `embalagens.${indice}.${campo}` : 'embalagens'
  }
  return chave.split(/[[.]/)[0]
}

/** Interruptor do bloco a que o campo pertence (para ligar o bloco ao receber um erro nele). */
export function interruptorDoCampo(campo: keyof ProdutoFormValues): 'promocaoAtiva' | 'atacadoAtivo' | null {
  if ((CAMPOS_PROMOCAO as readonly string[]).includes(campo)) {
    return 'promocaoAtiva'
  }
  return (CAMPOS_ATACADO as readonly string[]).includes(campo) ? 'atacadoAtivo' : null
}

/** Formata a data no fuso fixo do MVP; o `en-CA` ja sai em yyyy-mm-dd. */
const DATA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Hoje em `America/Sao_Paulo` (o mesmo fuso do backend), em yyyy-mm-dd, o
 * formato do `<input type="date">`. Um navegador em outro fuso ve o mesmo dia
 * que o servidor.
 */
export function dataHojeSaoPaulo(agora: Date = new Date()): string {
  return DATA_EM_SAO_PAULO.format(agora)
}

/**
 * Situacao da promocao enquanto o usuario edita, com o `hoje` de
 * `dataHojeSaoPaulo` (a mesma regra do backend). Null sem as duas datas ou com
 * o fim antes do inicio.
 */
export function situacaoPromocaoLocal(inicio: string, fim: string, hoje: string): SituacaoPromocao | null {
  if (inicio === '' || fim === '' || fim < inicio) {
    return null
  }
  if (hoje < inicio) {
    return 'AGENDADA'
  }
  return hoje > fim ? 'ENCERRADA' : 'VIGENTE'
}

/** "dd/mm" de uma data yyyy-mm-dd, com "/aaaa" quando o ano nao e o de `hoje`. */
function diaEMes(data: string, hoje: string): string {
  const diaMes = `${data.slice(8, 10)}/${data.slice(5, 7)}`
  return data.slice(0, 4) === hoje.slice(0, 4) ? diaMes : `${diaMes}/${data.slice(0, 4)}`
}

/**
 * Texto do selo: "Vigente até 15/11", "Agendada para 01/11" ou "Encerrada em
 * 15/10. O produto voltou ao preço normal." (com o ano quando nao e o atual).
 */
export function textoSeloPromocao(situacao: SituacaoPromocao, inicio: string, fim: string, hoje: string): string {
  if (situacao === 'AGENDADA') {
    return `Agendada para ${diaEMes(inicio, hoje)}`
  }
  return situacao === 'VIGENTE'
    ? `Vigente até ${diaEMes(fim, hoje)}`
    : `Encerrada em ${diaEMes(fim, hoje)}. O produto voltou ao preço normal.`
}

/**
 * Ajuda "A partir de 12 UN, o preço passa a ser R$ 4,20 por unidade." ("por KG"
 * nas outras siglas; sem a sigla enquanto a unidade nao e conhecida). Null
 * enquanto faltar quantidade ou preco.
 */
export function textoAjudaAtacado(quantidade: string, preco: string, sigla: string | undefined): string | null {
  const valorQuantidade = numeroValido(quantidade)
  const valorPreco = numeroValido(preco)
  if (valorQuantidade === null || valorPreco === null || valorQuantidade <= 0 || valorPreco <= 0) {
    return null
  }
  const quantidadeTexto = valorQuantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  const aPartirDe = sigla ? `${quantidadeTexto} ${sigla}` : quantidadeTexto
  const porUnidade = !sigla || sigla === 'UN' ? 'unidade' : sigla
  return `A partir de ${aPartirDe}, o preço passa a ser ${formatarMoeda(valorPreco)} por ${porUnidade}.`
}

/**
 * Quantidade minima do atacado com fracao numa unidade de venda que nao e
 * fracionada (spec 4.4). Checada no envio, com a lista de unidades ja
 * carregada; unidade desconhecida fica para o backend.
 */
export function erroFracaoAtacado(
  valores: Pick<ProdutoFormValues, 'atacadoAtivo' | 'quantidadeMinimaAtacado' | 'unidadeId'>,
  unidades: readonly UnidadeComFracao[],
): string | null {
  const quantidade = valores.atacadoAtivo ? numeroValido(valores.quantidadeMinimaAtacado) : null
  return erroDeFracao(quantidade, valores.unidadeId, unidades)
}

/** Estoque inicial com fracao numa unidade de venda que nao e fracionada (spec 4.4), checado no envio. */
export function erroFracaoEstoqueInicial(
  valores: Pick<ProdutoFormValues, 'controlaEstoque' | 'estoqueInicial' | 'unidadeId'>,
  unidades: readonly UnidadeComFracao[],
): string | null {
  const quantidade = valores.controlaEstoque ? interpretarQuantidade(valores.estoqueInicial) : null
  return erroDeFracao(quantidade, valores.unidadeId, unidades)
}

/** O que as regras de fracao leem da unidade. */
export type UnidadeComFracao = Pick<UnidadeResumo, 'id' | 'sigla' | 'fracionada'>

/**
 * "A unidade UN não aceita quantidade fracionada." para uma quantidade com
 * fracao numa unidade nao fracionada; null sem quantidade, com quantidade
 * inteira ou com a unidade desconhecida (lista carregando: o backend decide).
 */
export function erroDeFracao(
  quantidade: number | null,
  unidadeId: string,
  unidades: readonly UnidadeComFracao[],
): string | null {
  if (quantidade === null || Number.isInteger(quantidade)) {
    return null
  }
  const unidade = unidades.find((candidata) => candidata.id === unidadeId)
  if (!unidade || unidade.fracionada) {
    return null
  }
  return `A unidade ${unidade.sigla} não aceita quantidade fracionada.`
}
