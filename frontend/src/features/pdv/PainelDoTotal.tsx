import { useId } from 'react'
import { AlertCircle, Loader2, UserRound, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { cn } from '@/lib/utils'
import type { CalculoDaVenda } from '@/types/pdv'

/** Um botao da coluna da direita, com o atalho escrito. */
export interface AcaoDoPainel {
  atalho: string
  rotulo: string
  aoClicar: () => void
  desabilitado?: boolean
  principal?: boolean
}

export interface PainelDoTotalProps {
  calculo: CalculoDaVenda | null
  calculando: boolean
  /** Erros que nao sao de uma linha (desconto do total, total zero, dados que sumiram). */
  erros: readonly string[]
  falhaDeRede: string | null
  aoTentarDeNovo: () => void
  clienteNome: string | null
  /** "Caixa 1 · Ana Souza" */
  pontoEOperador: string
  acoes: readonly AcaoDoPainel[]
}

/**
 * A coluna da direita do PDV (spec §6.2): o TOTAL, o maior texto da tela e
 * anunciado ao mudar, com subtotal e descontos; o cliente; os botoes com o
 * atalho; e o ponto com o operador. Enquanto calcula, um indicador discreto,
 * sem esconder o valor anterior.
 */
export function PainelDoTotal({
  calculo,
  calculando,
  erros,
  falhaDeRede,
  aoTentarDeNovo,
  clienteNome,
  pontoEOperador,
  acoes,
}: PainelDoTotalProps) {
  const idTotal = useId()
  const idCliente = useId()
  const descontos = calculo ? calculo.descontoItens + calculo.descontoTotal : 0

  return (
    <aside className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p id={idTotal} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Total
          </p>
          {calculando && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Calculando
            </span>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-labelledby={idTotal}
          aria-atomic="true"
          className={cn(
            'font-display text-6xl leading-none font-bold tracking-tight tabular-nums transition-opacity',
            calculando && 'opacity-70',
          )}
        >
          {formatarReais(calculo?.total ?? 0)}
        </p>
        <dl className="space-y-1 pt-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatarReais(calculo?.subtotal ?? 0)}</dd>
          </div>
          {descontos > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Descontos</dt>
              <dd className="tabular-nums text-success-soft-foreground">{`− ${formatarReais(descontos)}`}</dd>
            </div>
          )}
        </dl>
        {erros.map((erro) => (
          <p
            key={erro}
            role="alert"
            className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </p>
        ))}
        {falhaDeRede && (
          <div role="alert" className="space-y-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            <p className="flex items-start gap-2">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {falhaDeRede}
            </p>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={aoTentarDeNovo}>
              Tentar de novo
            </Button>
          </div>
        )}
      </section>

      <section className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span id={idCliente} className="text-muted-foreground">
          Cliente
        </span>
        <span aria-labelledby={idCliente} role="note" className="ml-auto truncate font-medium">
          {clienteNome ?? 'Sem cliente'}
        </span>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {acoes.map((acao) => (
          <Button
            key={acao.atalho}
            type="button"
            variant={acao.principal ? 'default' : 'outline'}
            onClick={acao.aoClicar}
            disabled={acao.desabilitado}
            aria-keyshortcuts={acao.atalho}
            className={cn('h-11 justify-start gap-2 px-3', acao.principal && 'col-span-2 h-12 text-base')}
          >
            <kbd className="rounded bg-foreground/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold">{acao.atalho}</kbd>
            <span className="truncate">{acao.rotulo}</span>
          </Button>
        ))}
      </div>

      <p className="mt-auto text-sm text-muted-foreground">{pontoEOperador}</p>
    </aside>
  )
}
