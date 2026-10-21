/**
 * Tipos compartilhados do catalogo: Unidades de medida e Categorias.
 *
 * Refletem o contrato da API do backend em /api/unidades e /api/categorias
 * (ver docs/modules/categorias-e-unidades.md). O `id` e sempre o UUID publico;
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
 * Categoria conforme retornada pela API: lista plana ordenada pelo caminho.
 * O frontend monta a arvore a partir de `parentId` (ver lib/arvoreCategorias).
 */
export interface Categoria {
  id: string
  nome: string
  /** UUID da categoria pai; `null` para categoria raiz. */
  parentId: string | null
  /** Caminho completo, ex.: "Ração › Úmida › Sachê". */
  caminho: string
  /** Profundidade na arvore (0 = raiz). */
  nivel: number
  ativo: boolean
  /** Ativa e sem ancestral inativo: pode ser escolhida no produto. */
  selecionavel: boolean
  quantidadeSubcategorias: number
  quantidadeProdutos: number
  criadoEm: string
  atualizadoEm: string | null
}

/** Corpo de cadastro/atualizacao (renomear + mover). `parentId: null` = raiz. */
export interface CategoriaRequest {
  nome: string
  parentId: string | null
}

/** Resumo da unidade embutido em outros recursos (ex.: produto). */
export interface UnidadeResumo {
  id: string
  sigla: string
  descricao: string
  fracionada: boolean
}

/** Resumo da categoria embutido em outros recursos (ex.: produto). */
export interface CategoriaResumo {
  id: string
  nome: string
  caminho: string
}
