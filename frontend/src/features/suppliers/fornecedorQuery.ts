import { FORNECEDORES_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import type { FiltrosDaListaDeFornecedores } from '@/types/fornecedor'

/** Chaves de cache dos fornecedores, todas sob o prefixo (invalidar o prefixo atualiza todas). */

/** Uma pagina da lista de fornecedores. */
export function chaveDaListaDeFornecedores(filtros: FiltrosDaListaDeFornecedores) {
  return [...FORNECEDORES_QUERY_KEY, 'lista', filtros] as const
}

/** "Existe algum fornecedor (ativo ou inativo)?": decide o texto da lista vazia sem filtro. */
export const FORNECEDORES_EXISTENTES_QUERY_KEY = [...FORNECEDORES_QUERY_KEY, 'existe-algum'] as const

/** Busca de fornecedores ativos nos seletores (produto e entrada por compra). */
export function chaveDaBuscaDeFornecedores(termo: string, tamanho: number) {
  return [...FORNECEDORES_QUERY_KEY, 'busca', termo, tamanho] as const
}

export function chaveDoFornecedor(id: string) {
  return [...FORNECEDORES_QUERY_KEY, 'detalhe', id] as const
}

/** Pagina dos produtos que o fornecedor vende. */
export function chaveDosProdutosDoFornecedor(id: string, pagina: number) {
  return [...FORNECEDORES_QUERY_KEY, id, 'produtos', pagina] as const
}
