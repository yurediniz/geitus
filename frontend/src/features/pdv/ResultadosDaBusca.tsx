import { useEffect } from 'react'

import { CLASSE_DO_CARTAO, ConteudoDoCartao } from '@/features/pdv/CartaoDoProduto'
import { cn } from '@/lib/utils'
import type { ProdutoEncontrado } from '@/types/pdv'

export interface ResultadosDaBuscaProps {
  idLista: string
  produtos: readonly ProdutoEncontrado[]
  indiceAtivo: number
  idDaOpcao: (indice: number) => string
  /** Cards do termo anterior, enquanto os do termo atual nao chegam: esmaecidos e sem clique. */
  desatualizados: boolean
  aoEscolher: (produto: ProdutoEncontrado) => void
  aoApontar: (indice: number) => void
}

/**
 * Os produtos encontrados enquanto se digita (spec do PDV §3.1): cards com a
 * miniatura, o preco vigente e o saldo. O card ativo e o que o Enter lanca.
 */
export function ResultadosDaBusca({
  idLista,
  produtos,
  indiceAtivo,
  idDaOpcao,
  desatualizados,
  aoEscolher,
  aoApontar,
}: ResultadosDaBuscaProps) {
  // O card ativo fica sempre inteiro na tela (setas descendo a grade).
  useEffect(() => {
    document.getElementById(idDaOpcao(indiceAtivo))?.scrollIntoView?.({ block: 'nearest' })
  }, [idDaOpcao, indiceAtivo])

  return (
    <ul
      id={idLista}
      role="listbox"
      aria-label="Produtos encontrados"
      aria-busy={desatualizados}
      className={cn(
        'grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3 transition-opacity',
        desatualizados && 'pointer-events-none opacity-50',
      )}
    >
      {produtos.map((produto, indice) => (
        <li
          key={produto.id}
          id={idDaOpcao(indice)}
          role="option"
          aria-selected={indice === indiceAtivo}
          onMouseEnter={() => aoApontar(indice)}
          // O foco fica no campo: o clique nao o tira de la.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => !desatualizados && aoEscolher(produto)}
          className={cn(
            CLASSE_DO_CARTAO,
            indice === indiceAtivo
              ? 'border-primary shadow-md ring-2 ring-primary/40'
              : 'hover:border-primary/50 hover:shadow-sm',
          )}
        >
          <ConteudoDoCartao produto={produto} />
        </li>
      ))}
    </ul>
  )
}
