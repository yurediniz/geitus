import { CircleAlert, CircleMinus, PackagePlus, TrendingUp, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SituacaoEstoque } from '@/types/estoque'

/** Texto, cor e icone de cada situacao que merece atencao (texto + icone, nunca so a cor). */
const SELO = {
  NEGATIVO: { texto: 'Negativo', classe: 'bg-destructive text-destructive-foreground', Icone: CircleMinus },
  ZERADO: { texto: 'Zerado', classe: 'bg-destructive-soft text-destructive-soft-foreground', Icone: CircleAlert },
  BAIXO: { texto: 'Baixo', classe: 'bg-warning text-warning-foreground', Icone: TriangleAlert },
  REPOSICAO: { texto: 'Reposição', classe: 'bg-warning-soft text-warning-soft-foreground', Icone: PackagePlus },
  ALTO: { texto: 'Alto', classe: 'bg-info-soft text-info-soft-foreground', Icone: TrendingUp },
} as const

/**
 * Selo da situacao do estoque calculada pelo backend (spec de Estoque, regra
 * 16): "Negativo" (a venda passou do saldo e o estoque precisa ser
 * regularizado), "Zerado", "Baixo" (abaixo do minimo), "Reposicao" (no ponto
 * de reposicao) e "Alto" (acima do maximo). Regular ou sem controle: nada.
 */
export function SeloSituacaoEstoque({
  situacao,
  className,
}: {
  situacao: SituacaoEstoque | null
  className?: string
}) {
  if (situacao === null || situacao === 'REGULAR') {
    return null
  }
  const { texto, classe, Icone } = SELO[situacao]
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', classe, className)}
    >
      <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
      {texto}
    </span>
  )
}
