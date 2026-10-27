/**
 * Textos da origem do custo do produto (Fase B4, docs/modules/estoque.md):
 * a nota da secao Precos e a origem nas linhas de custo do Historico.
 * Sem React: testavel isolado.
 */
import { formatarData, formatarMoeda } from '@/features/products/formatacaoProduto'
import { textoEmEmbalagens } from '@/lib/embalagem'
import type { CustoOrigem, HistoricoPreco } from '@/types/produto'

/** "2 CX c/ 18 UN" da compra em embalagens; null na compra em unidades. */
function embalagensDaCompra(compra: {
  embalagemRotulo: string | null
  quantidadeDeEmbalagens: number | null
}): string | null {
  return compra.embalagemRotulo == null || compra.quantidadeDeEmbalagens == null
    ? null
    : textoEmEmbalagens(compra.quantidadeDeEmbalagens, compra.embalagemRotulo)
}

/**
 * Nota abaixo do campo Custo (spec de Estoque): "Último custo de entrada: R$ 10,00
 * por UN, em 24/10/2026 (compra de 2 CX c/ 18 UN)." (a compra so quando foi em
 * embalagem) ou "Custo editado manualmente em 24/10/2026.". Com o fornecedor da
 * compra (spec de Fornecedores e marcas), ele vem no fim: "..., de Distribuidora Sul.". Null sem
 * origem (produto anterior a Fase B4) ou sem custo.
 */
export function notaDaOrigemDoCusto(
  custo: number | null,
  origem: CustoOrigem | null | undefined,
  sigla: string,
): string | null {
  if (origem == null || custo === null) {
    return null
  }
  const data = formatarData(origem.em)
  if (origem.tipo === 'EDICAO') {
    return `Custo editado manualmente em ${data}.`
  }
  const embalagens = embalagensDaCompra(origem)
  const compra = embalagens ? ` (compra de ${embalagens})` : ''
  const fornecedor = origem.fornecedorNome ? `, de ${origem.fornecedorNome}` : ''
  return `Último custo de entrada: ${formatarMoeda(custo)} por ${sigla}, em ${data}${compra}${fornecedor}.`
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
  const embalagens = item.entrada == null ? null : embalagensDaCompra(item.entrada)
  return embalagens ? `Entrada de compra (${embalagens})` : 'Entrada de compra'
}
