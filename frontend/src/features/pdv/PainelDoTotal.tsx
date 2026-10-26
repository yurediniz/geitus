import { AlertCircle, ArrowRight, CheckCircle2, Loader2, PauseCircle, Percent, Printer, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { focarCampoDeLeitura } from '@/features/pdv/focoDoPdv'
import { cn } from '@/lib/utils'
import type { CalculoDaVenda, Venda } from '@/types/pdv'

/** Um botao do painel, com o atalho escrito. */
export interface AcaoDoPainel {
  aoClicar: () => void
  desabilitado?: boolean
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
  /** F10 */
  pagamento: AcaoDoPainel
  /** Shift+F4 */
  descontoDaVenda: AcaoDoPainel
  /** F6 */
  porEmEspera: AcaoDoPainel
  /** F9: o comprovante da ultima venda. */
  imprimir: AcaoDoPainel
}

/** Quanto maior o texto do total, menor a fonte: nunca estoura a coluna (UX 10). */
function tamanhoDoTotal(texto: string): string {
  if (texto.length <= 10) {
    return 'text-5xl'
  }
  return texto.length <= 13 ? 'text-4xl' : 'text-3xl'
}

function Atalho({ children, claro = false }: { children: string; claro?: boolean }) {
  return (
    <kbd
      className={cn(
        'rounded px-1.5 py-0.5 font-sans text-[11px] font-semibold',
        claro ? 'bg-primary-foreground/15' : 'bg-foreground/10',
      )}
    >
      {children}
    </kbd>
  )
}

/**
 * O resumo e o total da venda (spec §6.2), no pe da coluna da direita: o
 * TOTAL, o maior texto da tela e anunciado ao mudar, com subtotal e
 * descontos; a ultima venda com o troco; e as acoes de fechamento com o
 * atalho. Enquanto calcula, um indicador discreto, sem esconder o valor anterior.
 */
export function PainelDoTotal({
  calculo,
  vazio,
  calculando,
  erros,
  falhaDoCalculo,
  aoTentarDeNovo,
  ultimaVenda,
  pagamento,
  descontoDaVenda,
  porEmEspera,
  imprimir,
}: PainelDoTotalProps) {
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
    <section aria-label="Resumo da venda" className="space-y-2.5 rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">Resumo</h2>
        <Button
          type="button"
          variant="ghost"
          className="-mr-2 h-8 gap-1.5 px-2 text-sm text-accent-foreground"
          onClick={depoisDe(descontoDaVenda.aoClicar)}
          disabled={descontoDaVenda.desabilitado}
          aria-keyshortcuts="Shift+F4"
        >
          <Percent className="h-3.5 w-3.5" aria-hidden="true" />
          Desconto da venda
          <Atalho>Shift+F4</Atalho>
        </Button>
      </div>

      {/* Sem desconto, o subtotal e o proprio total: o resumo so aparece quando ha o que explicar. */}
      {descontos > 0 && (
        <dl className="space-y-0.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{valor((atual) => atual.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Descontos</dt>
            <dd className="tabular-nums text-success-soft-foreground">{`− ${formatarReais(descontos)}`}</dd>
          </div>
        </dl>
      )}

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

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 rounded-xl bg-muted/60 px-4 py-2.5">
        <div>
          <p className="font-display text-lg font-semibold">Total da venda</p>
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
          aria-label="Total"
          aria-atomic="true"
          className={cn(
            'ml-auto font-display leading-none font-bold tracking-tight break-all tabular-nums transition-opacity',
            tamanhoDoTotal(total),
            calculando && 'opacity-70',
          )}
        >
          {/* A regiao viva anuncia "Total R$ 24,90", e nao so o valor. */}
          <span className="sr-only">Total </span>
          {total}
        </p>
      </div>

      {ultimaVenda && (
        <section
          role="status"
          aria-label="Última venda"
          className="space-y-1 rounded-xl bg-success/10 px-4 py-3 text-success-soft-foreground"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {`Venda nº ${ultimaVenda.numero} ${ultimaVenda.status === 'CANCELADA' ? 'cancelada' : 'concluída'}`}
          </p>
          {ultimaVenda.troco > 0 ? (
            <p className="font-display text-5xl leading-tight font-bold tabular-nums">{`Troco ${formatarReais(ultimaVenda.troco)}`}</p>
          ) : (
            <p className="text-sm">Sem troco.</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={depoisDe(imprimir.aoClicar)}
            disabled={imprimir.desabilitado}
            aria-keyshortcuts="F9"
            className="mt-1 h-10 w-full gap-2 border-success/40 bg-card text-foreground"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir comprovante
            <Atalho>F9</Atalho>
          </Button>
        </section>
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={depoisDe(porEmEspera.aoClicar)}
          disabled={porEmEspera.desabilitado}
          aria-keyshortcuts="F6"
          className="h-14 gap-2 rounded-xl px-3"
        >
          <PauseCircle className="h-4 w-4" aria-hidden="true" />
          Pôr em espera
          <Atalho>F6</Atalho>
        </Button>
        <Button
          type="button"
          onClick={depoisDe(pagamento.aoClicar)}
          disabled={pagamento.desabilitado}
          aria-keyshortcuts="F10"
          className="h-14 gap-2 rounded-xl px-3 text-base font-semibold"
        >
          Ir para pagamento
          <ArrowRight className="size-5" aria-hidden="true" />
          <Atalho claro>F10</Atalho>
        </Button>
      </div>
    </section>
  )
}
