import { CircleAlert, CircleMinus, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SituacaoEstoque } from '@/types/estoque'

/** Texto, cor e icone de cada situacao que merece atencao (texto + icone, nunca so a cor). */
const SELO = {
  BAIXO: { texto: 'Estoque baixo', classe: 'bg-warning-soft text-warning-soft-foreground', Icone: TriangleAlert },
  SEM_ESTOQUE: { texto: 'Sem estoque', classe: 'bg-destructive-soft text-destructive-soft-foreground', Icone: CircleAlert },
  NEGATIVO: { texto: 'Negativo', classe: 'bg-destructive text-destructive-foreground', Icone: CircleMinus },
} as const

/**
 * Selo da situacao do estoque: "Estoque baixo" (tom de aviso), "Sem
 * estoque" (tom destrutivo suave) ou, com o `saldo` informado e menor que
 * zero, "Negativo" (tom destrutivo forte: a venda passou do saldo e o estoque
 * precisa ser regularizado, spec de Estoque). Situacao normal ou sem controle: nada.
 */
export function SeloSituacaoEstoque({
  situacao,
  saldo,
  className,
}: {
  situacao: SituacaoEstoque | null
  saldo?: number
  className?: string
}) {
  if (situacao === null || situacao === 'NORMAL') {
    return null
  }
  const { texto, classe, Icone } = SELO[saldo !== undefined && saldo < 0 ? 'NEGATIVO' : situacao]
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', classe, className)}
    >
      <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
      {texto}
    </span>
  )
}
