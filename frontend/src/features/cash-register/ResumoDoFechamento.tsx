import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, EyeOff } from 'lucide-react'

import {
  formatarDataHoraCaixa,
  formatarDiferenca,
  formatarReais,
  ROTULO_DA_FORMA,
  totaisDosMovimentos,
} from '@/features/cash-register/formatacaoCaixa'
import { cn } from '@/lib/utils'
import type { SessaoDeCaixa, ValoresPorForma } from '@/types/caixa'

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

/** Valor em reais, ou o traco quando ainda nao existe (antes da contagem) ou esta oculto. */
function reaisOuTraco(valor: number | null): string {
  return valor === null ? '—' : formatarReais(valor)
}

/** Esperado, contado e diferenca de cada forma (spec do PDV). */
function TabelaPorForma({ porForma }: { porForma: readonly ValoresPorForma[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="pb-1 text-left text-xs font-medium text-muted-foreground">
        Conferência por forma de pagamento
      </caption>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="py-1 text-left font-medium">
            Forma
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Esperado
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Contado
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Diferença
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {porForma.map((valores) => (
          <tr key={valores.forma}>
            <th scope="row" className="py-1.5 text-left font-normal">
              {ROTULO_DA_FORMA[valores.forma]}
            </th>
            <td className="py-1.5 text-right tabular-nums">{reaisOuTraco(valores.esperado)}</td>
            <td className="py-1.5 text-right tabular-nums">{reaisOuTraco(valores.contado)}</td>
            <td className="py-1.5 text-right">
              {valores.diferenca === null ? '—' : <TextoDaDiferenca valor={valores.diferenca} className="justify-end" />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Fotografia do fechamento (spec do Caixa e do PDV): fundo,
 * suprimentos, sangrias, vendas em dinheiro, esperado, contado, diferenca e
 * justificativa. Com mais de uma forma contada, a tabela por forma. Numa sessao ainda nao contada,
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
  const { suprimentos, sangrias, vendasEmDinheiro, devolucoesEmDinheiro, completos } = totaisDosMovimentos(
    sessao.movimentos,
  )
  const temVendasEmDinheiro = sessao.movimentos.some(
    (movimento) => movimento.forma === 'DINHEIRO' && (movimento.tipo === 'RECEBIMENTO' || movimento.tipo === 'ESTORNO'),
  )
  // Backend antigo, sem `porForma`: so o dinheiro.
  const porForma = sessao.porForma ?? []
  const variasFormas = porForma.length > 1

  return (
    <div className="space-y-3 text-sm">
      <dl>
        <Linha rotulo="Fundo de troco">{formatarReais(sessao.fundoTroco)}</Linha>
        {/* Com algum valor oculto, os totais sairiam errados: nao aparecem. */}
        {completos && <Linha rotulo="Suprimentos">{`+ ${formatarReais(suprimentos)}`}</Linha>}
        {completos && <Linha rotulo="Sangrias">{`− ${formatarReais(sangrias)}`}</Linha>}
        {completos && temVendasEmDinheiro && (
          <Linha rotulo="Vendas em dinheiro">
            {vendasEmDinheiro < 0
              ? `− ${formatarReais(Math.abs(vendasEmDinheiro))}`
              : `+ ${formatarReais(vendasEmDinheiro)}`}
          </Linha>
        )}
        {completos && devolucoesEmDinheiro > 0 && (
          <Linha rotulo="Devoluções em dinheiro">{`− ${formatarReais(devolucoesEmDinheiro)}`}</Linha>
        )}
        <Linha rotulo="Esperado na gaveta" destaque>
          {formatarReais(esperado)}
        </Linha>
        {!variasFormas && sessao.valorContado !== null && (
          <Linha rotulo="Contado">{formatarReais(sessao.valorContado)}</Linha>
        )}
        {!variasFormas && sessao.diferenca !== null && (
          <Linha rotulo="Diferença">
            <TextoDaDiferenca valor={sessao.diferenca} />
          </Linha>
        )}
      </dl>
      {variasFormas && <TabelaPorForma porForma={porForma} />}
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
