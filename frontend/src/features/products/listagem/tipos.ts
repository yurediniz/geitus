import type { EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import type { Produto } from '@/types/produto'

/** Props comuns da tabela e dos cards da lista de produtos. */
export interface ListaDeProdutosProps {
  produtos: Produto[]
  somenteLeitura: boolean
  estadoParaProduto: EstadoParaProduto
  /** Produto com a troca de status em andamento. */
  alterandoStatusId: string | null
  aoAlterarStatus: (produto: Produto) => void
  aoAjustarEstoque: (produto: Produto, origem: HTMLElement) => void
}
