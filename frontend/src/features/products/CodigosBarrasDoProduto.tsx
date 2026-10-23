import { useMemo } from 'react'
import { useController, useFormContext } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'

import { ETIQUETA_BALANCA_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { CampoCodigosBarras } from '@/features/products/CampoCodigosBarras'
import { formatosDoProduto, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import { buscarConfiguracaoEtiqueta } from '@/services/etiquetaBalancaService'
import type { ConfiguracaoEtiquetaResponse } from '@/types/etiquetaBalanca'
import type { Produto } from '@/types/produto'

/** A etiqueta muda pouco: a configuracao fica em cache por 5 minutos. */
const TEMPO_CONFIGURACAO_ETIQUETA = 5 * 60 * 1000

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
  const etiquetaQuery = useQuery<ConfiguracaoEtiquetaResponse>({
    queryKey: ETIQUETA_BALANCA_QUERY_KEY,
    queryFn: () => buscarConfiguracaoEtiqueta(),
    staleTime: TEMPO_CONFIGURACAO_ETIQUETA,
  })

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
      configuracaoEtiqueta={etiquetaQuery.data ?? null}
      desabilitado={desabilitado}
      erro={estadoLista.error?.message}
    />
  )
}
