/**
 * Dados de teste do modulo Produtos (lista e pagina do produto). So dados:
 * os mocks de servico ficam em cada arquivo de teste.
 */
import type { Categoria, Marca, UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import { rotuloDaEmbalagem } from '@/lib/embalagem'
import { detectarFormato } from '@/lib/codigoBarras'
import type { Embalagem, Produto } from '@/types/produto'

export function unidade(id: string, sigla: string, descricao: string, ativo = true): UnidadeMedida {
  return {
    id,
    sigla,
    descricao,
    fracionada: false,
    ativo,
    emUso: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
  }
}

export function resumo({ id, sigla, descricao, fracionada }: UnidadeMedida): UnidadeResumo {
  return { id, sigla, descricao, fracionada }
}

export const UN = unidade('un', 'UN', 'Unidade')
export const KG = unidade('kg', 'KG', 'Quilograma')
export const CX = unidade('cx', 'CX', 'Caixa')
export const PCT_INATIVA = unidade('pct', 'PCT', 'Pacote', false)
export const SC = unidade('sc', 'SC', 'Saco')
export const UNIDADES = [CX, KG, PCT_INATIVA, UN]

interface DadosEmbalagem {
  id: string
  unidade: UnidadeResumo
  quantidade: number
  preco: number | null
  deCompra?: boolean
  codigos?: string[]
  /** Sigla da unidade de venda do produto, para o rotulo (padrao UN). */
  siglaDeVenda?: string
  /** Preco da unidade, para o preco efetivo sem preco proprio (padrao 89,90). */
  precoDaUnidade?: number
}

/** Embalagem como a API devolve (rotulo e preco efetivo derivados como no backend; sem custo). */
export function embalagemDaApi({
  id,
  unidade: unidadeDaEmbalagem,
  quantidade,
  preco,
  deCompra = false,
  codigos = [],
  siglaDeVenda = 'UN',
  precoDaUnidade = 89.9,
}: DadosEmbalagem): Embalagem {
  return {
    id,
    unidade: unidadeDaEmbalagem,
    quantidade,
    rotulo: rotuloDaEmbalagem(unidadeDaEmbalagem.sigla, quantidade, siglaDeVenda),
    preco,
    precoEfetivo: preco ?? Math.round(quantidade * precoDaUnidade * 100) / 100,
    origemPreco: preco === null ? 'UNIDADE' : 'PROPRIO',
    custo: null,
    margem: null,
    markup: null,
    deCompra,
    codigosBarras: codigos.map((codigo) => ({ codigo, formato: detectarFormato(codigo) })),
  }
}

export function categoria(id: string, nome: string, parentId: string | null, caminho: string): Categoria {
  return {
    id,
    nome,
    parentId,
    caminho,
    nivel: caminho.split(' › ').length - 1,
    ativo: true,
    selecionavel: true,
    quantidadeSubcategorias: 0,
    quantidadeProdutos: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
  }
}

export const MERCEARIA = categoria('mercearia', 'Mercearia', null, 'Mercearia')
export const RACAO = categoria('racao', 'Ração', null, 'Ração')
export const SACHE = categoria('sache', 'Sachê', 'racao', 'Ração › Sachê')
export const CATEGORIAS = [MERCEARIA, RACAO, SACHE]

export function marca(id: string, nome: string, parentId: string | null, caminho: string, extras: Partial<Marca> = {}): Marca {
  return {
    id,
    nome,
    parentId,
    caminho,
    nivel: caminho.split(' › ').length - 1,
    ativo: true,
    selecionavel: true,
    quantidadeSubmarcas: 0,
    quantidadeProdutos: 0,
    quantidadeFornecedores: 0,
    criadoEm: '2026-10-24T10:00:00',
    atualizadoEm: null,
    ...extras,
  }
}

export const CAMIL = marca('camil', 'Camil', null, 'Camil')
export const TIO_JOAO = marca('tio-joao', 'Tio João', 'camil', 'Camil › Tio João')
export const GOLDEN = marca('golden', 'Golden', null, 'Golden')
export const MARCAS = [CAMIL, TIO_JOAO, GOLDEN]

export const ID_ARROZ = '0b9d2f3a-1c4e-4a5b-8c6d-7e8f9a0b1c2d'
export const ID_FEIJAO = '1c0e3a4b-2d5f-4b6c-9d7e-8f9a0b1c2d3e'
export const ID_SIMPLES = '2d1f4b5c-3e6a-4c7d-8e8f-9a0b1c2d3e4f'

export const produtoAtivo: Produto = {
  id: ID_ARROZ,
  numero: 15,
  codigo: 542,
  vendidoBalanca: false,
  nome: 'Arroz 5kg',
  nomeCurto: null,
  nomeCurtoEfetivo: 'Arroz 5kg',
  categoria: { id: 'mercearia', nome: 'Mercearia', caminho: 'Mercearia' },
  marca: { id: 'tio-joao', nome: 'Tio João', caminho: 'Camil › Tio João' },
  fornecedores: [{ id: 'dist-sul', numero: 1, nome: 'Distribuidora Sul', ativo: true }],
  fornecedorUltimaCompra: { id: 'dist-sul', numero: 1, nome: 'Distribuidora Sul' },
  unidade: resumo(UN),
  descricao: null,
  precoVenda: 25.9,
  custo: 18,
  custoOrigem: null,
  precoMinimo: 20,
  promocao: null,
  emPromocao: false,
  atacado: null,
  controlaEstoque: true,
  estoqueAtual: 12,
  situacaoEstoque: 'REGULAR',
  estoqueMinimo: 2,
  estoqueMaximo: 50,
  pontoReposicao: 10,
  codigosBarras: [{ codigo: '7891000315507', formato: 'EAN13' }],
  embalagens: [],
  sku: 'SKU-ARROZ',
  imagem: null,
  ativo: true,
  podeExcluir: true,
  margem: 30.5,
  markup: 43.89,
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: null,
}

export const produtoInativo: Produto = {
  ...produtoAtivo,
  id: ID_FEIJAO,
  numero: 16,
  codigo: null,
  nome: 'Feijão 1kg',
  nomeCurtoEfetivo: 'Feijão 1kg',
  sku: 'SKU-FEIJAO',
  codigosBarras: [],
  ativo: false,
}

// Produto minimo: apenas nome e preco de venda; todos os campos opcionais nulos.
export const produtoSimples: Produto = {
  id: ID_SIMPLES,
  numero: 3,
  codigo: null,
  vendidoBalanca: false,
  nome: 'Produto Simples',
  nomeCurto: null,
  nomeCurtoEfetivo: 'Produto Simples',
  categoria: null,
  marca: null,
  fornecedores: [],
  fornecedorUltimaCompra: null,
  unidade: resumo(UN),
  descricao: null,
  precoVenda: 5,
  custo: null,
  custoOrigem: null,
  precoMinimo: null,
  promocao: null,
  emPromocao: false,
  atacado: null,
  controlaEstoque: true,
  estoqueAtual: 0,
  situacaoEstoque: 'ZERADO',
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigosBarras: [],
  embalagens: [],
  sku: null,
  imagem: null,
  ativo: true,
  podeExcluir: true,
  margem: null,
  markup: null,
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: null,
}
