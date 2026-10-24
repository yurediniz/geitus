import { useMemo } from 'react'
import { useController, useFormContext, useWatch } from 'react-hook-form'

import { useConfiguracaoEtiqueta } from '@/features/catalog/useConfiguracaoEtiqueta'
import { CampoCodigosBarras } from '@/features/products/CampoCodigosBarras'
import { formatosDoProduto, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import type { Produto } from '@/types/produto'

export interface CodigosBarrasDoProdutoProps {
  /** Produto em edicao (null no cadastro): seus codigos gravados nao sao rebloqueados. */
  produto: Produto | null
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Liga o campo de codigos de barras ao formulario: a lista (`codigosBarras`)
 * e o texto ainda nao adicionado (`codigoPendente`). Busca a etiqueta de
 * balanca da empresa para o aviso de codigo com o formato dela; se a busca
 * falhar, o campo funciona sem o aviso.
 */
export function CodigosBarrasDoProduto({ produto, desabilitado, aoAlterarCampo }: CodigosBarrasDoProdutoProps) {
  const { control, setError, clearErrors } = useFormContext<ProdutoFormValues>()
  const { field: lista, fieldState: estadoLista } = useController({ control, name: 'codigosBarras' })
  const { field: pendente, fieldState: estadoPendente } = useController({ control, name: 'codigoPendente' })

  const formatosGravados = useMemo(() => formatosDoProduto(produto), [produto])
  const etiquetaQuery = useConfiguracaoEtiqueta()
  // Um codigo pertence a uma lista so: os das embalagens nao entram na da unidade.
  const embalagens = useWatch({ control, name: 'embalagens' })
  const codigosDasEmbalagens = useMemo(() => embalagens.flatMap((embalagem) => embalagem.codigosBarras), [embalagens])

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
      outrasListas={codigosDasEmbalagens}
      configuracaoEtiqueta={etiquetaQuery.data ?? null}
      desabilitado={desabilitado}
      erro={estadoLista.error?.message}
    />
  )
}
