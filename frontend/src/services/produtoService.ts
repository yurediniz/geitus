import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type {
  CampoSugestaoProduto,
  HistoricoPreco,
  ListarProdutosParams,
  PaginaResponse,
  Produto,
  ProdutoRequest,
} from '@/types/produto'

/**
 * Servico de Produtos. Centraliza as chamadas HTTP para evitar duplicacao de
 * logica de API nos componentes. O `id` e o UUID publico do produto.
 */

function montarQuery(params: ListarProdutosParams = {}): string {
  const searchParams = new URLSearchParams()
  const busca = params.busca?.trim()

  if (busca) {
    searchParams.set('busca', busca)
  }

  if (params.status === 'ativos') {
    searchParams.set('ativo', 'true')
  }

  if (params.status === 'inativos') {
    searchParams.set('ativo', 'false')
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

function caminhoDoProduto(id: string): string {
  return `/produtos/${encodeURIComponent(id)}`
}

/** Lista produtos da empresa do usuario autenticado. */
export function listarProdutos(params: ListarProdutosParams = {}): Promise<Produto[]> {
  return apiGet<Produto[]>(`/produtos${montarQuery(params)}`, { autenticada: true })
}

/** Busca um produto da empresa do usuario autenticado. */
export function buscarProduto(id: string): Promise<Produto> {
  return apiGet<Produto>(caminhoDoProduto(id), { autenticada: true })
}

/** Cadastra um produto na empresa do usuario autenticado. */
export function cadastrarProduto(dados: ProdutoRequest): Promise<Produto> {
  return apiPost<Produto>('/produtos', dados, { autenticada: true })
}

/** Atualiza os dados basicos de um produto (a lista de codigos e substituida inteira). */
export function atualizarProduto(id: string, dados: ProdutoRequest): Promise<Produto> {
  return apiPatch<Produto>(caminhoDoProduto(id), dados, { autenticada: true })
}

/** Inativa um produto da empresa do usuario autenticado. */
export function inativarProduto(id: string): Promise<Produto> {
  return apiPatch<Produto>(`${caminhoDoProduto(id)}/inativar`, {}, { autenticada: true })
}

/** Reativa um produto da empresa do usuario autenticado. */
export function reativarProduto(id: string): Promise<Produto> {
  return apiPatch<Produto>(`${caminhoDoProduto(id)}/reativar`, {}, { autenticada: true })
}

/** Exclui fisicamente um produto sem movimentacao (o backend responde 409 se bloqueado). */
export function excluirProduto(id: string): Promise<void> {
  return apiDelete(caminhoDoProduto(id), { autenticada: true })
}

/** Proximo SKU sugerido no padrao `P000001` da empresa (nao reserva o SKU). */
export async function sugerirSku(): Promise<string> {
  const resposta = await apiGet<{ sku: string }>('/produtos/sku/sugestao', { autenticada: true })
  return resposta.sku
}

/** Ate 10 valores ja usados na empresa para marca ou fornecedor, mais usados primeiro. */
export function listarSugestoes(campo: CampoSugestaoProduto, termo: string): Promise<string[]> {
  const searchParams = new URLSearchParams({ campo })
  const termoAparado = termo.trim()
  if (termoAparado) {
    searchParams.set('termo', termoAparado)
  }
  return apiGet<string[]>(`/produtos/sugestoes?${searchParams.toString()}`, { autenticada: true })
}

/** Tamanho padrao da pagina do historico de precos (o backend aceita ate 100). */
export const TAMANHO_PAGINA_HISTORICO = 20

/** Historico de custo e preco de venda do produto, do mais recente para o mais antigo. */
export function listarHistoricoDePrecos(
  id: string,
  pagina: number,
  tamanho = TAMANHO_PAGINA_HISTORICO,
): Promise<PaginaResponse<HistoricoPreco>> {
  const searchParams = new URLSearchParams({ pagina: String(pagina), tamanho: String(tamanho) })
  return apiGet<PaginaResponse<HistoricoPreco>>(`${caminhoDoProduto(id)}/historico-precos?${searchParams.toString()}`, {
    autenticada: true,
  })
}
