import { CircleAlert, CircleMinus, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react'

import { formatarMoeda } from '@/features/products/formatacaoProduto'
import { cn } from '@/lib/utils'
import type { ResumoDaPosicao, SituacaoDaPosicao } from '@/types/estoque'

interface CardDeSituacao {
  situacao: SituacaoDaPosicao
  titulo: string
  quantidade: (resumo: ResumoDaPosicao) => number
  Icone: LucideIcon
  /** Cor do icone e do numero quando ha produtos nessa situacao. */
  tom: string
  /** Os numeros se sobrepoem (regra 24): a linha diz o que o card inclui. */
  inclui?: string
}

/** Na ordem da spec (regra 24): sem estoque, baixo (inclui os sem) e negativos (contidos nos sem). */
const CARDS: readonly CardDeSituacao[] = [
  { situacao: 'sem', titulo: 'Sem estoque', quantidade: (r) => r.semEstoque, Icone: CircleAlert, tom: 'text-destructive' },
  {
    situacao: 'baixo',
    titulo: 'Estoque baixo',
    quantidade: (r) => r.baixo,
    Icone: TriangleAlert,
    tom: 'text-warning-soft-foreground',
    inclui: 'inclui os sem estoque',
  },
  {
    situacao: 'negativo',
    titulo: 'Negativos',
    quantidade: (r) => r.negativos,
    Icone: CircleMinus,
    tom: 'text-destructive',
    inclui: 'também em Sem estoque',
  },
]

function produtosSemCusto(quantidade: number): string {
  return quantidade === 1 ? '1 produto sem custo fica fora' : `${quantidade.toLocaleString('pt-BR')} produtos sem custo ficam fora`
}

export interface CardsDoResumoProps {
  /** Undefined enquanto carrega (ou se falhou): os numeros ficam em "—". */
  resumo: ResumoDaPosicao | undefined
  situacao: SituacaoDaPosicao | null
  /** Clicar no card da situacao ja escolhida tira o filtro. */
  aoEscolher: (situacao: SituacaoDaPosicao | null) => void
}

/**
 * Cards do resumo da posicao (spec de Estoque, regra 24): tres botoes que ligam
 * e desligam o filtro de situacao (`aria-pressed`) e o valor do estoque a custo.
 * Os numeros valem para a busca, o status e a categoria, sem a situacao.
 */
export function CardsDoResumo({ resumo, situacao, aoEscolher }: CardsDoResumoProps) {
  return (
    // Celular: as tres situacoes numa linha e o valor na linha inteira (o valor em reais nao cabe num terco).
    <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
      {CARDS.map((card) => {
        const quantidade = resumo ? card.quantidade(resumo) : null
        const escolhido = situacao === card.situacao
        const comAtencao = quantidade !== null && quantidade > 0
        return (
          <button
            key={card.situacao}
            type="button"
            aria-pressed={escolhido}
            onClick={() => aoEscolher(escolhido ? null : card.situacao)}
            className={cn(
              'flex min-w-0 flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors outline-none sm:p-4',
              'hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              escolhido && 'border-primary bg-primary/5 ring-1 ring-primary',
            )}
          >
            <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <card.Icone className={cn('mt-0.5 h-4 w-4 shrink-0', comAtencao ? card.tom : 'opacity-60')} aria-hidden="true" />
              {card.titulo}
            </span>
            <span className={cn('text-2xl font-semibold tabular-nums', comAtencao && card.tom)}>
              {quantidade === null ? '—' : quantidade.toLocaleString('pt-BR')}
            </span>
            {card.inclui && <span className="text-xs text-muted-foreground">{card.inclui}</span>}
          </button>
        )
      })}

      <div className="col-span-3 flex min-w-0 flex-col items-start gap-1 rounded-xl border bg-card p-3 shadow-xs sm:p-4 lg:col-span-1">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 opacity-60" aria-hidden="true" />
          Valor em estoque
        </span>
        <span className="max-w-full text-xl font-semibold break-words tabular-nums xl:text-2xl">
          {resumo ? formatarMoeda(resumo.valorTotalEmCusto) : '—'}
        </span>
        <span className="text-xs text-muted-foreground">
          {resumo && resumo.semCusto > 0 ? `a custo · ${produtosSemCusto(resumo.semCusto)}` : 'a custo'}
        </span>
      </div>
    </div>
  )
}
