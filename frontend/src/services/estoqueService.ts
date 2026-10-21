import { apiGet, apiPost } from '@/services/httpClient'
import type { AjusteEstoqueRequest, MovimentoEstoque } from '@/types/estoque'
import type { PaginaResponse } from '@/types/produto'

/**
 * Servico de estoque do produto. Centraliza as chamadas HTTP de
 * /api/produtos/{id}/estoque. O `produtoId` e o UUID publico do produto.
 */

/** Tamanho padrao da pagina de movimentos (o backend aceita ate 100). */
export const TAMANHO_PAGINA_MOVIMENTOS = 20

function caminhoDoEstoque(produtoId: string): string {
  return `/produtos/${encodeURIComponent(produtoId)}/estoque`
}

/**
 * Registra um ajuste manual (so ADMIN). Responde 201 com o movimento novo, ou
 * 200 com o movimento ja gravado quando a `chave` se repete.
 */
export function ajustarEstoque(produtoId: string, dados: AjusteEstoqueRequest): Promise<MovimentoEstoque> {
  return apiPost<MovimentoEstoque>(`${caminhoDoEstoque(produtoId)}/ajustes`, dados, { autenticada: true })
}

/** Movimentos de estoque do produto, do mais recente para o mais antigo. */
export function listarMovimentosDeEstoque(
  produtoId: string,
  pagina: number,
  tamanho = TAMANHO_PAGINA_MOVIMENTOS,
): Promise<PaginaResponse<MovimentoEstoque>> {
  const searchParams = new URLSearchParams({ pagina: String(pagina), tamanho: String(tamanho) })
  return apiGet<PaginaResponse<MovimentoEstoque>>(`${caminhoDoEstoque(produtoId)}/movimentos?${searchParams.toString()}`, {
    autenticada: true,
  })
}
