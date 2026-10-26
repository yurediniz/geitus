import { apiGet, apiPost, apiPostComStatus } from '@/services/httpClient'
import type {
  CalculoDaVenda,
  CarrinhoRequest,
  CatalogoDoPdv,
  FiltrosDeVendas,
  FinalizarVendaRequest,
  ItemResolvido,
  ProdutoEncontrado,
  Venda,
  VendaResumo,
} from '@/types/pdv'
import type { PaginaResponse } from '@/types/produto'

/**
 * Servico do PDV (spec `docs/modules/pdv.md` §5.3). Centraliza as chamadas de
 * /api/pdv. Empresa, usuario e perfil vem sempre do token; o servidor
 * recalcula preco, desconto, total e troco (nada do navegador e gravado).
 */

/** Tamanho da pagina da lista de vendas do caixa. */
export const TAMANHO_PAGINA_VENDAS = 50

const AUTENTICADA = { autenticada: true } as const

function caminhoDaVenda(id: string): string {
  return `/pdv/vendas/${encodeURIComponent(id)}`
}

/**
 * O item do texto lido (codigo, `codigo*quantidade` ou etiqueta da balanca).
 * 404 "Codigo nao encontrado.", 409 produto inativo, 400 quantidade invalida.
 */
export function resolverCodigo(codigo: string, signal?: AbortSignal): Promise<ItemResolvido> {
  const params = new URLSearchParams({ codigo })
  return apiGet<ItemResolvido>(`/pdv/itens?${params.toString()}`, { autenticada: true, signal })
}

/** Ate 20 produtos ativos pelo nome. */
export function buscarProdutos(busca: string, signal?: AbortSignal): Promise<ProdutoEncontrado[]> {
  const params = new URLSearchParams({ busca })
  return apiGet<ProdutoEncontrado[]>(`/pdv/itens?${params.toString()}`, { autenticada: true, signal })
}

/** Uma pagina do catalogo (produtos ativos, os mais vendidos primeiro); `categoria` inclui as subcategorias. */
export function listarCatalogo(categoria: string | null, pagina: number, signal?: AbortSignal): Promise<CatalogoDoPdv> {
  const params = new URLSearchParams({ pagina: String(pagina) })
  if (categoria) {
    params.set('categoria', categoria)
  }
  return apiGet<CatalogoDoPdv>(`/pdv/catalogo?${params.toString()}`, { autenticada: true, signal })
}

/** Calculo do carrinho: 200 mesmo com regras violadas (em `erros`); 404/409 para dados inexistentes ou inativos. */
export function calcular(carrinho: CarrinhoRequest, signal: AbortSignal): Promise<CalculoDaVenda> {
  return apiPost<CalculoDaVenda>('/pdv/calculo', carrinho, { autenticada: true, signal })
}

/** Grava a venda (201; 200 com a mesma venda quando a chave se repete com os mesmos dados). */
export async function finalizar(dados: FinalizarVendaRequest): Promise<Venda> {
  const { corpo } = await apiPostComStatus<Venda>('/pdv/vendas', dados, AUTENTICADA)
  return corpo
}

/**
 * Uma pagina das vendas, da mais recente para a mais antiga (OPERADOR: so das
 * proprias sessoes). Sem `sessaoId`, o backend usa a sessao atual do usuario.
 */
export function listarVendas(filtros: FiltrosDeVendas, signal?: AbortSignal): Promise<PaginaResponse<VendaResumo>> {
  const params = new URLSearchParams()
  if (filtros.sessaoId) {
    params.set('sessaoId', filtros.sessaoId)
  }
  if (filtros.status) {
    params.set('status', filtros.status)
  }
  if (filtros.de) {
    params.set('de', filtros.de)
  }
  if (filtros.ate) {
    params.set('ate', filtros.ate)
  }
  if (filtros.numero) {
    params.set('numero', filtros.numero)
  }
  params.set('pagina', String(Math.max(0, filtros.pagina - 1)))
  params.set('tamanho', String(TAMANHO_PAGINA_VENDAS))
  return apiGet<PaginaResponse<VendaResumo>>(`/pdv/vendas?${params.toString()}`, { autenticada: true, signal })
}

export function buscarVenda(id: string): Promise<Venda> {
  return apiGet<Venda>(caminhoDaVenda(id), AUTENTICADA)
}

/** So com o caixa da venda aberto (409 em conferencia ou fechado). Repetir com o mesmo motivo devolve 200. */
export function cancelarVenda(id: string, motivo: string): Promise<Venda> {
  return apiPost<Venda>(`${caminhoDaVenda(id)}/cancelamento`, { motivo }, AUTENTICADA)
}
