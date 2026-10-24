import type { MouseEvent, ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { ROTULO_SECAO, type SecaoProduto } from '@/features/products/produtoFormulario'
import { idDaSecao, idDoTituloDaSecao } from '@/features/products/secoes/rolagem'
import { cn } from '@/lib/utils'

export interface AtalhosDasSecoesProps {
  secoes: readonly SecaoProduto[]
  ativa: SecaoProduto
  /** Quantos campos com erro cada secao tem (o numero aparece no atalho). */
  errosDaSecao: (secao: SecaoProduto) => number
  /** Clique no atalho: a pagina rola ate a secao e foca o titulo. */
  aoEscolher: (secao: SecaoProduto) => void
}

/**
 * Barra de atalhos da tela unica do produto (spec B2 §4), dentro do contêiner
 * fixo no topo da pagina: leva a cada secao, destaca a visivel (`aria-current`)
 * e mostra os erros de cada uma (numero + texto para leitor de tela, nunca so
 * a cor). No celular, rola para o lado.
 */
export function AtalhosDasSecoes({ secoes, ativa, errosDaSecao, aoEscolher }: AtalhosDasSecoesProps) {
  return (
    <nav aria-label="Seções do produto" className="border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {secoes.map((secao) => {
          const erros = errosDaSecao(secao)
          const atual = secao === ativa
          return (
            <li key={secao} className="shrink-0">
              <a
                href={`#${idDaSecao(secao)}`}
                aria-current={atual ? 'true' : undefined}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  event.preventDefault()
                  aoEscolher(secao)
                }}
                className={cn(
                  'flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  atual
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {ROTULO_SECAO[secao]}
                {erros > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs leading-5 font-semibold text-destructive-foreground tabular-nums"
                    >
                      {erros}
                    </span>{' '}
                    <span className="sr-only">{erros === 1 ? '(1 erro)' : `(${erros} erros)`}</span>
                  </>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

interface SecaoDaPaginaProps {
  secao: SecaoProduto
  /** Informacao na linha do titulo, alinhada a direita (ex.: o Nº do produto). */
  acessorio?: ReactNode
  children: ReactNode
}

/**
 * Uma secao da tela unica: cartao com o titulo (h2, focavel pelo atalho) e o
 * conteudo. O `scroll-mt` (maior que a barra fixa com um aviso) deixa o titulo
 * abaixo dela ao rolar ate a secao.
 */
export function SecaoDaPagina({ secao, acessorio, children }: SecaoDaPaginaProps) {
  return (
    <section id={idDaSecao(secao)} aria-labelledby={idDoTituloDaSecao(secao)} className="scroll-mt-32">
      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2
              id={idDoTituloDaSecao(secao)}
              tabIndex={-1}
              className="font-brand text-lg font-semibold tracking-tight outline-none"
            >
              {ROTULO_SECAO[secao]}
            </h2>
            {acessorio}
          </div>
          {children}
        </CardContent>
      </Card>
    </section>
  )
}
