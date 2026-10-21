import { describe, it, expect } from 'vitest'

import { casaTermo, filtrarPorTermo, idsDescendentes, montarArvore, produtosPorSubarvore } from '@/lib/arvoreCategorias'
import type { Categoria } from '@/types/catalogo'

function categoria(
  id: string,
  nome: string,
  parentId: string | null,
  caminho: string,
  nivel = 0,
): Categoria {
  return {
    id,
    nome,
    parentId,
    caminho,
    nivel,
    ativo: true,
    selecionavel: true,
    quantidadeSubcategorias: 0,
    quantidadeProdutos: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
  }
}

// Ordem propositalmente fora de ordem alfabetica para testar a ordenacao.
const categorias: Categoria[] = [
  categoria('racao', 'Ração', null, 'Ração'),
  categoria('umida', 'Úmida', 'racao', 'Ração › Úmida', 1),
  categoria('seca', 'Seca', 'racao', 'Ração › Seca', 1),
  categoria('sache', 'Sachê', 'umida', 'Ração › Úmida › Sachê', 2),
  categoria('bebidas', 'Bebidas', null, 'Bebidas'),
]

describe('montarArvore', () => {
  it('monta tres niveis com raizes e filhos ordenados por nome', () => {
    const arvore = montarArvore(categorias)

    expect(arvore.map((no) => no.categoria.nome)).toEqual(['Bebidas', 'Ração'])
    const racao = arvore[1]
    expect(racao?.filhos.map((no) => no.categoria.nome)).toEqual(['Seca', 'Úmida'])
    const umida = racao?.filhos[1]
    expect(umida?.filhos.map((no) => no.categoria.nome)).toEqual(['Sachê'])
    expect(umida?.filhos[0]?.filhos).toEqual([])
  })

  it('trata categoria orfa (pai fora da lista) como raiz', () => {
    const orfa = categoria('orfa', 'Avulsa', 'inexistente', 'Algo › Avulsa', 1)

    const arvore = montarArvore([...categorias, orfa])

    expect(arvore.map((no) => no.categoria.nome)).toEqual(['Avulsa', 'Bebidas', 'Ração'])
  })

  it('retorna lista vazia sem categorias', () => {
    expect(montarArvore([])).toEqual([])
  })
})

describe('idsDescendentes', () => {
  it('raiz inclui ela mesma e todos os descendentes', () => {
    expect(idsDescendentes(categorias, 'racao')).toEqual(new Set(['racao', 'umida', 'seca', 'sache']))
  })

  it('no do meio inclui ele mesmo e os filhos', () => {
    expect(idsDescendentes(categorias, 'umida')).toEqual(new Set(['umida', 'sache']))
  })

  it('folha inclui so ela mesma', () => {
    expect(idsDescendentes(categorias, 'sache')).toEqual(new Set(['sache']))
  })
})

describe('filtrarPorTermo', () => {
  it('encontra pelo caminho sem diferenciar maiusculas nem acentos', () => {
    const resultado = filtrarPorTermo(categorias, 'umida')

    expect(resultado.map((c) => c.caminho)).toEqual(['Ração › Úmida', 'Ração › Úmida › Sachê'])
  })

  it('casa termo com acento e maiusculas contra texto sem eles', () => {
    expect(filtrarPorTermo(categorias, 'RAÇÃO').map((c) => c.id)).toEqual([
      'racao',
      'umida',
      'seca',
      'sache',
    ])
  })

  it('termo vazio ou so espacos devolve a lista inteira', () => {
    expect(filtrarPorTermo(categorias, '   ')).toEqual(categorias)
  })

  it('sem correspondencia devolve lista vazia', () => {
    expect(filtrarPorTermo(categorias, 'brinquedo')).toEqual([])
  })

  it('exige todas as palavras do termo no caminho, em qualquer ordem', () => {
    expect(filtrarPorTermo(categorias, 'racao umida').map((c) => c.id)).toEqual(['umida', 'sache'])
    expect(filtrarPorTermo(categorias, '  umida   SACHE ').map((c) => c.id)).toEqual(['sache'])
    expect(filtrarPorTermo(categorias, 'sache racao').map((c) => c.id)).toEqual(['sache'])
    expect(filtrarPorTermo(categorias, 'racao bebidas')).toEqual([])
  })
})

describe('casaTermo', () => {
  it('casa palavras soltas sem acentos e termo vazio casa sempre', () => {
    expect(casaTermo('Ração › Úmida › Sachê', 'umida sache')).toBe(true)
    expect(casaTermo('Ração › Úmida', 'umida sache')).toBe(false)
    expect(casaTermo('Qualquer', '   ')).toBe(true)
  })
})

describe('produtosPorSubarvore', () => {
  it('soma os produtos do no com os de todos os descendentes', () => {
    const comProdutos = categorias.map((c) => ({
      ...c,
      quantidadeProdutos: ({ racao: 4, sache: 7, seca: 1 } as Record<string, number>)[c.id] ?? 0,
    }))

    const totais = produtosPorSubarvore(montarArvore(comProdutos))

    expect(totais.get('racao')).toBe(12)
    expect(totais.get('umida')).toBe(7)
    expect(totais.get('sache')).toBe(7)
    expect(totais.get('seca')).toBe(1)
    expect(totais.get('bebidas')).toBe(0)
  })
})
