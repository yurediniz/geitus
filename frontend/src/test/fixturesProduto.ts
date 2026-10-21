/**
 * Dados de teste do modulo Produtos (lista e pagina do produto). So dados:
 * os mocks de servico ficam em cada arquivo de teste.
 */
import type { Categoria, UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

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
export const UNIDADES = [CX, KG, PCT_INATIVA, UN]

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

export const ID_ARROZ = '0b9d2f3a-1c4e-4a5b-8c6d-7e8f9a0b1c2d'
export const ID_FEIJAO = '1c0e3a4b-2d5f-4b6c-9d7e-8f9a0b1c2d3e'
export const ID_SIMPLES = '2d1f4b5c-3e6a-4c7d-8e8f-9a0b1c2d3e4f'

export const produtoAtivo: Produto = {
  id: ID_ARROZ,
  nome: 'Arroz 5kg',
  nomeCurto: null,
  nomeCurtoEfetivo: 'Arroz 5kg',
  categoria: { id: 'mercearia', nome: 'Mercearia', caminho: 'Mercearia' },
  marca: 'Tio João',
  fornecedor: 'Distribuidora Sul',
  unidade: resumo(UN),
  unidadeCompra: null,
  fatorConversao: null,
  conversaoTexto: null,
  descricao: null,
  precoVenda: 25.9,
  custo: 18,
  precoMinimo: 20,
  promocao: null,
  emPromocao: false,
  atacado: null,
  estoqueMinimo: 2,
  estoqueMaximo: 50,
  pontoReposicao: 10,
  codigosBarras: [{ codigo: '7891000315507', formato: 'EAN13' }],
  sku: 'SKU-ARROZ',
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
  nome: 'Feijão 1kg',
  nomeCurtoEfetivo: 'Feijão 1kg',
  sku: 'SKU-FEIJAO',
  codigosBarras: [],
  ativo: false,
}

// Produto minimo: apenas nome e preco de venda; todos os campos opcionais nulos.
export const produtoSimples: Produto = {
  id: ID_SIMPLES,
  nome: 'Produto Simples',
  nomeCurto: null,
  nomeCurtoEfetivo: 'Produto Simples',
  categoria: null,
  marca: null,
  fornecedor: null,
  unidade: resumo(UN),
  unidadeCompra: null,
  fatorConversao: null,
  conversaoTexto: null,
  descricao: null,
  precoVenda: 5,
  custo: null,
  precoMinimo: null,
  promocao: null,
  emPromocao: false,
  atacado: null,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigosBarras: [],
  sku: null,
  ativo: true,
  podeExcluir: true,
  margem: null,
  markup: null,
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: null,
}
