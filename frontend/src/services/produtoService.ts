import { apiDelete, apiGet, apiGetBlob, apiPatch, apiPost, apiPutMultipart } from '@/services/httpClient'
import type {
  FiltrosDaListaDeProdutos,
  HistoricoPreco,
  ImagemDoProduto,
  PaginaResponse,
  Produto,
  ProdutoRequest,
} from '@/types/produto'

/**
 * Servico de Produtos. Centraliza as chamadas HTTP para evitar duplicacao de
 * logica de API nos componentes. O `id` e o UUID publico do produto.
 */

/** Tamanho padrao da pagina da lista de produtos (o backend aceita ate 100). */
export const TAMANHO_PAGINA_PRODUTOS = 25

export type ListarProdutosParams = FiltrosDaListaDeProdutos & { tamanho?: number }

/** Parametros da API: so os filtros presentes; a pagina 1-based da tela vira 0-based. */
function montarQueryDaLista(params: ListarProdutosParams): string {
  const searchParams = new URLSearchParams()
  const busca = params.busca.trim()
  if (busca) {
    searchParams.set('busca', busca)
  }
  searchParams.set('status', params.status)
  if (params.categoria) {
    searchParams.set('categoria', params.categoria)
  }
  if (params.estoque) {
    searchParams.set('estoque', params.estoque)
  }
  if (params.promocao) {
    searchParams.set('promocao', 'true')
  }
  searchParams.set('ordem', params.ordem)
  searchParams.set('pagina', String(Math.max(0, params.pagina - 1)))
  searchParams.set('tamanho', String(params.tamanho ?? TAMANHO_PAGINA_PRODUTOS))
  return searchParams.toString()
}

function caminhoDoProduto(id: string): string {
  return `/produtos/${encodeURIComponent(id)}`
}

/**
 * Uma pagina da lista de produtos da empresa do usuario autenticado, com busca,
 * filtros e ordenacao. O `signal` cancela a requisicao quando a busca muda.
 */
export function listarProdutos(params: ListarProdutosParams, signal?: AbortSignal): Promise<PaginaResponse<Produto>> {
  return apiGet<PaginaResponse<Produto>>(`/produtos?${montarQueryDaLista(params)}`, { autenticada: true, signal })
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

/** Extensao do arquivo da parte, pelo tipo do blob (o servidor confere o tipo real pelos bytes). */
function nomeDaParte(parte: 'grande' | 'miniatura', blob: Blob): string {
  return `${parte}.${blob.type === 'image/jpeg' ? 'jpg' : 'webp'}`
}

/**
 * Envia (ou substitui) a imagem do produto: a grande e a miniatura ja
 * comprimidas no navegador, nas partes `grande` e `miniatura`.
 */
export function enviarImagemDoProduto(id: string, grande: Blob, miniatura: Blob): Promise<ImagemDoProduto> {
  const formulario = new FormData()
  formulario.append('grande', grande, nomeDaParte('grande', grande))
  formulario.append('miniatura', miniatura, nomeDaParte('miniatura', miniatura))
  return apiPutMultipart<ImagemDoProduto>(`${caminhoDoProduto(id)}/imagem`, formulario)
}

/** Baixa a imagem gravada (a versao grande, pela URL assinada), para girar sem o arquivo original. */
export function baixarImagemDoProduto(url: string): Promise<Blob> {
  return apiGetBlob(url)
}

/** Remove a imagem do produto (404 se ele nao tem imagem). */
export function removerImagemDoProduto(id: string): Promise<void> {
  return apiDelete(`${caminhoDoProduto(id)}/imagem`, { autenticada: true })
}

/** Proximo SKU sugerido no padrao `P000001` da empresa (nao reserva o SKU). */
export async function sugerirSku(): Promise<string> {
  const resposta = await apiGet<{ sku: string }>('/produtos/sku/sugestao', { autenticada: true })
  return resposta.sku
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
