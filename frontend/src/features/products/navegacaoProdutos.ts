/**
 * Estado de navegacao entre a lista de produtos e a pagina do produto.
 *
 * - lista -> produto: `voltarPara` guarda a URL da lista com a busca/status,
 *   para "Voltar" e "Salvar" voltarem ao mesmo filtro. A area Estoque (Posicao
 *   e Movimentacoes) tambem abre o produto e volta para a propria URL;
 * - produto -> lista: `sucesso` leva a mensagem exibida no feedback da lista.
 *
 * O `location.state` nao e confiavel (vem do historico): e sempre validado.
 */

export const ROTA_PRODUTOS = '/produtos'
export const ROTA_NOVO_PRODUTO = '/produtos/novo'
const ROTA_ESTOQUE = '/estoque'

export function rotaDoProduto(id: string): string {
  return `${ROTA_PRODUTOS}/${encodeURIComponent(id)}`
}

export interface EstadoParaProduto {
  voltarPara: string
}

export interface EstadoParaLista {
  sucesso: string
}

function campoTexto(state: unknown, campo: string): string | null {
  if (typeof state !== 'object' || state === null) {
    return null
  }
  const valor: unknown = (state as Record<string, unknown>)[campo]
  return typeof valor === 'string' && valor !== '' ? valor : null
}

function ehARota(destino: string, rota: string): boolean {
  return destino === rota || destino.startsWith(`${rota}?`)
}

/** URL da lista para voltar; so aceita a lista de produtos ou a area Estoque (com query), senao `/produtos`. */
export function destinoDaLista(state: unknown): string {
  const destino = campoTexto(state, 'voltarPara')
  if (destino && (ehARota(destino, ROTA_PRODUTOS) || ehARota(destino, ROTA_ESTOQUE))) {
    return destino
  }
  return ROTA_PRODUTOS
}

/** Texto do link "Voltar" para o destino de `destinoDaLista`. */
export function rotuloDoVoltar(destino: string): string {
  return ehARota(destino, ROTA_ESTOQUE) ? 'Voltar para o estoque' : 'Voltar para produtos'
}

/** Mensagem de sucesso enviada pela pagina do produto, se houver. */
export function sucessoDaNavegacao(state: unknown): string | null {
  return campoTexto(state, 'sucesso')
}
