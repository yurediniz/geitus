import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ConfiguracaoDaArvore } from '@/features/catalog/cadastrosEmArvore'
import { comMaiuscula } from '@/features/catalog/textosCatalogo'
import { filtrarPorTermo } from '@/lib/arvoreCategorias'
import { cn } from '@/lib/utils'
import type { ItemDaArvore } from '@/types/catalogo'

export interface SeletorDaArvoreMultiploProps<T extends ItemDaArvore> {
  /** Cadastro (categorias ou marcas): textos. */
  configuracao: ConfiguracaoDaArvore<T>
  /** Lista plana da empresa, na ordem da arvore. */
  itens: T[]
  /** Os ids marcados; vazio = sem filtro. */
  valores: readonly string[]
  /** Recebe os marcados na ordem da lista. */
  onChange: (ids: string[]) => void
  /** Quantos podem ser marcados (o limite da API). */
  maximo: number
  /** Oferece tambem os itens inativos, marcados com "(inativa)" (filtro da lista). */
  incluirInativas?: boolean
  /** Texto do botao sem nada marcado ("Todas"). */
  rotuloTodos: string
  /** Id do botao que abre o seletor. */
  id?: string
  /** Id do rotulo visivel do filtro: o botao e lido como "Categoria: Ração +1". */
  idRotulo?: string
  className?: string
}

function rotuloDoItem(item: ItemDaArvore): string {
  return item.selecionavel ? item.caminho : `${item.caminho} (inativa)`
}

/**
 * Filtro de varios itens de um cadastro em arvore (categoria): um botao no
 * tamanho dos selects ("Todas", "Ração" ou "Ração +2") que abre um painel com
 * a busca pelo caminho (sem diferenciar acentos) e uma caixa por item. Segue o
 * `FiltroMultiplo`: marcar nao fecha o painel; "Limpar" fica sempre na lista,
 * desabilitado sem nada marcado; Esc fecha. Ao chegar no `maximo`, as caixas
 * nao marcadas ficam desabilitadas. Cada item inclui os descendentes (quem
 * resolve e o backend). O modo de um valor so e o `SeletorDaArvore`.
 *
 * Teclado: seta para baixo na busca vai para a primeira caixa; as setas andam
 * entre as caixas (com volta); espaco marca.
 */
