import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, EyeOff } from 'lucide-react'

import {
  formatarDataHoraCaixa,
  formatarDiferenca,
  formatarReais,
  totaisDosMovimentos,
} from '@/features/cash-register/formatacaoCaixa'
import { cn } from '@/lib/utils'
import type { SessaoDeCaixa } from '@/types/caixa'

/** Diferenca com cor e icone: verde quando confere, ambar com sobra ou falta. */
export function TextoDaDiferenca({ valor, className }: { valor: number; className?: string }) {
  const { texto, tom } = formatarDiferenca(valor)
  const Icone = tom === 'ok' ? CheckCircle2 : AlertTriangle
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold tabular-nums',
        tom === 'ok' ? 'text-success-soft-foreground' : 'text-warning-soft-foreground',
        className,
      )}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {texto}
    </span>
  )
}

function Linha({ rotulo, children, destaque = false }: { rotulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', destaque && 'border-t pt-2.5')}>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn('text-right tabular-nums', destaque && 'font-semibold')}>{children}</dd>
    </div>
  )
}

/**
 * Fotografia do fechamento (spec §6.4): fundo, suprimentos, sangrias,
 * esperado, contado, diferenca e justificativa. Numa sessao ainda nao contada,
 * mostra o que existe; no modo cego sem o esperado, so o aviso (os totais
 * permitiriam calcula-lo).
 */
export function ResumoDoFechamento({ sessao }: { sessao: SessaoDeCaixa }) {
  const esperado = sessao.valorEsperado ?? sessao.dinheiroNaGaveta
  if (esperado === null) {
    // Modo cego, antes da contagem: fundo e totais revelariam o esperado. So a lista de movimentos fica.
    return (
      <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Fechamento cego: o valor esperado aparece depois da contagem.
      </p>
    )
  }
  const { suprimentos, sangrias } = totaisDosMovimentos(sessao.movimentos)

  return (
    <div className="space-y-3 text-sm">
      <dl>
        <Linha rotulo="Fundo de troco">{formatarReais(sessao.fundoTroco)}</Linha>
        <Linha rotulo="Suprimentos">{`+ ${formatarReais(suprimentos)}`}</Linha>
        <Linha rotulo="Sangrias">{`− ${formatarReais(sangrias)}`}</Linha>
        <Linha rotulo="Esperado na gaveta" destaque>
          {formatarReais(esperado)}
        </Linha>
        {sessao.valorContado !== null && (
          <Linha rotulo="Contado">{formatarReais(sessao.valorContado)}</Linha>
        )}
        {sessao.diferenca !== null && (
          <Linha rotulo="Diferença">
            <TextoDaDiferenca valor={sessao.diferenca} />
          </Linha>
        )}
      </dl>
      {sessao.justificativa && (
        <div className="rounded-md bg-muted/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Justificativa</p>
          <p className="break-words">{sessao.justificativa}</p>
        </div>
      )}
      {sessao.fechadaPorNome && sessao.fechadaEm && (
        <p className="text-xs text-muted-foreground">
          {`Fechado por ${sessao.fechadaPorNome} em ${formatarDataHoraCaixa(sessao.fechadaEm)}.`}
        </p>
      )}
    </div>
  )
}
