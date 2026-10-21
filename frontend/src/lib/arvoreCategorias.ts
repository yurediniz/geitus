import type { Categoria } from '@/types/catalogo'

/**
 * Utilitarios puros para tratar a lista plana de categorias da API como
 * arvore: montagem, descendentes e busca pelo caminho.
 */

export interface NoCategoria {
  categoria: Categoria
  filhos: NoCategoria[]
}

function compararPorNome(a: NoCategoria, b: NoCategoria): number {
  return a.categoria.nome.localeCompare(b.categoria.nome, 'pt-BR')
}

function ordenarRecursivo(nos: NoCategoria[]): void {
  nos.sort(compararPorNome)
  for (const no of nos) {
    ordenarRecursivo(no.filhos)
  }
}

/**
 * Monta a arvore a partir da lista plana. Raizes e filhos ficam ordenados por
 * nome. Uma categoria cujo pai nao esta na lista (orfa) vira raiz, para nunca
 * sumir da tela.
 */
export function montarArvore(categorias: Categoria[]): NoCategoria[] {
  const nos = new Map<string, NoCategoria>()
  for (const categoria of categorias) {
    nos.set(categoria.id, { categoria, filhos: [] })
  }

  const raizes: NoCategoria[] = []
  for (const no of nos.values()) {
    const pai = no.categoria.parentId ? nos.get(no.categoria.parentId) : undefined
    if (pai && pai !== no) {
      pai.filhos.push(no)
    } else {
      raizes.push(no)
    }
  }

  ordenarRecursivo(raizes)
  return raizes
}

/** Ids da categoria informada e de todos os seus descendentes. */
export function idsDescendentes(categorias: Categoria[], id: string): Set<string> {
  const filhosPorPai = new Map<string, string[]>()
  for (const categoria of categorias) {
    if (categoria.parentId) {
      const irmaos = filhosPorPai.get(categoria.parentId) ?? []
      irmaos.push(categoria.id)
      filhosPorPai.set(categoria.parentId, irmaos)
    }
  }

  const resultado = new Set<string>([id])
  const pendentes: string[] = [id]
  let atual = pendentes.pop()
  while (atual !== undefined) {
    for (const filho of filhosPorPai.get(atual) ?? []) {
      if (!resultado.has(filho)) {
        resultado.add(filho)
        pendentes.push(filho)
      }
    }
    atual = pendentes.pop()
  }
  return resultado
}

/** Minusculas e sem acentos, para comparar textos digitados pelo usuario. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Filtra as categorias cujo caminho contem o termo, sem diferenciar
 * maiusculas nem acentos. Termo vazio devolve a lista inteira.
 */
export function filtrarPorTermo(categorias: Categoria[], termo: string): Categoria[] {
  const alvo = normalizarTexto(termo)
  if (!alvo) {
    return categorias
  }
  return categorias.filter((categoria) => normalizarTexto(categoria.caminho).includes(alvo))
}
