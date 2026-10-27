import { CONFIGURACAO_MARCAS } from '@/features/catalog/cadastrosEmArvore'
import { PaginaDaArvore } from '@/features/catalog/PaginaDaArvore'

/** Tela de Fabricantes e marcas em arvore (/produtos/marcas), igual a de Categorias (spec de Fornecedores e marcas). */
export function MarcasPage() {
  return <PaginaDaArvore configuracao={CONFIGURACAO_MARCAS} />
}
