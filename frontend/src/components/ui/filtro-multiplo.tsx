import * as React from 'react'
import { Check, ChevronsUpDown, type LucideIcon } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface OpcaoDoFiltroMultiplo<T extends string> {
  valor: T
  rotulo: string
  Icone?: LucideIcon
}

export interface FiltroMultiploProps<T extends string> {
  id?: string
  /** Id do rotulo visivel do filtro: o botao e lido como "Situação: Zerado +1". */
  idRotulo?: string
  opcoes: readonly OpcaoDoFiltroMultiplo<T>[]
  /** Os valores marcados; vazio = sem filtro. */
  valores: readonly T[]
  /** Recebe os marcados na ordem das `opcoes`. */
  onChange: (valores: T[]) => void
  /** Texto do botao sem nada marcado ("Todas", "Todos"). */
  rotuloTodos: string
  className?: string
}

/** "Todas", o rotulo da unica opcao marcada ou "Zerado +2" (o primeiro na ordem das opcoes). */
/** O nome da primeira marcada (ou o rotulo de "todas") e quantas mais; o "+N" vai num span que nao trunca. */
function textoDoFiltroMultiplo<T extends string>(
  opcoes: readonly OpcaoDoFiltroMultiplo<T>[],
  valores: readonly T[],
  rotuloTodos: string,
): { nome: string; mais: number } {
  const marcadas = opcoes.filter((opcao) => valores.includes(opcao.valor))
  return marcadas.length === 0 ? { nome: rotuloTodos, mais: 0 } : { nome: marcadas[0].rotulo, mais: marcadas.length - 1 }
}

/**
 * Filtro de varios valores: um botao no tamanho dos selects que abre um painel
 * com uma caixa por opcao. Marcar nao fecha o painel; "Limpar" (sempre na
 * lista, desabilitado sem nada marcado, para o painel nao pular) desmarca tudo e
 * Esc fecha. As caixas sao `<input type="checkbox">` nativos (Tab e espaco
 * funcionam sem esforco extra), e as setas tambem andam entre elas.
 */
export function FiltroMultiplo<T extends string>({
  id,
  idRotulo,
  opcoes,
  valores,
  onChange,
  rotuloTodos,
  className,
}: FiltroMultiploProps<T>) {
  const idGerado = React.useId()
  const idGatilho = id ?? idGerado
  const idValor = `${idGatilho}-valor`
  const listaRef = React.useRef<HTMLDivElement>(null)
  const { nome, mais } = textoDoFiltroMultiplo(opcoes, valores, rotuloTodos)
  // "Negativo +1" nao diz quais: a lista completa fica no title.
  const todosOsEscolhidos = opcoes
    .filter((opcao) => valores.includes(opcao.valor))
    .map((opcao) => opcao.rotulo)
    .join(', ')

  const alternar = (valor: T, marcar: boolean) => {
    const proximos = marcar ? [...valores, valor] : valores.filter((item) => item !== valor)
    onChange(opcoes.map((opcao) => opcao.valor).filter((item) => proximos.includes(item)))
  }

  const aoTeclarNaLista = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    const caixas = Array.from(listaRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])
    const atual = caixas.indexOf(document.activeElement as HTMLInputElement)
    if (caixas.length === 0) {
      return
    }
    event.preventDefault()
    const passo = event.key === 'ArrowDown' ? 1 : -1
    caixas[(atual + passo + caixas.length) % caixas.length]?.focus()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={idGatilho}
          aria-labelledby={idRotulo ? `${idRotulo} ${idValor}` : undefined}
          title={valores.length > 1 ? todosOsEscolhidos : undefined}
          className={cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            className,
          )}
        >
          <span id={idValor} className={cn('flex min-w-0 gap-1', valores.length === 0 && 'text-muted-foreground')}>
            <span className="truncate">{nome}</span>
            {mais > 0 && <>{' '}<span className="shrink-0">{`+${mais}`}</span></>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={idRotulo}
        className="max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-56 overflow-y-auto p-1"
      >
        <div
          ref={listaRef}
          role="group"
          aria-labelledby={idRotulo}
          onKeyDown={aoTeclarNaLista}
          className="flex flex-col"
        >
          {opcoes.map(({ valor, rotulo, Icone }) => {
            const marcada = valores.includes(valor)
            return (
              <label
                key={valor}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-muted has-[:focus-visible]:bg-muted md:min-h-9"
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={(event) => alternar(valor, event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-input peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
                >
                  {marcada && <Check className="h-3 w-3" />}
                </span>
                {Icone && <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span>{rotulo}</span>
              </label>
            )
          })}
        </div>
        <div className="mt-1 border-t pt-1">
          <button
            type="button"
            disabled={valores.length === 0}
            onClick={() => {
              onChange([])
              // O "Limpar" fica desabilitado com a lista vazia: o foco vai para a primeira caixa, sem cair no body.
              listaRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus()
            }}
            className="flex min-h-11 w-full items-center rounded-sm px-2 text-left text-sm text-primary outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:min-h-9"
          >
            Limpar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
