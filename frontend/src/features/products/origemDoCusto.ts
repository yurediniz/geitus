/**
 * Textos da origem do custo do produto (Fase B4, docs/modules/produtos-custo-entrada.md
 * §3 e §4): a nota da secao Precos e a origem nas linhas de custo do Historico.
 * Sem React: testavel isolado.
 */
import { formatarData, formatarMoeda } from '@/features/products/formatacaoProduto'
import type { CustoOrigem, HistoricoPreco } from '@/types/produto'

/** "CX c/ 18 UN" -> 18; "SC c/ 25,5 KG" -> 25.5 (o rotulo que o backend monta); null fora do formato. */
function quantidadeDoRotulo(rotulo: string): number | null {
  const partes = /^\S+ c\/ (\d+(?:,\d+)?) \S+$/.exec(rotulo)
  return partes ? Number(partes[1].replace(',', '.')) : null
}

/**
 * Quantidade da compra (em unidades de venda) contada em embalagens: 36 e "CX
 * c/ 18 UN" -> "2 CX c/ 18 UN". A API traz as unidades e o rotulo; a conta usa
 * a quantidade do rotulo. Se ela nao fecha um numero inteiro de embalagens (ou
 * o rotulo esta fora do formato), so o rotulo. Null sem embalagem.
 */
export function quantidadeEmEmbalagens(quantidade: number | null, embalagemRotulo: string | null): string | null {
  if (quantidade === null || embalagemRotulo === null) {
    return null
  }
  const porEmbalagem = quantidadeDoRotulo(embalagemRotulo)
  if (porEmbalagem === null || porEmbalagem <= 0) {
    return embalagemRotulo
  }
  // Em milesimos (NUMERIC(12,3)): a divisao fecha sem erro de ponto flutuante.
  const total = Math.round(quantidade * 1000)
  const unidade = Math.round(porEmbalagem * 1000)
  return total % unidade === 0 ? `${(total / unidade).toLocaleString('pt-BR')} ${embalagemRotulo}` : embalagemRotulo
}

/**
 * Nota abaixo do campo Custo (spec B4 §4): "Último custo de entrada: R$ 10,00
 * em 24/10/2026 (2 CX c/ 18 UN)." (a embalagem so com a compra em embalagem)
 * ou "Custo editado manualmente em 24/10/2026.". Null sem origem (produto
 * anterior a Fase B4) ou sem custo.
 */
export function notaDaOrigemDoCusto(custo: number | null, origem: CustoOrigem | null): string | null {
  if (origem === null || custo === null) {
    return null
  }
  const data = formatarData(origem.em)
  if (origem.tipo === 'EDICAO') {
    return `Custo editado manualmente em ${data}.`
  }
  const embalagens = quantidadeEmEmbalagens(origem.quantidade, origem.embalagemRotulo)
  return `Último custo de entrada: ${formatarMoeda(custo)} em ${data}${embalagens ? ` (${embalagens})` : ''}.`
}

/**
 * Origem de uma linha de custo do Historico: "Entrada de compra (2 CX c/ 18
 * UN)", "Entrada de compra" (em unidades) ou "Editado". Null nas linhas de
 * preco (sem origem).
 */
export function textoDaOrigemNoHistorico(item: HistoricoPreco): string | null {
  if (item.origem === 'EDICAO') {
    return 'Editado'
  }
  if (item.origem !== 'ENTRADA_COMPRA') {
    return null
  }
  const embalagens = item.entrada ? quantidadeEmEmbalagens(item.entrada.quantidade, item.entrada.embalagemRotulo) : null
  return embalagens ? `Entrada de compra (${embalagens})` : 'Entrada de compra'
}
