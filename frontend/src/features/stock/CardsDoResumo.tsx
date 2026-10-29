import { CircleAlert, CircleMinus, PackagePlus, TrendingUp, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react'

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
}

/** Na ordem da spec (regra 24); as contagens sao exclusivas (um produto esta em uma situacao so). */
const CARDS: readonly CardDeSituacao[] = [
  { situacao: 'negativo', titulo: 'Negativo', quantidade: (r) => r.negativos, Icone: CircleMinus, tom: 'text-destructive' },
  { situacao: 'zerado', titulo: 'Zerado', quantidade: (r) => r.zerados, Icone: CircleAlert, tom: 'text-destructive' },
  // Baixo (reserva ja em uso) mais forte que Reposicao (hora de pedir), como nos selos.
  { situacao: 'baixo', titulo: 'Baixo', quantidade: (r) => r.baixo, Icone: TriangleAlert, tom: 'text-warning' },
  {
    situacao: 'reposicao',
    titulo: 'Reposição',
    quantidade: (r) => r.reposicao,
    Icone: PackagePlus,
    tom: 'text-warning-soft-foreground',
  },
  { situacao: 'alto', titulo: 'Alto', quantidade: (r) => r.alto, Icone: TrendingUp, tom: 'text-info-soft-foreground' },
]

function produtosSemCusto(quantidade: number): string {
  return quantidade === 1 ? '1 produto sem custo fica fora' : `${quantidade.toLocaleString('pt-BR')} produtos sem custo ficam fora`
}

export interface CardsDoResumoProps {
  /** Undefined enquanto carrega (ou se falhou): os numeros ficam em "—". */
  resumo: ResumoDaPosicao | undefined
  /** As situacoes marcadas no filtro (multisselecao). */
  situacoes: readonly SituacaoDaPosicao[]
  /** Liga ou desliga a situacao do card no filtro, mantendo as outras. */
  aoAlternar: (situacao: SituacaoDaPosicao) => void
}

/**
 * Cards do resumo da posicao (spec de Estoque, regra 24): cinco botoes
 * (negativo, zerado, baixo, reposicao e alto) que ligam e desligam a sua
 * situacao no filtro de multisselecao (`aria-pressed`; as outras marcadas
 * continuam) e o valor do estoque a custo. Os numeros valem para
 * a busca, o status e a categoria, sem a situacao.
 */
export function CardsDoResumo({ resumo, situacoes, aoAlternar }: CardsDoResumoProps) {
  return (
    // Celular: as cinco situacoes em duas linhas de tres e o valor na linha inteira (o valor em reais
    // nao cabe num terco); a partir de 640 px, o valor ocupa a vaga da segunda linha (grade 3 x 2); a
    // partir de 1280 px, tudo numa linha, com o valor mais largo.
    <div className="grid grid-cols-3 gap-2 sm:gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.5fr)]">
      {CARDS.map((card) => {
        const quantidade = resumo ? card.quantidade(resumo) : null
        const escolhido = situacoes.includes(card.situacao)
        const comAtencao = quantidade !== null && quantidade > 0
        return (
          <button
            key={card.situacao}
            type="button"
            aria-pressed={escolhido}
            onClick={() => aoAlternar(card.situacao)}
            className={cn(
              'flex min-w-0 flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors outline-none sm:p-4',
              'hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              escolhido && 'border-primary bg-primary/5 ring-1 ring-primary',
            )}
          >
            <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
              {/* No celular o icone sai: "Reposição" nao cabe com ele num terco da tela. */}
              <card.Icone
                className={cn('mt-0.5 hidden h-4 w-4 shrink-0 sm:block', comAtencao ? card.tom : 'opacity-60')}
                aria-hidden="true"
              />
              {card.titulo}
            </span>
            <span className={cn('text-2xl font-semibold tabular-nums', comAtencao && card.tom)}>
              {quantidade === null ? '—' : quantidade.toLocaleString('pt-BR')}
            </span>
          </button>
        )
      })}

      <div className="col-span-3 flex min-w-0 flex-col items-start gap-1 rounded-xl border bg-card p-3 shadow-xs sm:col-span-1 sm:p-4">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 opacity-60" aria-hidden="true" />
          Valor em estoque
        </span>
        <span className="max-w-full text-xl font-semibold break-words tabular-nums 2xl:text-2xl">
          {resumo ? formatarMoeda(resumo.valorTotalEmCusto) : '—'}
        </span>
        <span className="text-xs text-muted-foreground">
          {resumo && resumo.semCusto > 0 ? `a custo · ${produtosSemCusto(resumo.semCusto)}` : 'a custo'}
        </span>
      </div>
    </div>
  )
}
