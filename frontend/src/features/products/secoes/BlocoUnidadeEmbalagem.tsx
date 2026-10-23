import { useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
import type { UseQueryResult } from '@tanstack/react-query'

import { CampoSelect, CampoTexto, GrupoCampos } from '@/features/products/CamposFormulario'
import { opcoesDeUnidade, textoConversao, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import type { UnidadeMedida } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

export interface BlocoUnidadeEmbalagemProps {
  /** Produto em edicao (null no cadastro): mantem a unidade de compra atual mesmo inativa. */
  produto: Produto | null
  unidadesQuery: UseQueryResult<UnidadeMedida[]>
  /** Sigla por id de unidade (lista + unidades do produto), para "1 CX = 12 UN". */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Bloco "Unidade e embalagem" da secao Estoque: a unidade de compra e quantas
 * unidades de venda vem nela. O fator so aparece com uma unidade de compra.
 */
export function BlocoUnidadeEmbalagem({
  produto,
  unidadesQuery,
  siglaPorId,
  desabilitado,
  aoAlterarCampo,
}: BlocoUnidadeEmbalagemProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const unidades = useMemo(() => unidadesQuery.data ?? [], [unidadesQuery.data])
  const [unidadeIdAtual, unidadeCompraIdAtual, fatorAtual] = watch(['unidadeId', 'unidadeCompraId', 'fatorConversao'])

  // A unidade de venda nao e oferecida como compra: "Mesma da venda" ja cobre esse caso.
  const opcoesUnidadeCompra = useMemo(
    () => opcoesDeUnidade(unidades, produto?.unidadeCompra ?? null).filter((opcao) => opcao.id !== unidadeIdAtual),
    [unidades, produto, unidadeIdAtual],
  )
  const siglaVenda = siglaPorId.get(unidadeIdAtual)
  const siglaCompra = siglaPorId.get(unidadeCompraIdAtual)
  const temUnidadeCompra = unidadeCompraIdAtual !== ''
  const ajudaConversao = textoConversao(siglaCompra, siglaVenda, fatorAtual)

  /** Sem unidade de compra, o fator fica oculto e e descartado. */
  const aoAlterarUnidadeCompra = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setValue('fatorConversao', '', { shouldDirty: true })
    }
    aoAlterarCampo()
  }

  return (
    <GrupoCampos
      titulo="Unidade e embalagem"
      descricao="Preencha se você compra em outra unidade (ex.: caixa com 12 unidades)."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <CampoSelect
          id="unidadeCompraId"
          label="Unidade de compra (opcional)"
          erro={errors.unidadeCompraId?.message}
          selectProps={register('unidadeCompraId', { onChange: aoAlterarUnidadeCompra })}
          disabled={desabilitado || unidadesQuery.isPending}
          opcaoVazia="Mesma da venda"
          opcoes={opcoesUnidadeCompra}
        />
        {/* So faz sentido com unidade de compra: ate la fica oculto. */}
        {temUnidadeCompra && (
          <CampoTexto
            id="fatorConversao"
            label={`Quantas ${siglaVenda ?? 'unidades de venda'} vêm em 1 ${siglaCompra ?? 'unidade de compra'}?`}
            erro={errors.fatorConversao?.message}
            ajuda={ajudaConversao ?? undefined}
            inputProps={register('fatorConversao', { onChange: aoAlterarCampo })}
            disabled={desabilitado}
            type="number"
            step="0.0001"
            min="0"
            placeholder="Ex.: 12"
          />
        )}
      </div>
    </GrupoCampos>
  )
}
