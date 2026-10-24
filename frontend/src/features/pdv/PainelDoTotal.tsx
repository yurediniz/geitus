import { useId } from 'react'
import { AlertCircle, CheckCircle2, Loader2, UserRound, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { focarCampoDeLeitura } from '@/features/pdv/focoDoPdv'
import { cn } from '@/lib/utils'
import type { CalculoDaVenda, Venda } from '@/types/pdv'

/** Um botao da coluna da direita, com o atalho escrito. */
export interface AcaoDoPainel {
  atalho: string
  rotulo: string
  aoClicar: () => void
  desabilitado?: boolean
  principal?: boolean
}

export interface PainelDoTotalProps {
  /** Null sem o calculo da venda atual (com itens, o total mostra "—"). */
  calculo: CalculoDaVenda | null
  /** Carrinho vazio: o total e zero. */
  vazio: boolean
  calculando: boolean
  /** Erros que nao sao de uma linha (desconto do total, total zero, dados que sumiram). */
  erros: readonly string[]
  falhaDoCalculo: string | null
  aoTentarDeNovo: () => void
  /** A ultima venda concluida, ate o primeiro item da proxima (o troco em destaque). */
  ultimaVenda: Venda | null
  clienteNome: string | null
  /** "Caixa 1 · Ana Souza" */
  pontoEOperador: string
  acoes: readonly AcaoDoPainel[]
}

/** Quanto maior o texto do total, menor a fonte: nunca estoura a coluna (UX 10). */
function tamanhoDoTotal(texto: string): string {
  if (texto.length <= 10) {
    return 'text-6xl'
  }
  return texto.length <= 13 ? 'text-5xl' : 'text-4xl'
}

/**
 * A coluna da direita do PDV (spec §6.2): o TOTAL, o maior texto da tela e
 * anunciado ao mudar, com subtotal e descontos; a ultima venda com o troco; o
 * cliente; os botoes com o atalho; e o ponto com o operador. Enquanto calcula,
 * um indicador discreto, sem esconder o valor anterior.
 */
export function PainelDoTotal({
  calculo,
  vazio,
  calculando,
  erros,
  falhaDoCalculo,
  aoTentarDeNovo,
  ultimaVenda,
  clienteNome,
  pontoEOperador,
  acoes,
}: PainelDoTotalProps) {
  const idTotal = useId()
  const idCliente = useId()
  const descontos = calculo ? calculo.descontoItens + calculo.descontoTotal : 0
  /** Sem o calculo desta venda, nada de valor de outra: o traco. */
  const valor = (de: (atual: CalculoDaVenda) => number) =>
    calculo ? formatarReais(de(calculo)) : vazio ? formatarReais(0) : '—'
  const total = valor((atual) => atual.total)
  const depoisDe = (acao: () => void) => () => {
    acao()
    // Sem janela aberta, o foco volta ao campo (com janela, ela o devolve ao fechar).
    focarCampoDeLeitura()
  }

  return (
    <aside className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm">
      <section className="min-w-0 space-y-2">
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
            'font-display leading-none font-bold tracking-tight break-all tabular-nums transition-opacity',
            tamanhoDoTotal(total),
            calculando && 'opacity-70',
          )}
        >
          {/* A regiao viva anuncia "Total R$ 24,90", e nao so o valor. */}
          <span className="sr-only">Total </span>
          {total}
        </p>
        <dl className="space-y-1 pt-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{valor((atual) => atual.subtotal)}</dd>
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
        {falhaDoCalculo && (
          <div role="alert" className="space-y-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            <p className="flex items-start gap-2">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {falhaDoCalculo}
            </p>
            <Button type="button" variant="outline" className="h-11" onClick={depoisDe(aoTentarDeNovo)}>
              Tentar de novo
            </Button>
          </div>
        )}
      </section>

      {ultimaVenda && (
        <section
          role="status"
          aria-label="Última venda"
          className="space-y-1 rounded-md bg-success/10 px-3 py-2 text-success-soft-foreground"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {`Venda nº ${ultimaVenda.numero} concluída`}
          </p>
          {ultimaVenda.troco > 0 ? (
            <p className="font-display text-3xl font-bold tabular-nums">{`Troco ${formatarReais(ultimaVenda.troco)}`}</p>
          ) : (
            <p className="text-sm">Sem troco.</p>
          )}
        </section>
      )}

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
            onClick={depoisDe(acao.aoClicar)}
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
