import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'

import { getHealth } from '@/services/healthService'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Status do backend</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
            Atualizar
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
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
      </CardContent>
    </Card>
  )
}
