import { apiDelete, apiGet, apiPatch, apiPost, apiPostComStatus } from '@/services/httpClient'
import type {
  FiltrosDaListaDeFornecedores,
  Fornecedor,
  FornecedorItemLista,
  FornecedorRequest,
  ProdutoDoFornecedor,
} from '@/types/fornecedor'
import type { PaginaResponse } from '@/types/produto'

/**
 * Servico de Fornecedores (Fase B5). Centraliza as chamadas HTTP de
 * /api/fornecedores. O `id` e o UUID publico. Leitura para qualquer
 * autenticado; escrita so ADMIN.
 */

/** Tamanho da pagina da lista de fornecedores e da lista de produtos do fornecedor. */
export const TAMANHO_PAGINA_FORNECEDORES = 25

export type ListarFornecedoresParams = FiltrosDaListaDeFornecedores & { tamanho?: number }

function caminhoDoFornecedor(id: string): string {
  return `/fornecedores/${encodeURIComponent(id)}`
}

/**
 * Uma pagina da lista de fornecedores (ordem por nome), com busca sem acento
 * por nome, fantasia, documento, Nº e representante. A pagina 1-based da tela
 * vira 0-based; o `signal` cancela a consulta quando a busca muda.
 */
export function listarFornecedores(
  params: ListarFornecedoresParams,
  signal?: AbortSignal,
): Promise<PaginaResponse<FornecedorItemLista>> {
  const searchParams = new URLSearchParams()
  const busca = params.busca.trim()
  if (busca) {
    searchParams.set('busca', busca)
  }
  searchParams.set('status', params.status)
  searchParams.set('pagina', String(Math.max(0, params.pagina - 1)))
  searchParams.set('tamanho', String(params.tamanho ?? TAMANHO_PAGINA_FORNECEDORES))
  return apiGet<PaginaResponse<FornecedorItemLista>>(`/fornecedores?${searchParams.toString()}`, {
    autenticada: true,
    signal,
  })
}

export function buscarFornecedor(id: string): Promise<Fornecedor> {
  return apiGet<Fornecedor>(caminhoDoFornecedor(id), { autenticada: true })
}

export function cadastrarFornecedor(dados: FornecedorRequest): Promise<Fornecedor> {
  return apiPost<Fornecedor>('/fornecedores', dados, { autenticada: true })
}

/** Atualiza o fornecedor; representantes e marcas vao como listas completas. */
export function atualizarFornecedor(id: string, dados: FornecedorRequest): Promise<Fornecedor> {
  return apiPatch<Fornecedor>(caminhoDoFornecedor(id), dados, { autenticada: true })
}

export function inativarFornecedor(id: string): Promise<Fornecedor> {
  return apiPatch<Fornecedor>(`${caminhoDoFornecedor(id)}/inativar`, {}, { autenticada: true })
}

export function reativarFornecedor(id: string): Promise<Fornecedor> {
  return apiPatch<Fornecedor>(`${caminhoDoFornecedor(id)}/reativar`, {}, { autenticada: true })
}

/** Exclui o fornecedor (204). Com produtos ligados ou entradas registradas responde 409. */
export function excluirFornecedor(id: string): Promise<void> {
  return apiDelete(caminhoDoFornecedor(id), { autenticada: true })
}

/** Uma pagina dos produtos que o fornecedor vende (`pagina` 1-based na tela). */
export function listarProdutosDoFornecedor(
  id: string,
  pagina: number,
  tamanho = TAMANHO_PAGINA_FORNECEDORES,
): Promise<PaginaResponse<ProdutoDoFornecedor>> {
  const searchParams = new URLSearchParams({ pagina: String(Math.max(0, pagina - 1)), tamanho: String(tamanho) })
  return apiGet<PaginaResponse<ProdutoDoFornecedor>>(`${caminhoDoFornecedor(id)}/produtos?${searchParams.toString()}`, {
    autenticada: true,
  })
}

/** Resultado de ligar um produto: o produto como aparece na lista e se a ligacao foi criada agora. */
export interface ProdutoLigado {
  produto: ProdutoDoFornecedor
  /** false: o produto ja estava ligado (200). */
  criado: boolean
}

/** Liga o produto ao fornecedor (idempotente: 201 na criacao, 200 se ja estava ligado). */
export async function adicionarProdutoAoFornecedor(id: string, produtoId: string): Promise<ProdutoLigado> {
  const { status, corpo } = await apiPostComStatus<ProdutoDoFornecedor>(
    `${caminhoDoFornecedor(id)}/produtos`,
    { produtoId },
    { autenticada: true },
  )
  return { produto: corpo, criado: status === 201 }
}

/** Desliga o produto do fornecedor; se ele era o da ultima compra, o backend limpa esse campo do produto. */
export function removerProdutoDoFornecedor(id: string, produtoId: string): Promise<void> {
  return apiDelete(`${caminhoDoFornecedor(id)}/produtos/${encodeURIComponent(produtoId)}`, { autenticada: true })
}
