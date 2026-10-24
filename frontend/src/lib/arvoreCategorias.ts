import type { ItemDaArvore } from '@/types/catalogo'

/**
 * Utilitarios puros para tratar a lista plana de um cadastro em arvore da API
 * (categorias, marcas) como arvore: montagem, descendentes e busca pelo caminho.
 */

export interface NoDaArvore<T extends ItemDaArvore = ItemDaArvore> {
  item: T
  filhos: NoDaArvore<T>[]
}

function compararPorNome<T extends ItemDaArvore>(a: NoDaArvore<T>, b: NoDaArvore<T>): number {
  return a.item.nome.localeCompare(b.item.nome, 'pt-BR')
}

function ordenarRecursivo<T extends ItemDaArvore>(nos: NoDaArvore<T>[]): void {
  nos.sort(compararPorNome)
  for (const no of nos) {
    ordenarRecursivo(no.filhos)
  }
}

/**
 * Monta a arvore a partir da lista plana. Raizes e filhos ficam ordenados por
 * nome. Um item cujo pai nao esta na lista (orfao) vira raiz, para nunca
 * sumir da tela.
 */
export function montarArvore<T extends ItemDaArvore>(itens: T[]): NoDaArvore<T>[] {
  const nos = new Map<string, NoDaArvore<T>>()
  for (const item of itens) {
    nos.set(item.id, { item, filhos: [] })
  }

  const raizes: NoDaArvore<T>[] = []
  for (const no of nos.values()) {
    const pai = no.item.parentId ? nos.get(no.item.parentId) : undefined
    if (pai && pai !== no) {
      pai.filhos.push(no)
    } else {
      raizes.push(no)
    }
  }

  ordenarRecursivo(raizes)
  return raizes
}

/** Ids do item informado e de todos os seus descendentes. */
export function idsDescendentes(itens: readonly ItemDaArvore[], id: string): Set<string> {
  const filhosPorPai = new Map<string, string[]>()
  for (const item of itens) {
    if (item.parentId) {
      const irmaos = filhosPorPai.get(item.parentId) ?? []
      irmaos.push(item.id)
      filhosPorPai.set(item.parentId, irmaos)
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

/** Palavras do termo, ja normalizadas (sem acentos/maiusculas). */
function palavrasDoTermo(termo: string): string[] {
  return normalizarTexto(termo).split(/\s+/).filter(Boolean)
}

/**
 * Verdadeiro se todas as palavras do termo aparecem no texto, em qualquer
 * ordem e sem diferenciar maiusculas nem acentos: "racao umida" e
 * "umida sache" casam com "Ração › Úmida › Sachê". Termo vazio casa sempre.
 */
export function casaTermo(texto: string, termo: string): boolean {
  const alvo = normalizarTexto(texto)
  return palavrasDoTermo(termo).every((palavra) => alvo.includes(palavra))
}

/**
 * Filtra os itens cujo caminho contem todas as palavras do termo (ver
 * `casaTermo`). Termo vazio devolve a lista inteira.
 */
export function filtrarPorTermo<T extends ItemDaArvore>(itens: T[], termo: string): T[] {
  if (palavrasDoTermo(termo).length === 0) {
    return itens
  }
  return itens.filter((item) => casaTermo(item.caminho, termo))
}

/**
 * Total de produtos de cada no somado ao de todos os seus descendentes
 * (`quantidadeProdutos` da API conta so os vinculados diretamente).
 */
export function produtosPorSubarvore<T extends ItemDaArvore>(arvore: NoDaArvore<T>[]): Map<string, number> {
  const totais = new Map<string, number>()
  const somar = (no: NoDaArvore<T>): number => {
    const total = no.filhos.reduce((soma, filho) => soma + somar(filho), no.item.quantidadeProdutos)
    totais.set(no.item.id, total)
    return total
  }
  for (const raiz of arvore) {
    somar(raiz)
  }
  return totais
}
