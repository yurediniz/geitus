import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'

import { ComprovanteDaVenda } from '@/features/pdv/ComprovanteDaVenda'
import { CHAVE_DA_EMPRESA } from '@/features/pdv/pdvQuery'
import { obterEmpresa } from '@/services/empresaService'
import type { Venda } from '@/types/pdv'

export interface ImpressaoDoComprovanteProps {
  /** A venda a imprimir; null sem impressao pedida. */
  venda: Venda | null
  /** O nome da empresa do login, se os dados completos nao vierem. */
  nomeDaEmpresa: string
  /** Depois de abrir a janela de impressao do navegador (impressa ou cancelada). */
  aoTerminar: () => void
}

/**
 * Imprime o comprovante (DEC-044): poe o cupom numa area so de impressao
 * (`#area-de-impressao`, a unica visivel no `@media print`, em 80 mm) e abre
 * a janela de impressao do navegador. Os dados da empresa sao lidos ao abrir
 * o PDV, para o cupom sair na hora; se a leitura falhar, sai so com o nome.
 */
export function ImpressaoDoComprovante({ venda, nomeDaEmpresa, aoTerminar }: ImpressaoDoComprovanteProps) {
  const empresa = useQuery({ queryKey: CHAVE_DA_EMPRESA, queryFn: obterEmpresa, staleTime: 5 * 60_000 })
  const pronto = venda !== null && !empresa.isPending

  useEffect(() => {
    if (!pronto) {
      return
    }
    // O cupom so sai da pagina depois da impressao: no Chrome o print() bloqueia; nos outros, vale o afterprint.
    let terminou = false
    let reserva: ReturnType<typeof setTimeout> | undefined
    const terminar = () => {
      if (!terminou) {
        terminou = true
        aoTerminar()
      }
    }
    window.addEventListener('afterprint', terminar)
    // Um quadro depois, com o cupom ja desenhado.
    const quadro = requestAnimationFrame(() => {
      window.print()
      // Reserva para quem nao dispara o afterprint.
      reserva = setTimeout(terminar, 1_000)
    })
    return () => {
      cancelAnimationFrame(quadro)
      clearTimeout(reserva)
      window.removeEventListener('afterprint', terminar)
    }
  }, [pronto, aoTerminar])

  if (venda === null) {
    return null
  }
  return createPortal(
    <div id="area-de-impressao">
      <ComprovanteDaVenda venda={venda} empresa={empresa.data ?? null} nomeDaEmpresa={nomeDaEmpresa} />
    </div>,
    document.body,
  )
}
