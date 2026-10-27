import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import type { CalculoDaVenda } from '@/types/pdv'

export interface JanelaTotalMudouProps {
  /** Null com a janela fechada. */
  anterior: number | null
  /** O calculo refeito agora; null enquanto calcula. */
  novo: CalculoDaVenda | null
  enviando: boolean
  aoConfirmar: (novoTotal: number) => void
  aoVoltar: () => void
  /** O pagamento nao cobre o novo total: fecha so esta janela e mantem as formas lancadas. */
  aoAjustar: () => void
}

/**
 * "O total da venda mudou" (spec do PDV): um preco ou uma promocao mudou
 * entre o calculo e o finalizar. Mostra o total anterior e o novo; confirmar
 * reenvia a venda com o novo total e a mesma chave.
 */
export function JanelaTotalMudou({ anterior, novo, enviando, aoConfirmar, aoVoltar, aoAjustar }: JanelaTotalMudouProps) {
  const naoCobre = novo !== null && novo.faltaPagar > 0
  const podeConfirmar = novo !== null && !naoCobre && novo.erros.length === 0 && !enviando
  return (
    <Dialog open={anterior !== null} onOpenChange={(aberta) => !aberta && !enviando && aoVoltar()}>
      {anterior !== null && (
        <DialogContent showCloseButton={!enviando} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>O total da venda mudou</DialogTitle>
            <DialogDescription>Um preço mudou desde o cálculo. Confira o novo total antes de finalizar.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 rounded-md bg-muted/60 px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Total anterior</dt>
              <dd className="tabular-nums text-muted-foreground line-through">{formatarReais(anterior)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm font-medium">Novo total</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums">
                {novo === null ? (
                  <span className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Calculando
                  </span>
                ) : (
                  formatarReais(novo.total)
                )}
              </dd>
            </div>
          </dl>
          {naoCobre && (
            <p className="text-sm text-warning-soft-foreground">
              {`O pagamento não cobre o novo total (falta ${formatarReais(novo.faltaPagar)}). Volte e ajuste o pagamento.`}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={aoVoltar} disabled={enviando}>
              Voltar à venda
            </Button>
            {naoCobre && (
              <Button type="button" variant="outline" className="min-h-11" onClick={aoAjustar} disabled={enviando}>
                Ajustar pagamento
              </Button>
            )}
            <Button
              type="button"
              className="min-h-11"
              disabled={!podeConfirmar}
              onClick={() => novo && aoConfirmar(novo.total)}
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar e finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
