import { Loader2 } from 'lucide-react'

/**
 * Indicador simples e discreto exibido enquanto a sessao e revalidada no boot
 * (reidratacao via GET /api/auth/me). Evita o "flicker" de renderizar a area
 * privada sem os dados do usuario ou piscar antes de um redirect por token
 * invalido. Deve permanecer minimalista, alinhado a identidade do Geitus.
 */
export function SessionLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm">Carregando sua sessão...</span>
    </div>
  )
}
