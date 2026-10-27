import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { formatarPercentual } from '@/lib/percentual'
import { quantidadeParaTexto } from '@/lib/quantidade'
import type { DescontoInformado, OrigemPrecoDaVenda } from '@/types/pdv'

/** Selo do preco unitario (spec do PDV); o preco normal e o da embalagem ficam sem selo. */
export const SELO_DA_ORIGEM: Readonly<Partial<Record<OrigemPrecoDaVenda, string>>> = {
  PROMOCIONAL: 'Promoção',
  ATACADO: 'Atacado',
  ETIQUETA: 'Balança',
}

/** Quantidade: com 3 casas quando a unidade e fracionada ("0,400"); senao, sem zeros a direita ("3"). */
export function formatarQuantidade(valor: number, fracionada = false): string {
  return fracionada
    ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false })
    : quantidadeParaTexto(valor)
}

/** "5%" ou "R$ 2,00". */
export function textoDoDesconto(desconto: DescontoInformado): string {
  return desconto.tipo === 'PERCENTUAL' ? `${formatarPercentual(desconto.valor).replace(/,00$/, '')}%` : formatarReais(desconto.valor)
}
