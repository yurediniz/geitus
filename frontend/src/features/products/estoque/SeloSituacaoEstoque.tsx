import { CircleAlert, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SituacaoEstoque } from '@/types/estoque'

/** Texto, cor e icone de cada situacao que merece atencao (texto + icone, nunca so a cor). */
const SELO = {
  BAIXO: { texto: 'Estoque baixo', classe: 'bg-warning-soft text-warning-soft-foreground', Icone: TriangleAlert },
  SEM_ESTOQUE: { texto: 'Sem estoque', classe: 'bg-destructive-soft text-destructive-soft-foreground', Icone: CircleAlert },
} as const

/**
 * Selo da situacao do estoque: "Estoque baixo" (tom de aviso) ou "Sem
 * estoque" (tom destrutivo suave). Situacao normal ou sem controle: nada.
 */
export function SeloSituacaoEstoque({ situacao, className }: { situacao: SituacaoEstoque | null; className?: string }) {
  if (situacao === null || situacao === 'NORMAL') {
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
