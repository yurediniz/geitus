import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import { chaveDaBuscaDeProdutos } from '@/features/pdv/pdvQuery'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { buscarProdutos } from '@/services/pdvService'
import type { ProdutoEncontrado } from '@/types/pdv'

export interface JanelaBuscaProps {
  /** O texto que abriu a busca (o nome digitado no campo), ou null com a janela fechada. */
  textoInicial: string | null
  aoFechar: () => void
  aoEscolher: (produto: ProdutoEncontrado) => void
}

/**
 * Busca por nome (F2, ou texto que nao e codigo; spec do PDV §3.1): so
 * produtos ativos, ate 20. Setas escolhem e Enter lanca o produto na unidade.
 */
export function JanelaBusca({ textoInicial, aoFechar, aoEscolher }: JanelaBuscaProps) {
  return (
    <Dialog open={textoInicial !== null} onOpenChange={(aberta) => !aberta && aoFechar()}>
      {textoInicial !== null && <ConteudoDaBusca textoInicial={textoInicial} aoEscolher={aoEscolher} />}
    </Dialog>
  )
}

function ConteudoDaBusca({ textoInicial, aoEscolher }: { textoInicial: string; aoEscolher: (produto: ProdutoEncontrado) => void }) {
  const [texto, setTexto] = useState(textoInicial)
  const [ativo, setAtivo] = useState(0)
  const atrasado = useBuscaComAtraso(texto.trim(), 200)
  const idLista = useId()
  const consulta = useQuery({
    queryKey: chaveDaBuscaDeProdutos(atrasado),
    queryFn: ({ signal }) => buscarProdutos(atrasado, signal),
    enabled: atrasado !== '',
  })
  const produtos = atrasado === '' ? [] : (consulta.data ?? [])
  // Enter so escolhe o resultado do termo digitado: com o termo ainda sem busca (ou buscando), nada acontece.
  const resultadosDoTermo = texto.trim() === atrasado && !consulta.isFetching
  const indiceAtivo = Math.min(ativo, Math.max(0, produtos.length - 1))
  const idDaOpcao = (indice: number) => `${idLista}-${indice}`

  return (
    <DialogContent onCloseAutoFocus={devolverFocoAoCampo} className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Buscar produto</DialogTitle>
        <DialogDescription>Só produtos ativos. Use as setas e Enter para lançar.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <label htmlFor={`${idLista}-campo`} className="text-sm font-medium">
          Nome do produto
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${idLista}-campo`}
            value={texto}
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-expanded={produtos.length > 0}
            aria-controls={idLista}
            aria-activedescendant={produtos.length > 0 ? idDaOpcao(indiceAtivo) : undefined}
            onChange={(event) => {
              setTexto(event.target.value)
              setAtivo(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                // Sem resultados ainda, fica no primeiro (nunca -1, que deixaria o Enter sem produto).
                setAtivo(Math.max(0, Math.min(indiceAtivo + 1, produtos.length - 1)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setAtivo(Math.max(indiceAtivo - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const escolhido = resultadosDoTermo ? produtos[indiceAtivo] : undefined
                if (escolhido) {
                  aoEscolher(escolhido)
                }
              }
            }}
            className="h-11 pl-9 text-base"
          />
        </div>
      </div>

      {atrasado === '' ? (
        <p className="text-sm text-muted-foreground">Digite o nome do produto.</p>
      ) : consulta.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Buscando…
        </p>
      ) : consulta.isError ? (
        <div className="space-y-2">
          <ErroInline mensagem="Não foi possível buscar os produtos." />
          <Button type="button" variant="outline" className="h-11" onClick={() => consulta.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum produto ativo com esse nome.</p>
      ) : (
        <ul id={idLista} role="listbox" aria-label="Produtos encontrados" className="max-h-80 divide-y overflow-y-auto">
          {produtos.map((produto, indice) => (
            <li
              key={produto.id}
              id={idDaOpcao(indice)}
              role="option"
              aria-selected={indice === indiceAtivo}
              onMouseEnter={() => setAtivo(indice)}
              onClick={() => aoEscolher(produto)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-4 rounded-md px-3 py-2.5',
                indice === indiceAtivo && 'bg-accent',
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{produto.nome}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {[
                    produto.codigo !== null && `Cód. ${produto.codigo}`,
                    produto.unidade,
                    produto.saldo !== null && `saldo ${formatarQuantidade(produto.saldo)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatarReais(produto.precoVigente)}</span>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  )
}
