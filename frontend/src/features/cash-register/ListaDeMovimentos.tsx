import { ArrowDownToLine, ArrowUpFromLine, PackageOpen, ReceiptText, Undo2, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  formatarHora,
  formatarReais,
  ROTULO_DA_FORMA,
  ROTULO_DO_MOVIMENTO,
} from '@/features/cash-register/formatacaoCaixa'
import { cn } from '@/lib/utils'
import type { MovimentoDeCaixa, TipoDeMovimentoDeCaixa } from '@/types/caixa'

/**
 * Sangria, estorno e devolucao em ambar; suprimento, abertura e recebimento
 * neutros (spec do Caixa). Sempre com icone, nunca so a cor.
 */
const ESTILO_DO_TIPO: Readonly<Record<TipoDeMovimentoDeCaixa, { icone: LucideIcon; classe: string }>> = {
  ABERTURA: { icone: Wallet, classe: 'bg-muted text-muted-foreground' },
  SUPRIMENTO: { icone: ArrowDownToLine, classe: 'bg-muted text-muted-foreground' },
  SANGRIA: { icone: ArrowUpFromLine, classe: 'bg-warning-soft text-warning-soft-foreground' },
  RECEBIMENTO: { icone: ReceiptText, classe: 'bg-muted text-muted-foreground' },
  ESTORNO: { icone: Undo2, classe: 'bg-warning-soft text-warning-soft-foreground' },
  DEVOLUCAO: { icone: PackageOpen, classe: 'bg-warning-soft text-warning-soft-foreground' },
}

/** Sangria, estorno e devolucao tiram do caixa, suprimento e recebimento poem; a abertura e o fundo (sem sinal). */
function sinalDoMovimento(tipo: TipoDeMovimentoDeCaixa): string {
  if (tipo === 'SANGRIA' || tipo === 'ESTORNO' || tipo === 'DEVOLUCAO') {
    return '− '
  }
  return tipo === 'ABERTURA' ? '' : '+ '
}

/** "Venda nº 128 · Débito" nos movimentos de venda; o motivo nos lancamentos. */
function descricaoDoMovimento(movimento: MovimentoDeCaixa): string | null {
  if (movimento.tipo === 'RECEBIMENTO' || movimento.tipo === 'ESTORNO' || movimento.tipo === 'DEVOLUCAO') {
    const venda = movimento.vendaNumero === null ? 'Venda' : `Venda nº ${movimento.vendaNumero}`
    return `${venda} · ${ROTULO_DA_FORMA[movimento.forma]}`
  }
  return movimento.motivo
}

/** Movimentos da sessao (do mais recente para o mais antigo): hora, tipo, valor, motivo ou venda e quem lancou. */
export function ListaDeMovimentos({ movimentos }: { movimentos: readonly MovimentoDeCaixa[] }) {
  if (movimentos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum movimento.</p>
  }
  return (
    <ul aria-label="Movimentos do caixa" className="divide-y">
      {movimentos.map((movimento) => {
        const { icone: Icone, classe } = ESTILO_DO_TIPO[movimento.tipo]
        const descricao = descricaoDoMovimento(movimento)
        return (
          <li key={movimento.id} className="flex items-start gap-3 py-2.5 text-sm">
            <span className="w-11 shrink-0 pt-0.5 text-muted-foreground tabular-nums">
              {formatarHora(movimento.criadoEm)}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <span
                className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', classe)}
              >
                <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                {ROTULO_DO_MOVIMENTO[movimento.tipo]}
              </span>
              {descricao && <p className="break-words">{descricao}</p>}
              <p className="text-xs text-muted-foreground">{movimento.usuarioNome}</p>
            </div>
            {movimento.valor === null ? (
              // Modo cego: o lancamento de outra pessoa e as vendas nao mostram o valor antes da contagem.
              <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">Valor no fechamento</span>
            ) : (
              <span className="shrink-0 pt-0.5 font-semibold tabular-nums">
                {sinalDoMovimento(movimento.tipo)}
                {formatarReais(movimento.valor)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
