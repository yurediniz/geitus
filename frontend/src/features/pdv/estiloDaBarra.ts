import { cn } from '@/lib/utils'

/** Os botoes da barra do PDV: contorno claro sobre o grafite. */
export const CLASSE_DO_BOTAO_DA_BARRA = cn(
  'h-11 border border-barra-pdv-border bg-transparent text-barra-pdv-foreground shadow-none',
  'hover:bg-white/10 hover:text-barra-pdv-foreground focus-visible:ring-primary/60',
)
