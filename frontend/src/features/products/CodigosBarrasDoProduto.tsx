import { useMemo } from 'react'
import { useController, useFormContext } from 'react-hook-form'

import { useConfiguracaoEtiqueta } from '@/features/catalog/useConfiguracaoEtiqueta'
import { CampoCodigosBarras } from '@/features/products/CampoCodigosBarras'
import {
  formatosDoProduto,
  localizarCodigoForaDaLista,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import type { Produto } from '@/types/produto'

export interface CodigosBarrasDoProdutoProps {
  /** Produto em edicao (null no cadastro): seus codigos gravados nao sao rebloqueados. */
  produto: Produto | null
  desabilitado: boolean
  /** Sigla por id de unidade, para dizer em que embalagem um codigo repetido esta. */
  siglaPorId: ReadonlyMap<string, string>
  aoAlterarCampo: () => void
}

/**
 * Liga o campo de codigos de barras ao formulario: a lista (`codigosBarras`)
 * e o texto ainda nao adicionado (`codigoPendente`). Busca a etiqueta de
 * balanca da empresa para o aviso de codigo com o formato dela; se a busca
 * falhar, o campo funciona sem o aviso.
 */
export function CodigosBarrasDoProduto({ produto, desabilitado, siglaPorId, aoAlterarCampo }: CodigosBarrasDoProdutoProps) {
  const { control, getValues, setError, clearErrors } = useFormContext<ProdutoFormValues>()
  const { field: lista, fieldState: estadoLista } = useController({ control, name: 'codigosBarras' })
  const { field: pendente, fieldState: estadoPendente } = useController({ control, name: 'codigoPendente' })

  const formatosGravados = useMemo(() => formatosDoProduto(produto), [produto])
  const etiquetaQuery = useConfiguracaoEtiqueta()

  return (
    <CampoCodigosBarras
      valor={lista.value}
      onChange={(codigos) => {
        lista.onChange(codigos)
        aoAlterarCampo()
      }}
      entrada={pendente.value}
      onEntradaChange={(texto) => {
        pendente.onChange(texto)
        aoAlterarCampo()
      }}
      erroEntrada={estadoPendente.error?.message}
      onErroEntradaChange={(mensagem) =>
        mensagem ? setError('codigoPendente', { type: 'manual', message: mensagem }) : clearErrors('codigoPendente')
      }
      formatosGravados={formatosGravados}
      // Um codigo pertence a uma lista so: os das embalagens nao entram na da unidade (lidos ao adicionar).
      localizador={(codigo) => localizarCodigoForaDaLista(getValues(), 'unidade', siglaPorId)(codigo)}
      configuracaoEtiqueta={etiquetaQuery.data ?? null}
      desabilitado={desabilitado}
      erro={estadoLista.error?.message}
    />
  )
}
