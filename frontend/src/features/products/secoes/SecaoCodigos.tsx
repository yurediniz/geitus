import { useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Scale, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CampoTexto } from '@/features/products/CamposFormulario'
import { CodigosBarrasDoProduto } from '@/features/products/CodigosBarrasDoProduto'
import { MENSAGEM_BALANCA_SEM_CODIGO, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import { sugerirSku } from '@/services/produtoService'
import type { Produto } from '@/types/produto'

export interface SecaoCodigosProps {
  /** Produto em edicao (null no cadastro): seus codigos gravados nao sao rebloqueados. */
  produto: Produto | null
  desabilitado: boolean
  /** OPERADOR: sem "Gerar automaticamente" (a sugestao de SKU e so de ADMIN). */
  somenteLeitura: boolean
  aoAlterarCampo: () => void
}

/**
 * Secao Codigos: o codigo do produto (o da balanca e da digitacao rapida) com
 * "Vendido na balança", o SKU (com sugestao automatica) e a lista completa de
 * codigos de barras (com reordenar).
 */
export function SecaoCodigos({ produto, desabilitado, somenteLeitura, aoAlterarCampo }: SecaoCodigosProps) {
  const {
    control,
    register,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const [anuncioSku, setAnuncioSku] = useState('')
  const [codigo, vendidoBalanca] = watch(['codigo', 'vendidoBalanca'])
  // Atalho so na edicao: no cadastro o numero ainda nao existe (spec B2 §2).
  const oferecerNumero = vendidoBalanca && codigo.trim() === '' && produto !== null && !somenteLeitura

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

  const usarNumeroDoProduto = () => {
    if (!produto) {
      return
    }
    setValue('codigo', String(produto.numero), { shouldDirty: true })
    clearErrors('codigo')
    aoAlterarCampo()
    // O botao sai da tela: o foco vai para o codigo preenchido.
    document.getElementById('codigo')?.focus()
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <CampoTexto
          id="codigo"
          label={vendidoBalanca ? 'Código do produto' : 'Código do produto (opcional)'}
          obrigatorio={vendidoBalanca}
          erro={errors.codigo?.message}
          ajuda="De 1 a 6 dígitos, único na empresa. Zeros à esquerda são ignorados."
          inputProps={register('codigo', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
          inputMode="numeric"
          placeholder="Ex.: 542"
        />
        <div className="space-y-2 md:pt-7">
          <div className="flex min-h-11 items-center gap-3">
            <Controller
              control={control}
              name="vendidoBalanca"
              render={({ field }) => (
                <Switch
                  id="vendidoBalanca"
                  aria-labelledby="vendidoBalanca-rotulo"
                  aria-describedby="vendidoBalanca-ajuda"
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={(valor) => {
                    field.onChange(valor)
                    // Desligar tira a exigencia do codigo (o erro dela some junto).
                    if (!valor && errors.codigo?.message === MENSAGEM_BALANCA_SEM_CODIGO) {
                      clearErrors('codigo')
                    }
                    aoAlterarCampo()
                  }}
                  onBlur={field.onBlur}
                  disabled={desabilitado}
                />
              )}
            />
            <label
              id="vendidoBalanca-rotulo"
              htmlFor="vendidoBalanca"
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium"
            >
              <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Vendido na balança
            </label>
          </div>
          <p id="vendidoBalanca-ajuda" className="text-xs text-muted-foreground">
            A etiqueta da balança traz o código do produto e o valor (ou o peso).
          </p>
          {oferecerNumero && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={usarNumeroDoProduto}
              disabled={desabilitado}
            >
              {`Usar o número do produto (${produto.numero})`}
            </Button>
          )}
        </div>
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
          produto={produto}
          desabilitado={desabilitado}
          aoAlterarCampo={aoAlterarCampo}
        />
      </section>
    </div>
  )
}
