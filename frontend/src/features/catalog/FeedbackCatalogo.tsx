import { AlertCircle, CheckCircle2, Lock } from 'lucide-react'

interface FeedbackCatalogoProps {
  sucesso: string | null
  erro: string | null
}

/**
 * Feedback fixo no topo (sem toast), no padrao da tela de Clientes: continua
 * visivel ao agir sobre um item no fim da lista.
 */
export function FeedbackCatalogo({ sucesso, erro }: FeedbackCatalogoProps) {
  if (!sucesso && !erro) {
    return null
  }
  return (
    <div className="sticky top-0 z-10 space-y-2 bg-background py-2">
      {sucesso && (
        <div
          role="status"
          className="flex max-w-2xl items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{sucesso}</span>
        </div>
      )}
      {erro && (
        <div
          role="alert"
          className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  )
}

/** Aviso de modo leitura para quem nao e ADMIN (acoes ficam escondidas). */
export function AvisoSomenteLeitura({ texto }: { texto: string }) {
  return (
    <div className="flex max-w-2xl items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  )
}

/** Erro inline dentro de formulario ou dialogo. */
export function ErroInline({ mensagem }: { mensagem: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{mensagem}</span>
    </div>
  )
}
