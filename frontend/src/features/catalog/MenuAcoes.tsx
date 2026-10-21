import { useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Loader2, MoreHorizontal, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ItemMenuAcoes {
  id: string
  rotulo: string
  icone: LucideIcon
  onSelecionar: () => void
  destrutivo?: boolean
  desabilitado?: boolean
  /**
   * A acao leva o foco para outro lugar (dialogo, formulario inline): o menu
   * nao devolve o foco ao botao "⋯" ao fechar.
   */
  levaFoco?: boolean
}

interface MenuAcoesProps {
  /** Nome acessivel do botao e do menu (ex.: "Mais ações para Ração"). */
  rotulo: string
  itens: ItemMenuAcoes[]
  /** So o item atual de uma lista com foco roving entra na ordem de Tab. */
  focavel?: boolean
  /** Acao em andamento: o botao mostra o carregamento e fica desabilitado. */
  ocupado?: boolean
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * Botao "⋯ Mais" que abre um menu de acoes (padrao ARIA menu button): o
 * primeiro item recebe o foco ao abrir, ↑/↓/Home/End percorrem os itens,
 * Enter escolhe, Esc ou Tab fecham e o foco volta ao botao.
 */
export function MenuAcoes({ rotulo, itens, focavel = true, ocupado = false, className, ref }: MenuAcoesProps) {
  const [aberto, setAberto] = useState(false)
  const conteudoRef = useRef<HTMLDivElement>(null)
  const escolhidoRef = useRef<ItemMenuAcoes | null>(null)

  const itensHabilitados = () =>
    Array.from(conteudoRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])

  const aoTeclar = (event: KeyboardEvent<HTMLDivElement>) => {
    const botoes = itensHabilitados()
    if (botoes.length === 0) {
      return
    }
    const atual = botoes.findIndex((botao) => botao === document.activeElement)
    let proximo: number
    switch (event.key) {
      case 'ArrowDown':
        proximo = (atual + 1) % botoes.length
        break
      case 'ArrowUp':
        proximo = atual <= 0 ? botoes.length - 1 : atual - 1
        break
      case 'Home':
        proximo = 0
        break
      case 'End':
        proximo = botoes.length - 1
        break
      case 'Tab':
        // Menu nao faz parte da ordem de Tab: fecha e o foco volta ao botao.
        event.preventDefault()
        setAberto(false)
        return
      default:
        return
    }
    event.preventDefault()
    botoes[proximo]?.focus()
  }

  const escolher = (item: ItemMenuAcoes) => {
    escolhidoRef.current = item
    setAberto(false)
    item.onSelecionar()
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild disabled={ocupado}>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="sm"
          tabIndex={focavel ? 0 : -1}
          aria-haspopup="menu"
          aria-label={rotulo}
          className={cn('h-9 gap-1 px-2 text-muted-foreground pointer-coarse:h-11', className)}
        >
          {ocupado ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          )}
          <span aria-hidden="true">Mais</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={conteudoRef}
        role="menu"
        aria-label={rotulo}
        align="end"
        className="w-56 p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          itensHabilitados()[0]?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (escolhidoRef.current?.levaFoco) {
            event.preventDefault()
          }
          escolhidoRef.current = null
        }}
        onKeyDown={aoTeclar}
      >
        {itens.map(({ id, rotulo: rotuloItem, icone: Icone, destrutivo, desabilitado, ...item }) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={desabilitado}
            onClick={() => escolher({ id, rotulo: rotuloItem, icone: Icone, destrutivo, desabilitado, ...item })}
            className={cn(
              'flex min-h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-sm outline-none pointer-coarse:min-h-11',
              'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
              'disabled:pointer-events-none disabled:opacity-50',
              destrutivo && 'text-destructive hover:text-destructive focus:text-destructive',
            )}
          >
            <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
            {rotuloItem}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
