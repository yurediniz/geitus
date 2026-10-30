import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { DEVOLUCAO_NA_FORMA, juntarComE } from '@/features/pdv/devolucao'
import { FORMAS_DE_PAGAMENTO, type FormaDePagamento } from '@/types/caixa'
import type { Devolucao, Venda } from '@/types/pdv'

/**
 * O que devolver ao cliente depois do cancelamento, por forma, na ordem
 * dinheiro, debito, credito e PIX. O dinheiro e o recebido (pago menos o troco).
 */
export function mensagemDoCancelamento(venda: Venda): string {
  const centavosPorForma = new Map<FormaDePagamento, number>()
  for (const pagamento of venda.pagamentos) {
    centavosPorForma.set(pagamento.forma, (centavosPorForma.get(pagamento.forma) ?? 0) + Math.round(pagamento.valor * 100))
  }
  const troco = Math.round(venda.troco * 100)
  centavosPorForma.set('DINHEIRO', (centavosPorForma.get('DINHEIRO') ?? 0) - troco)
  const partes = FORMAS_DE_PAGAMENTO.flatMap((forma) => {
    const centavos = centavosPorForma.get(forma) ?? 0
    return centavos > 0 ? [`${formatarReais(centavos / 100)} ${DEVOLUCAO_NA_FORMA[forma]}`] : []
  })
  return partes.length > 0
    ? `Venda nº ${venda.numero} cancelada. Devolva ao cliente ${juntarComE(partes)}.`
    : `Venda nº ${venda.numero} cancelada. Estoque e caixa estornados.`
}

/** "Devolução da venda nº 8 registrada. Devolva ao cliente R$ 29,90 em dinheiro." */
export function mensagemDaDevolucao(devolucao: Devolucao): string {
  const partes = devolucao.reembolsos.map(
    (reembolso) => `${formatarReais(reembolso.valor)} ${DEVOLUCAO_NA_FORMA[reembolso.forma]}`,
  )
  return partes.length > 0
    ? `Devolução da venda nº ${devolucao.vendaNumero} registrada. Devolva ao cliente ${juntarComE(partes)}.`
    : `Devolução da venda nº ${devolucao.vendaNumero} registrada.`
}
