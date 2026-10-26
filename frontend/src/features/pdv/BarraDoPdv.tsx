import type { ReactNode } from 'react'

export interface BarraDoPdvProps {
  /** O contexto ao lado da marca (caixa e operador, ou o titulo do pagamento). */
  children?: ReactNode
  /** Os botoes da direita (Em espera, Vendas do caixa, Menu, Voltar). */
  acoes?: ReactNode
}

/**
 * A barra superior do PDV (modo foco, sem a sidebar): a marca, o contexto da
 * venda e as acoes de apoio. Grafite, para separar a moldura da area de venda.
 */
export function BarraDoPdv({ children, acoes }: BarraDoPdvProps) {
  return (
    <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 bg-barra-pdv px-4 py-2 text-barra-pdv-foreground md:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
          G
        </span>
        <span className="font-brand text-lg font-semibold tracking-tight">Geitus</span>
        <span aria-hidden="true" className="h-6 w-px bg-barra-pdv-border" />
        <span className="font-brand text-lg font-medium text-barra-pdv-muted">PDV</span>
      </div>
      {children}
      {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  )
}

/** Um dado da barra: o rotulo pequeno em cima e o valor embaixo ("CAIXA / Caixa 1"). */
export function DadoDaBarra({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="text-[11px] font-semibold tracking-wide text-barra-pdv-muted uppercase">{rotulo}</p>
      <div className="truncate text-sm font-medium">{children}</div>
    </div>
  )
}
