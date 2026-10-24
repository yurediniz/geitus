import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { formatarPercentual } from '@/lib/percentual'
import { quantidadeParaTexto } from '@/lib/quantidade'
import type { DescontoInformado, OrigemPrecoDaVenda } from '@/types/pdv'

/** Selo do preco unitario (spec do PDV §6.2); o preco normal e o da embalagem ficam sem selo. */
export const SELO_DA_ORIGEM: Readonly<Partial<Record<OrigemPrecoDaVenda, string>>> = {
  PROMOCIONAL: 'Promoção',
  ATACADO: 'Atacado',
  ETIQUETA: 'Balança',
}

/** Quantidade sem zeros a direita ("0,4", "3"). */
export function formatarQuantidade(valor: number): string {
  return quantidadeParaTexto(valor)
}

/** "5%" ou "R$ 2,00". */
export function textoDoDesconto(desconto: DescontoInformado): string {
  return desconto.tipo === 'PERCENTUAL' ? `${formatarPercentual(desconto.valor).replace(/,00$/, '')}%` : formatarReais(desconto.valor)
}
