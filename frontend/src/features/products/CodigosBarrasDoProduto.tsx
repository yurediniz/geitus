import { useMemo } from 'react'
import { useController, useFormContext } from 'react-hook-form'

import { CampoCodigosBarras } from '@/features/products/CampoCodigosBarras'
import { formatosDoProduto, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import type { Produto } from '@/types/produto'

export interface CodigosBarrasDoProdutoProps {
  /** Produto em edicao (null no cadastro): seus codigos gravados nao sao rebloqueados. */
  produto: Produto | null
  desabilitado: boolean
  aoAlterarCampo: () => void
  variante: 'completa' | 'compacta'
}

/**
 * Liga o campo de codigos de barras ao formulario: a lista (`codigosBarras`)
 * e o texto ainda nao adicionado (`codigoPendente`) sao os mesmos na aba
 * Geral e na aba Codigos.
 */
export function CodigosBarrasDoProduto({ produto, desabilitado, aoAlterarCampo, variante }: CodigosBarrasDoProdutoProps) {
  const { control, setError, clearErrors } = useFormContext<ProdutoFormValues>()
  const { field: lista, fieldState: estadoLista } = useController({ control, name: 'codigosBarras' })
  const { field: pendente, fieldState: estadoPendente } = useController({ control, name: 'codigoPendente' })

  const formatosGravados = useMemo(() => formatosDoProduto(produto), [produto])

  return (
    <CampoCodigosBarras
      variante={variante}
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
      desabilitado={desabilitado}
      erro={estadoLista.error?.message}
    />
  )
}
