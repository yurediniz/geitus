import { Ban, PackageOpen } from 'lucide-react'

import type { VendaResumo } from '@/types/pdv'

/**
 * Os selos da situacao de uma venda na lista (F8 e tela Vendas): "Cancelada" e,
 * com devolucao, "Devolvida" (tudo devolvido) ou "Devolução parcial". Texto e
 * icone, nunca so a cor; venda concluida sem devolucao nao tem selo.
 */
export function SelosDaVenda({ venda }: { venda: Pick<VendaResumo, 'status' | 'situacaoDevolucao'> }) {
  const devolucao = venda.situacaoDevolucao === 'TOTAL' ? 'Devolvida' : venda.situacaoDevolucao === 'PARCIAL' ? 'Devolução parcial' : null
  return (
    <>
      {venda.status === 'CANCELADA' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-destructive">
          <Ban className="h-3 w-3" aria-hidden="true" />
          Cancelada
        </span>
      )}
      {devolucao && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-warning-soft-foreground">
          <PackageOpen className="h-3 w-3" aria-hidden="true" />
          {devolucao}
        </span>
      )}
    </>
  )
}
