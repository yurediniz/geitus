import { useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface PaginacaoListaProps {
  /** Pagina atual, comecando em 1. */
  pagina: number
  /** Total de itens da consulta (todas as paginas). */
  total: number
  /** Itens por pagina. */
  tamanho: number
  /** Chamado com a pagina escolhida (1-based), sempre dentro de 1..ultima. */
  aoMudar: (pagina: number) => void
  className?: string
}

function numero(valor: number): string {
  return valor.toLocaleString('pt-BR')
}

/**
 * Rodape de uma lista paginada no servidor: "1–25 de 1.240", Anterior/Proxima,
 * "Pagina 2 de 50" e um campo para ir direto a uma pagina (limitado a
 * 1..ultima). Com uma pagina so, mostra apenas o total; sem itens, "Nenhum item".
 */
export function PaginacaoLista({ pagina: paginaPedida, total, tamanho, aoMudar, className }: PaginacaoListaProps) {
  const ultima = Math.max(1, Math.ceil(total / tamanho))
  // Pagina alem do fim (a tela ainda vai corrigir a URL): mostra a ultima, com texto coerente.
  const pagina = Math.min(Math.max(paginaPedida, 1), ultima)
  const inicio = (pagina - 1) * tamanho + 1
  const fim = Math.min(pagina * tamanho, total)

  // Texto do campo "Ir para a pagina": acompanha a pagina vinda de fora.
  const [texto, setTexto] = useState(String(pagina))
  const [paginaDoTexto, setPaginaDoTexto] = useState(pagina)
  if (pagina !== paginaDoTexto) {
    setPaginaDoTexto(pagina)
    setTexto(String(pagina))
  }

  const irPara = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const digitado = Number.parseInt(texto, 10)
    if (Number.isNaN(digitado)) {
      setTexto(String(pagina))
      return
    }
    const destino = Math.min(Math.max(digitado, 1), ultima)
    setTexto(String(destino))
    if (destino !== pagina) {
      aoMudar(destino)
    }
  }

  return (
    <nav
      aria-label="Paginação"
      className={cn('flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between', className)}
    >
      <p className="text-muted-foreground tabular-nums">
        {total === 0 ? 'Nenhum item' : `${numero(inicio)}–${numero(fim)} de ${numero(total)}`}
      </p>

      {ultima > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            disabled={pagina <= 1}
            onClick={() => aoMudar(pagina - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </Button>
          <span className="px-1 font-medium tabular-nums">{`Página ${numero(pagina)} de ${numero(ultima)}`}</span>
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            disabled={pagina >= ultima}
            onClick={() => aoMudar(pagina + 1)}
          >
            Próxima
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>

          <form onSubmit={irPara} className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={ultima}
              aria-label="Ir para a página"
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              className="h-11 w-20 tabular-nums md:h-9"
            />
            <Button type="submit" variant="ghost" className="h-11 md:h-9">
              Ir
            </Button>
          </form>
        </div>
      )}
    </nav>
  )
}
