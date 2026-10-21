/**
 * Formulario do produto: schema Zod, valores iniciais, mapeamentos de/para a
 * API e a distribuicao dos campos pelas abas. Sem React: testavel isolado.
 */
import { z } from 'zod'

import { digitoVerificadorValido, ehCandidatoGs1, normalizarCodigo } from '@/lib/codigoBarras'
import type { UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import type { FormatoCodigoBarras, Produto, ProdutoRequest } from '@/types/produto'

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

// Espelha o backend: fator > 0 com ate 8 digitos inteiros e 4 casas decimais.
const fatorConversaoSchema = z.string().trim()
  .refine((valor) => valor === '' || Number.isFinite(Number(valor)), 'Informe um número válido.')
  .refine((valor) => valor === '' || Number(valor) > 0, 'O fator de conversão deve ser maior que zero.')
  .refine(
    (valor) => valor === '' || Number(valor) <= 0 || /^\d{1,8}(\.\d{1,4})?$/.test(valor),
    'Use até 8 dígitos inteiros e 4 casas decimais.',
  )

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

export const produtoSchema = z.object({
  nome: z.string().trim()
    .min(1, 'Informe o nome do produto.')
    .max(150, 'Nome deve ter no máximo 150 caracteres.'),
  nomeCurto: textoOpcional(30, 'Nome curto deve ter no máximo 30 caracteres.'),
  unidadeId: z.string().min(1, 'Selecione a unidade de venda.'),
  categoriaId: z.string().nullable(),
  unidadeCompraId: z.string(),
  fatorConversao: fatorConversaoSchema,
  marca: textoOpcional(100, 'Marca deve ter no máximo 100 caracteres.'),
  fornecedor: textoOpcional(100, 'Fornecedor deve ter no máximo 100 caracteres.'),
  descricao: textoOpcional(1000, 'Descrição deve ter no máximo 1000 caracteres.'),
  precoVenda: numeroObrigatorio,
  custo: numeroOpcional('Custo não pode ser negativo.'),
  precoMinimo: numeroOpcional('Preço mínimo não pode ser negativo.'),
  estoqueMinimo: numeroOpcional('Estoque mínimo não pode ser negativo.'),
  estoqueMaximo: numeroOpcional('Estoque máximo não pode ser negativo.'),
  pontoReposicao: numeroOpcional('Ponto de reposição não pode ser negativo.'),
  sku: textoOpcional(50, 'SKU deve ter no máximo 50 caracteres.'),
  codigosBarras: z.array(z.string()).max(MAXIMO_CODIGOS_BARRAS, 'Informe no máximo 20 códigos de barras.'),
  /**
   * Texto digitado em "Adicionar código" e ainda nao adicionado. Fica no
   * formulario (sobrevive a troca de aba e conta como alteracao), mas nao vai
   * no request: ao salvar, a pagina tenta adiciona-lo a lista antes de enviar.
   */
  codigoPendente: z.string(),
}).superRefine((valores, ctx) => {
  const preenchido = (valor: string) => valor.trim() !== ''
  const temUnidadeCompra = valores.unidadeCompraId !== ''
  const temFator = preenchido(valores.fatorConversao)
  if (temUnidadeCompra !== temFator) {
    ctx.addIssue({
      path: [temUnidadeCompra ? 'fatorConversao' : 'unidadeCompraId'],
      code: 'custom',
      message: 'Informe a unidade de compra e o fator de conversão juntos.',
    })
  }
  if (
    temUnidadeCompra &&
    temFator &&
    valores.unidadeCompraId === valores.unidadeId &&
    Number(valores.fatorConversao) !== 1
  ) {
    ctx.addIssue({
      path: ['fatorConversao'],
      code: 'custom',
      message: 'Quando a unidade de compra é a mesma de venda, o fator deve ser 1.',
    })
  }
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
  if (
    preenchido(valores.estoqueMaximo) &&
    preenchido(valores.estoqueMinimo) &&
    Number(valores.estoqueMaximo) < Number(valores.estoqueMinimo)
  ) {
    ctx.addIssue({
      path: ['estoqueMaximo'],
      code: 'custom',
      message: 'Estoque máximo não pode ser menor que o estoque mínimo.',
    })
  }
})

export type ProdutoFormValues = z.infer<typeof produtoSchema>

/** Abas da pagina do produto, na ordem de exibicao. */
export const ABAS_PRODUTO = ['geral', 'precos', 'estoque', 'codigos'] as const
export type AbaProduto = (typeof ABAS_PRODUTO)[number]

export const ROTULO_ABA: Readonly<Record<AbaProduto, string>> = {
  geral: 'Geral',
  precos: 'Preços',
  estoque: 'Estoque',
  codigos: 'Códigos',
}

/**
 * Campos de cada aba, na ordem da tela: alimenta o indicador de erro da aba e
 * diz qual campo focar ao salvar com erro. Todo campo do formulario aparece em
 * alguma aba; so os codigos de barras aparecem em duas (cadastro rapido na
 * Geral e a lista completa em Codigos), garantido por teste.
 */
export const CAMPOS_POR_ABA: Readonly<Record<AbaProduto, readonly (keyof ProdutoFormValues)[]>> = {
  geral: [
    'nome',
    'nomeCurto',
    'unidadeId',
    'precoVenda',
    'codigoPendente',
    'codigosBarras',
    'categoriaId',
    'marca',
    'fornecedor',
    'unidadeCompraId',
    'fatorConversao',
    'descricao',
  ],
  precos: ['custo', 'precoMinimo'],
  estoque: ['estoqueMinimo', 'pontoReposicao', 'estoqueMaximo'],
  codigos: ['sku', 'codigoPendente', 'codigosBarras'],
}

/**
 * Para onde ir ao salvar com erro: o primeiro campo em erro (na ordem das
 * abas) e a primeira aba que o mostra. Se a aba atual tambem mostra esse campo
 * (ex.: codigos de barras, em Geral e em Codigos), fica nela.
 */
export function primeiroCampoComErro(
  comErro: (campo: keyof ProdutoFormValues) => boolean,
  abaAtual?: AbaProduto,
): { aba: AbaProduto; campo: keyof ProdutoFormValues } | null {
  for (const aba of ABAS_PRODUTO) {
    const campo = CAMPOS_POR_ABA[aba].find(comErro)
    if (campo) {
      const ficaNaAtual = abaAtual !== undefined && CAMPOS_POR_ABA[abaAtual].includes(campo)
      return { aba: ficaNaAtual ? abaAtual : aba, campo }
    }
  }
  return null
}

/** Id do elemento que recebe o foco de cada campo (o texto pendente e o campo "Adicionar código"). */
export function idDoCampo(campo: keyof ProdutoFormValues): string {
  return campo === 'codigoPendente' ? 'codigosBarras' : campo
}

/** Valores de um produto novo; `unidadePadraoId` ja escolhe a unidade de venda. */
export function valoresIniciais(unidadePadraoId = ''): ProdutoFormValues {
  return {
    nome: '',
    nomeCurto: '',
    unidadeId: unidadePadraoId,
    categoriaId: null,
    unidadeCompraId: '',
    fatorConversao: '',
    marca: '',
    fornecedor: '',
    descricao: '',
    precoVenda: '',
    custo: '',
    precoMinimo: '',
    estoqueMinimo: '',
    estoqueMaximo: '',
    pontoReposicao: '',
    sku: '',
    codigosBarras: [],
    codigoPendente: '',
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
  // Compra igual a venda (fator 1) e o mesmo que "Mesma da venda": o form mostra assim.
  const compraPropria = produto.unidadeCompra !== null && produto.unidadeCompra.id !== produto.unidade.id
  return {
    nome: produto.nome,
    nomeCurto: produto.nomeCurto ?? '',
    unidadeId: produto.unidade.id,
    categoriaId: produto.categoria?.id ?? null,
    unidadeCompraId: compraPropria ? (produto.unidadeCompra?.id ?? '') : '',
    fatorConversao: compraPropria ? numeroParaTexto(produto.fatorConversao) : '',
    marca: produto.marca ?? '',
    fornecedor: produto.fornecedor ?? '',
    descricao: produto.descricao ?? '',
    precoVenda: String(produto.precoVenda),
    custo: numeroParaTexto(produto.custo),
    precoMinimo: numeroParaTexto(produto.precoMinimo),
    estoqueMinimo: numeroParaTexto(produto.estoqueMinimo),
    estoqueMaximo: numeroParaTexto(produto.estoqueMaximo),
    pontoReposicao: numeroParaTexto(produto.pontoReposicao),
    sku: produto.sku ?? '',
    codigosBarras: produto.codigosBarras.map((codigo) => codigo.codigo),
    codigoPendente: '',
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

/** Corpo do POST/PATCH. A lista de codigos vai sempre inteira (o PATCH a substitui). */
export function montarRequest(valores: ProdutoFormValues): ProdutoRequest {
  return {
    nome: valores.nome.trim(),
    nomeCurto: textoOuNulo(valores.nomeCurto),
    unidadeId: valores.unidadeId,
    categoriaId: valores.categoriaId,
    unidadeCompraId: textoOuNulo(valores.unidadeCompraId),
    fatorConversao: numeroOuNulo(valores.fatorConversao),
    marca: textoOuNulo(valores.marca),
    fornecedor: textoOuNulo(valores.fornecedor),
    descricao: textoOuNulo(valores.descricao),
    precoVenda: Number(valores.precoVenda),
    custo: numeroOuNulo(valores.custo),
    precoMinimo: numeroOuNulo(valores.precoMinimo),
    estoqueMinimo: numeroOuNulo(valores.estoqueMinimo),
    estoqueMaximo: numeroOuNulo(valores.estoqueMaximo),
    pontoReposicao: numeroOuNulo(valores.pontoReposicao),
    codigosBarras: valores.codigosBarras,
    sku: textoOuNulo(valores.sku),
  }
}

// --- Codigos de barras -------------------------------------------------------

/** Tamanho maximo de um codigo (coluna `VARCHAR(50)` do backend). */
export const TAMANHO_MAXIMO_CODIGO = 50

export const MENSAGEM_CODIGO_REPETIDO = 'Este código já está na lista.'
export const MENSAGEM_DIGITO_INVALIDO =
  'Este código não confere (o último dígito não bate). Leia de novo ou confira os números.'
export const MENSAGEM_LIMITE_CODIGOS = `Limite de ${MAXIMO_CODIGOS_BARRAS} códigos de barras atingido.`
export const MENSAGEM_CODIGO_LONGO = `O código deve ter no máximo ${TAMANHO_MAXIMO_CODIGO} caracteres.`

/** Formatos dos codigos ja gravados no produto, por codigo. */
export type FormatosGravados = ReadonlyMap<string, FormatoCodigoBarras>

/** Formatos gravados do produto em edicao (vazio no cadastro). */
export function formatosDoProduto(produto: Produto | null): FormatosGravados {
  return new Map((produto?.codigosBarras ?? []).map(({ codigo, formato }) => [codigo, formato]))
}

/** Resultado de tentar colocar o texto digitado na lista de codigos. */
export type ResultadoNovoCodigo =
  | { tipo: 'vazio' }
  | { tipo: 'bloqueado'; motivo: string }
  | { tipo: 'aceito'; codigo: string; lista: string[] }

/**
 * Regras para adicionar um codigo (as mesmas do backend): normaliza o texto,
 * barra repetido, mais de 20, mais de 50 caracteres e codigo novo com digito
 * verificador invalido. Um codigo ja gravado (ex.: `OUTRO` migrado com digito
 * invalido) volta sem bloqueio.
 */
export function avaliarNovoCodigo(
  entrada: string,
  lista: readonly string[],
  formatosGravados: FormatosGravados,
): ResultadoNovoCodigo {
  const codigo = normalizarCodigo(entrada)
  if (codigo === '') {
    return { tipo: 'vazio' }
  }
  if (lista.includes(codigo)) {
    return { tipo: 'bloqueado', motivo: MENSAGEM_CODIGO_REPETIDO }
  }
  if (lista.length >= MAXIMO_CODIGOS_BARRAS) {
    return { tipo: 'bloqueado', motivo: MENSAGEM_LIMITE_CODIGOS }
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

/** Fator em pt-BR sem zeros a direita (12 -> "12", 1.5 -> "1,5"), como o `conversaoTexto` do backend. */
function formatarFator(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false })
}

/** Texto de ajuda "1 CX = 12 UN"; null enquanto faltar unidade ou fator valido. */
export function textoConversao(
  siglaCompra: string | undefined,
  siglaVenda: string | undefined,
  fator: string,
): string | null {
  const texto = fator.trim()
  const numero = Number(texto)
  if (!siglaCompra || !siglaVenda || texto === '' || !Number.isFinite(numero) || numero <= 0) {
    return null
  }
  return `1 ${siglaCompra} = ${formatarFator(numero)} ${siglaVenda}`
}

// --- Precos ------------------------------------------------------------------

function numeroValido(valor: string): number | null {
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
