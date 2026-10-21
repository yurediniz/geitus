import { cn } from '@/lib/utils'

/** Selo Ativo/Inativo do produto (texto + cor, nunca so a cor). */
export function SeloStatus({ ativo, className }: { ativo: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        ativo ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}
