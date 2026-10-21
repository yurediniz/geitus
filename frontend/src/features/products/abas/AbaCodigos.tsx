import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoTexto } from '@/features/products/CamposFormulario'
import { CodigosBarrasDoProduto } from '@/features/products/CodigosBarrasDoProduto'
import type { ProdutoFormValues } from '@/features/products/produtoFormulario'
import { sugerirSku } from '@/services/produtoService'
import type { Produto } from '@/types/produto'

export interface AbaCodigosProps {
  /** Produto em edicao (null no cadastro): seus codigos gravados nao sao rebloqueados. */
  produto: Produto | null
  desabilitado: boolean
  /** OPERADOR: sem "Gerar automaticamente" (a sugestao de SKU e so de ADMIN). */
  somenteLeitura: boolean
  aoAlterarCampo: () => void
}

/** Aba Codigos: SKU (com sugestao automatica) e a lista completa de codigos de barras (com reordenar). */
export function AbaCodigos({ produto, desabilitado, somenteLeitura, aoAlterarCampo }: AbaCodigosProps) {
  const {
    register,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const [anuncioSku, setAnuncioSku] = useState('')

  const gerarSkuMutation = useMutation<string>({
    mutationFn: () => sugerirSku(),
    onSuccess: (sku) => {
      setValue('sku', sku, { shouldDirty: true })
      clearErrors('sku')
      aoAlterarCampo()
      setAnuncioSku(`SKU ${sku} gerado. Você pode editá-lo antes de salvar.`)
    },
    onError: () => setAnuncioSku(''),
  })

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <CampoTexto
            id="sku"
            label="SKU (opcional)"
            erro={errors.sku?.message}
            ajuda="Código interno do produto, único na empresa."
            inputProps={register('sku', { onChange: aoAlterarCampo })}
            disabled={desabilitado}
            maxLength={50}
          />
          {!somenteLeitura && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => gerarSkuMutation.mutate()}
              disabled={desabilitado || gerarSkuMutation.isPending}
            >
              {gerarSkuMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              Gerar automaticamente
            </Button>
          )}
          <p role="status" aria-live="polite" className="sr-only">
            {anuncioSku}
          </p>
          {/* role="alert": a falha e anunciada (o foco continua no botao). */}
          {gerarSkuMutation.isError && (
            <p id="sku-gerar-erro" role="alert" className="text-sm text-destructive">
              Não foi possível gerar o SKU. Tente novamente.
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="codigosBarras-titulo" className="space-y-2">
        <h3 id="codigosBarras-titulo" className="text-sm font-medium">
          Códigos de barras
        </h3>
        <CodigosBarrasDoProduto
          variante="completa"
          produto={produto}
          desabilitado={desabilitado}
          aoAlterarCampo={aoAlterarCampo}
        />
      </section>
    </div>
  )
}
