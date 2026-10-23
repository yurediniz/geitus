import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Loader2, Pencil, RotateCcw, SlidersHorizontal, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { rotaDoProduto, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { cn } from '@/lib/utils'
import type { Produto } from '@/types/produto'

export interface AcoesDoProdutoProps {
  produto: Produto
  somenteLeitura: boolean
  estadoParaProduto: EstadoParaProduto
  alterandoStatus: boolean
  aoAlterarStatus: () => void
  /** Abre o modal "Ajustar estoque"; recebe o botao de origem para devolver o foco ao fechar. */
  aoAjustarEstoque: (origem: HTMLElement) => void
  /**
   * Na tabela: botoes menores e, abaixo de telas largas, so o icone (o texto
   * continua no nome acessivel). Nos cards: texto sempre visivel e alvo de toque maior.
   */
  compacto?: boolean
}

/**
 * Acoes de um produto da lista, iguais na tabela e nos cards: Editar (ou Ver
 * detalhes no modo leitura), Ajustar estoque (ADMIN, com controle de estoque) e
 * Inativar/Reativar (ADMIN). O nome do produto entra no nome acessivel de cada acao.
 */
export function AcoesDoProduto({
  produto,
  somenteLeitura,
  estadoParaProduto,
  alterandoStatus,
  aoAlterarStatus,
  aoAjustarEstoque,
  compacto = false,
}: AcoesDoProdutoProps) {
  const tamanho = compacto ? 'h-9 min-w-9 px-2' : 'h-11 px-3'
  const texto = compacto ? 'sr-only xl:not-sr-only' : undefined

  return (
    <div className={cn('flex flex-wrap gap-2', compacto && 'justify-end')}>
      <Button asChild variant="outline" className={tamanho} title={compacto ? (somenteLeitura ? 'Ver detalhes' : 'Editar') : undefined}>
        <Link to={rotaDoProduto(produto.id)} state={estadoParaProduto}>
          {somenteLeitura ? <Eye className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
          <span className={texto}>{somenteLeitura ? 'Ver detalhes' : 'Editar'}</span>{' '}
          <span className="sr-only">{produto.nome}</span>
        </Link>
      </Button>
      {!somenteLeitura && produto.controlaEstoque && (
        <Button
          type="button"
          variant="outline"
          className={tamanho}
          title={compacto ? 'Ajustar estoque' : undefined}
          onClick={(event: MouseEvent<HTMLButtonElement>) => aoAjustarEstoque(event.currentTarget)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className={texto}>Ajustar estoque</span>{' '}
          <span className="sr-only">{produto.nome}</span>
        </Button>
      )}
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          className={tamanho}
          title={compacto ? (produto.ativo ? 'Inativar' : 'Reativar') : undefined}
          onClick={aoAlterarStatus}
          disabled={alterandoStatus}
        >
          {alterandoStatus ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : produto.ativo ? (
            <XCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          )}
          <span className={texto}>{produto.ativo ? 'Inativar' : 'Reativar'}</span>{' '}
          <span className="sr-only">{produto.nome}</span>
        </Button>
      )}
    </div>
  )
}
