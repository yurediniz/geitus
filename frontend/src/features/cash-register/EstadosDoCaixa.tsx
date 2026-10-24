import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Esqueleto de carregamento com rotulo para leitor de tela. */
export function CarregandoCaixa({ rotulo, linhas = 3 }: { rotulo: string; linhas?: number }) {
  return (
    <div role="status" aria-label={rotulo} className="space-y-3">
      <span className="sr-only">{`${rotulo}...`}</span>
      {Array.from({ length: linhas }, (_, indice) => (
        <div key={indice} aria-hidden="true" className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}

/** Falha ao carregar, com "Tentar de novo" (e acoes extras, como "Voltar"). */
export function ErroAoCarregar({
  mensagem,
  aoTentarDeNovo,
  children,
}: {
  mensagem: string
  aoTentarDeNovo: () => void
  children?: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div
        role="alert"
        className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{mensagem}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 md:h-9" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Button>
        {children}
      </div>
    </div>
  )
}
