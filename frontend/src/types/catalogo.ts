/**
 * Tipos compartilhados do catalogo: Unidades de medida, Categorias e Marcas.
 *
 * Refletem o contrato da API do backend em /api/unidades, /api/categorias e
 * /api/marcas (ver docs/modules/produtos.md e
 * fornecedores-e-marcas.md). O `id` e sempre o UUID publico;
 * a empresa nunca trafega aqui: e derivada do usuario autenticado.
 */

/** Unidade de medida conforme retornada pela API (ordenada por sigla). */
export interface UnidadeMedida {
  id: string
  /** Normalizada pelo backend para maiusculas, sem espacos nas pontas. */
  sigla: string
  descricao: string
  /** Quando true, aceita quantidade fracionada (ex.: kg, litro). */
  fracionada: boolean
  ativo: boolean
  /** Quantidade de produtos que usam a unidade (venda ou compra). */
  emUso: number
  criadoEm: string
  atualizadoEm: string | null
}

/** Corpo de cadastro/atualizacao de unidade. `ativo` muda so por inativar/reativar. */
export interface UnidadeMedidaRequest {
  sigla: string
  descricao: string
  fracionada: boolean
}

/**
 * Item de um cadastro em arvore (Categorias e Marcas, que seguem as mesmas
 * regras): lista plana ordenada pelo caminho. O frontend monta a arvore a
 * partir de `parentId` (ver lib/arvoreCategorias).
 */
export interface ItemDaArvore {
  id: string
  nome: string
  /** UUID do item pai; `null` para item raiz. */
  parentId: string | null
  /** Caminho completo, ex.: "Ração › Úmida › Sachê". */
  caminho: string
  /** Profundidade na arvore (0 = raiz). */
  nivel: number
  ativo: boolean
  /** Ativo e sem ancestral inativo: pode ser escolhido no produto. */
  selecionavel: boolean
  /** Produtos ligados diretamente ao item. */
  quantidadeProdutos: number
  criadoEm: string
  atualizadoEm: string | null
}

/** Categoria conforme retornada pela API. */
export interface Categoria extends ItemDaArvore {
  quantidadeSubcategorias: number
}

/**
 * Fabricante ou marca (Fase B5): a mesma arvore das categorias. O primeiro
 * nivel costuma ser o fabricante; o sistema nao diferencia os niveis.
 */
export interface Marca extends ItemDaArvore {
  quantidadeSubmarcas: number
  /** Fornecedores que vendem a marca (ligados diretamente a ela). */
  quantidadeFornecedores: number
}

/** Corpo de cadastro/atualizacao de um item da arvore (renomear + mover). `parentId: null` = raiz. */
export interface ItemDaArvoreRequest {
  nome: string
  parentId: string | null
}

export type CategoriaRequest = ItemDaArvoreRequest
export type MarcaRequest = ItemDaArvoreRequest

/** Resumo da unidade embutido em outros recursos (ex.: produto). */
export interface UnidadeResumo {
  id: string
  sigla: string
  descricao: string
  fracionada: boolean
}

/** Resumo de um item da arvore embutido em outros recursos (ex.: produto). */
export interface ResumoDaArvore {
  id: string
  nome: string
  caminho: string
}

/** Resumo da categoria embutido em outros recursos (ex.: produto). */
export type CategoriaResumo = ResumoDaArvore

/** Resumo da marca embutido em outros recursos (produto, fornecedor). */
export type MarcaResumo = ResumoDaArvore
