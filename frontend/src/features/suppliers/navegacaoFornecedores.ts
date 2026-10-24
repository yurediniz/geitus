/**
 * Rotas e estado de navegacao entre a lista de fornecedores e a pagina do
 * fornecedor (o mesmo padrao de navegacaoProdutos):
 * - lista -> fornecedor: `voltarPara` guarda a URL da lista com a busca/status;
 * - fornecedor -> lista: `sucesso` leva a mensagem exibida na lista.
 *
 * O `location.state` nao e confiavel (vem do historico): e sempre validado.
 */

export const ROTA_FORNECEDORES = '/produtos/fornecedores'
export const ROTA_NOVO_FORNECEDOR = '/produtos/fornecedores/novo'

export function rotaDoFornecedor(id: string): string {
  return `${ROTA_FORNECEDORES}/${encodeURIComponent(id)}`
}

export interface EstadoParaFornecedor {
  voltarPara: string
}

function campoTexto(state: unknown, campo: string): string | null {
  if (typeof state !== 'object' || state === null) {
    return null
  }
  const valor: unknown = (state as Record<string, unknown>)[campo]
  return typeof valor === 'string' && valor !== '' ? valor : null
}

/** URL da lista para voltar; so aceita a propria lista (com query), senao a lista sem filtro. */
export function destinoDaListaDeFornecedores(state: unknown): string {
  const destino = campoTexto(state, 'voltarPara')
  if (destino && (destino === ROTA_FORNECEDORES || destino.startsWith(`${ROTA_FORNECEDORES}?`))) {
    return destino
  }
  return ROTA_FORNECEDORES
}
