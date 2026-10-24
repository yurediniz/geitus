import { CONFIGURACAO_CATEGORIAS } from '@/features/catalog/cadastrosEmArvore'
import { PaginaDaArvore } from '@/features/catalog/PaginaDaArvore'

/** Tela de Categorias em arvore (/produtos/categorias). */
export function CategoriasPage() {
  return <PaginaDaArvore configuracao={CONFIGURACAO_CATEGORIAS} />
}
