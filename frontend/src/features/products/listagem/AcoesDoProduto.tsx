import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackagePlus, Pencil, RotateCcw, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MenuAcoes, type ItemMenuAcoes } from '@/features/catalog/MenuAcoes'
import { rotaDoProduto, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import type { Produto } from '@/types/produto'

export interface AcoesDoProdutoProps {
  produto: Produto
  somenteLeitura: boolean
  estadoParaProduto: EstadoParaProduto
  alterandoStatus: boolean
  aoAlterarStatus: () => void
  /** Abre o modal "Ajustar estoque"; recebe o botao de origem para devolver o foco ao fechar. */
  aoAjustarEstoque: (origem: HTMLElement) => void
}

/**
 * Acoes de um produto da lista, iguais na tabela e nos cards (padrao do
 * MenuAcoes do catalogo): so "Estoque" fica visivel (ADMIN, com controle de
 * estoque); Editar e Inativar/Reativar ficam no menu "⋯". O nome do produto,
 * que e link, abre o produto para todos os perfis.
 */
export function AcoesDoProduto({
  produto,
  somenteLeitura,
  estadoParaProduto,
  alterandoStatus,
  aoAlterarStatus,
  aoAjustarEstoque,
}: AcoesDoProdutoProps) {
  const navigate = useNavigate()
  if (somenteLeitura) {
    return null
  }

  const itens: ItemMenuAcoes[] = [
    {
      id: 'editar',
      rotulo: 'Editar',
      icone: Pencil,
      levaFoco: true,
      onSelecionar: () => navigate(rotaDoProduto(produto.id), { state: estadoParaProduto }),
    },
    produto.ativo
      ? { id: 'inativar', rotulo: 'Inativar', icone: XCircle, destrutivo: true, onSelecionar: aoAlterarStatus }
      : { id: 'reativar', rotulo: 'Reativar', icone: RotateCcw, onSelecionar: aoAlterarStatus },
  ]

  return (
    <div className="flex items-center justify-end gap-1">
      {produto.controlaEstoque && (
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 md:h-9"
          aria-label={`Ajustar estoque de ${produto.nome}`}
          onClick={(event: MouseEvent<HTMLButtonElement>) => aoAjustarEstoque(event.currentTarget)}
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          Estoque
        </Button>
      )}
      <MenuAcoes
        rotulo={`Mais ações para ${produto.nome}`}
        itens={itens}
        ocupado={alterandoStatus}
        className="h-11 md:h-9"
      />
    </div>
  )
}
