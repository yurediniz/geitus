import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'

import { getHealth } from '@/services/healthService'

/**
 * Cartao que exibe o status do backend consumindo GET /api/health.
 * Trata os tres estados principais: carregando, sucesso e erro.
 */
export function BackendStatus() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })

  return (
    <div className="max-w-md rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Status do backend</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={isFetching ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          Atualizar
        </button>
      </div>

      {isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando conexão com o servidor...
        </p>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          <span>
            Backend indisponível
            {error instanceof Error ? ` — ${error.message}` : '.'}
          </span>
        </div>
      )}

      {data && !isPending && !isError && (
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            Conectado ({data.status})
          </p>
          <p className="text-muted-foreground">
            Aplicação: <span className="text-foreground">{data.aplicacao}</span>
          </p>
        </div>
      )}
    </div>
  )
}
