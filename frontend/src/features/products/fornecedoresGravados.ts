import { useEffect, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { fornecedoresDoProduto, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import type { FornecedorDoProduto, Produto } from '@/types/produto'

type ListaDeFornecedores = ProdutoFormValues['fornecedores']

/** Os fornecedores do produto como gravados (lista e o da ultima compra). */
export interface FornecedoresGravados {
  lista: ListaDeFornecedores
  ultimaCompraId: string | null
}

/**
 * O fornecedor que o modal de ajuste traz na entrada por compra (spec B5 §6):
 * o da ultima compra, se ainda estiver ativo (o inativo nao e oferecido).
 */
export function fornecedorParaACompra(produto: Produto): FornecedorDoProduto | null {
  const ultima = produto.fornecedorUltimaCompra
  if (!ultima) {
    return null
  }
  const daLista = produto.fornecedores.find((fornecedor) => fornecedor.id === ultima.id)
  return daLista && daLista.ativo ? daLista : null
}

export function fornecedoresGravadosDe(produto: Produto): FornecedoresGravados {
  return { lista: fornecedoresDoProduto(produto), ultimaCompraId: produto.fornecedorUltimaCompra?.id ?? null }
}

function mesmosGravados(a: FornecedoresGravados, b: FornecedoresGravados): boolean {
  return (
    a.ultimaCompraId === b.ultimaCompraId &&
    a.lista.length === b.lista.length &&
    a.lista.every((fornecedor, indice) => {
      const outro = b.lista[indice]
      return outro !== undefined && outro.id === fornecedor.id && outro.ativo === fornecedor.ativo && outro.nome === fornecedor.nome
    })
  )
}

/**
 * Aplica ao que esta na tela o que mudou no banco com a pagina aberta (uma
 * entrada por compra com fornecedor, pelo modal de estoque, liga o fornecedor e
 * o define como o da ultima compra; a tela do fornecedor pode desligar um).
 * Sem isto, salvar o produto depois mandaria a lista antiga e desfaria a compra.
 *
 * - Fornecedor ligado no banco entra na lista da tela; desligado no banco sai dela.
 * - O que o usuario mudou na tela fica (os demais itens sao os dele).
 * - O da ultima compra segue o banco quando ele mudou la (a compra e mais recente que a edicao
 *   na tela); senao fica o da tela. Se ele saiu da lista, fica vazio.
 */
export function mesclarFornecedores(
  anterior: FornecedoresGravados,
  gravado: FornecedoresGravados,
  naTela: FornecedoresGravados,
): FornecedoresGravados {
  const idsAnteriores = new Set(anterior.lista.map((fornecedor) => fornecedor.id))
  const idsGravados = new Set(gravado.lista.map((fornecedor) => fornecedor.id))
  const mantidos = naTela.lista
    .filter((fornecedor) => !(idsAnteriores.has(fornecedor.id) && !idsGravados.has(fornecedor.id)))
    // O nome e o status vem do banco quando ele os conhece.
    .map((fornecedor) => gravado.lista.find((outro) => outro.id === fornecedor.id) ?? fornecedor)
  const ligadosAgora = gravado.lista.filter(
    (fornecedor) => !idsAnteriores.has(fornecedor.id) && !mantidos.some((outro) => outro.id === fornecedor.id),
  )
  const lista = [...mantidos, ...ligadosAgora]
  const seguida = gravado.ultimaCompraId !== anterior.ultimaCompraId ? gravado.ultimaCompraId : naTela.ultimaCompraId
  const ultimaCompraId = seguida !== null && lista.some((fornecedor) => fornecedor.id === seguida) ? seguida : null
  return { lista, ultimaCompraId }
}

/**
 * Mantem os campos de fornecedores da pagina do produto em dia com o produto
 * gravado (recarregado depois de um ajuste de estoque). Intocados, os campos
 * passam a ser os gravados sem contar como alteracao; alterados, recebem a mescla.
 */
export function useFornecedoresGravados(produto: Produto | null, form: UseFormReturn<ProdutoFormValues>) {
  const { getFieldState, getValues, resetField, setValue } = form
  const sincronizadosRef = useRef<FornecedoresGravados | null>(produto ? fornecedoresGravadosDe(produto) : null)

  useEffect(() => {
    const anterior = sincronizadosRef.current
    if (!produto || !anterior) {
      return
    }
    const gravado = fornecedoresGravadosDe(produto)
    if (mesmosGravados(anterior, gravado)) {
      return
    }
    sincronizadosRef.current = gravado
    const intocados = !getFieldState('fornecedores').isDirty && !getFieldState('fornecedorUltimaCompraId').isDirty
    if (intocados) {
      resetField('fornecedores', { defaultValue: gravado.lista })
      resetField('fornecedorUltimaCompraId', { defaultValue: gravado.ultimaCompraId })
      return
    }
    const naTela = { lista: getValues('fornecedores'), ultimaCompraId: getValues('fornecedorUltimaCompraId') }
    const mesclado = mesclarFornecedores(anterior, gravado, naTela)
    setValue('fornecedores', mesclado.lista, { shouldDirty: true })
    setValue('fornecedorUltimaCompraId', mesclado.ultimaCompraId, { shouldDirty: true })
  }, [produto, getFieldState, getValues, resetField, setValue])
}