export function SeletorDaArvoreMultiplo<T extends ItemDaArvore>({
  configuracao,
  itens,
  valores,
  onChange,
  maximo,
  incluirInativas = false,
  rotuloTodos,
  id,
  idRotulo,
  className,
}: SeletorDaArvoreMultiploProps<T>) {
  const { textos } = configuracao
  const idBase = useId()
  const idGatilho = id ?? `${idBase}-gatilho`
  const idValor = `${idBase}-valor`
  const [termo, setTermo] = useState('')
  const buscaRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const selecionaveis = useMemo(
    () => (incluirInativas ? itens : itens.filter((item) => item.selecionavel)),
    [itens, incluirInativas],
  )
  const visiveis = useMemo(() => filtrarPorTermo(selecionaveis, termo), [selecionaveis, termo])
  const marcados = useMemo(() => selecionaveis.filter((item) => valores.includes(item.id)), [selecionaveis, valores])
  const noLimite = valores.length >= maximo

  // "Todas", o caminho do unico marcado ou "Ração +2" (o primeiro na ordem da lista). Ids que a lista
  // nao conhece (as categorias nao carregaram) contam no numero, sem nome.
  // No botao vai so o ultimo trecho do caminho ("Antiparasitário", nao "Medicamento › Antiparasitário"), e o
  // "+N" fica num span proprio que nunca e cortado: o nome trunca, o numero de marcadas continua visivel.
  const { nome, mais } = (() => {
    if (valores.length === 0) {
      return { nome: rotuloTodos, mais: 0 }
    }
    const primeiro = marcados[0]
    if (!primeiro) {
      return {
        nome:
          valores.length === 1
            ? `${comMaiuscula(textos.singular)} selecionada`
            : `${valores.length} ${textos.plural} selecionadas`,
        mais: 0,
      }
    }
    const ultimoTrecho = primeiro.caminho.split(' › ').at(-1) ?? primeiro.caminho
    return { nome: primeiro.selecionavel ? ultimoTrecho : `${ultimoTrecho} (inativa)`, mais: valores.length - 1 }
  })()
  // O caminho completo de todas as marcadas fica no title (tambem com uma so, que o botao mostra encurtada).
  const todosOsMarcados = marcados.map(rotuloDoItem).join(', ')

  const alternar = (idDoItem: string, marcar: boolean) => {
    const proximos = marcar ? [...valores, idDoItem] : valores.filter((item) => item !== idDoItem)
    // Na ordem da lista; os que a lista nao conhece ficam no fim.
    const conhecidos = selecionaveis.map((item) => item.id).filter((item) => proximos.includes(item))
    const desconhecidos = proximos.filter((item) => !selecionaveis.some((conhecido) => conhecido.id === item))
    onChange([...conhecidos, ...desconhecidos].slice(0, maximo))
  }

  const caixas = () =>
    Array.from(listaRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)') ?? [])

  const aoTeclarNaBusca = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      caixas()[0]?.focus()
    }
  }

  const aoTeclarNaLista = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    const lista = caixas()
    if (lista.length === 0) {
      return
    }
    event.preventDefault()
    const atual = lista.indexOf(document.activeElement as HTMLInputElement)
    const passo = event.key === 'ArrowDown' ? 1 : -1
    lista[(atual + passo + lista.length) % lista.length]?.focus()
  }

  return (
    <Popover onOpenChange={(aberto) => aberto && setTermo('')}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={idGatilho}
          aria-labelledby={idRotulo ? `${idRotulo} ${idValor}` : undefined}
          title={todosOsMarcados || undefined}
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
        // A altura cabe no espaco da tela (no celular o painel nao passa do fim); a lista rola por dentro.
        className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-72 flex-col p-0"
      >
        <div className="relative border-b p-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={buscaRef}
            autoFocus
            aria-label={`Buscar ${textos.singular}`}
            value={termo}
            placeholder={`Buscar ${textos.singular}`}
            onChange={(event) => setTermo(event.target.value)}
            onKeyDown={aoTeclarNaBusca}
            className="pl-8"
          />
        </div>

        <div
          ref={listaRef}
          role="group"
          aria-labelledby={idRotulo}
          onKeyDown={aoTeclarNaLista}
          className="flex max-h-64 min-h-0 flex-col overflow-y-auto p-1"
        >
          {visiveis.map((item) => {
            const marcado = valores.includes(item.id)
            const desabilitado = !marcado && noLimite
            return (
              <label
                key={item.id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-muted has-[:focus-visible]:bg-muted md:min-h-9',
                  desabilitado && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                )}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  disabled={desabilitado}
                  onChange={(event) => alternar(item.id, event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-input peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
                >
                  {marcado && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 break-words">{rotuloDoItem(item)}</span>
              </label>
            )
          })}
          {visiveis.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              Nenhuma {textos.singular} encontrada{termo.trim() ? ` para "${termo.trim()}"` : ''}.
            </p>
          )}
        </div>

        <div className="space-y-1 border-t p-1">
          <p className="px-2 pt-1 text-xs text-muted-foreground">
            {`Cada ${textos.singular} inclui as ${textos.subPlural}.`}
            {noLimite && ` Até ${maximo} ${textos.plural}.`}
          </p>
          <button
            type="button"
            disabled={valores.length === 0}
            onClick={() => {
              onChange([])
              // O "Limpar" fica desabilitado com a lista vazia: o foco vai para a busca, sem cair no body.
              buscaRef.current?.focus()
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
