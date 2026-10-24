import { CONFIGURACAO_CATEGORIAS, CONFIGURACAO_MARCAS } from '@/features/catalog/cadastrosEmArvore'
import { SeletorDaArvore, type SeletorDaArvoreProps } from '@/features/products/SeletorDaArvore'
import type { Categoria, Marca } from '@/types/catalogo'

export type SeletorCategoriaProps = Omit<SeletorDaArvoreProps<Categoria>, 'configuracao' | 'itens'> & {
  /** Lista plana da empresa (todas, inclusive inativas: o seletor oferece so as selecionaveis). */
  categorias: Categoria[]
}

/** Seletor de categoria (produto e filtro da lista): o `SeletorDaArvore` com as categorias. */
export function SeletorCategoria({ categorias, ...props }: SeletorCategoriaProps) {
  return <SeletorDaArvore configuracao={CONFIGURACAO_CATEGORIAS} itens={categorias} {...props} />
}

export type SeletorMarcaProps = Omit<SeletorDaArvoreProps<Marca>, 'configuracao' | 'itens'> & {
  /** Lista plana da empresa (todas, inclusive inativas: o seletor oferece so as selecionaveis). */
  marcas: Marca[]
}

/** Seletor de marca (produto e fornecedor, spec B5 §3.3): o `SeletorDaArvore` com as marcas. */
export function SeletorMarca({ marcas, ...props }: SeletorMarcaProps) {
  return <SeletorDaArvore configuracao={CONFIGURACAO_MARCAS} itens={marcas} {...props} />
}
