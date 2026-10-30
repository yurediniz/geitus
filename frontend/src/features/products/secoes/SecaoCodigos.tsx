import { useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Scale, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useConfiguracaoEtiqueta } from '@/features/catalog/useConfiguracaoEtiqueta'
import { CampoTexto } from '@/features/products/CamposFormulario'
import { CodigosBarrasDoProduto } from '@/features/products/CodigosBarrasDoProduto'
import {
  MENSAGEM_BALANCA_SEM_CODIGO,
  textoTamanhoNaEtiqueta,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { idDaSecao } from '@/features/products/secoes/rolagem'
import { useAuth } from '@/hooks/useAuth'
import { CODIGO_PRODUTO_MAXIMO } from '@/lib/codigoProduto'
import { sugerirSku } from '@/services/produtoService'
import type { Produto } from '@/types/produto'

export interface SecaoCodigosProps {
  /** Produto em edicao (null no cadastro): seus codigos gravados nao sao rebloqueados. */
  produto: Produto | null
  desabilitado: boolean
  /** OPERADOR: sem "Gerar automaticamente" (a sugestao de SKU e so de ADMIN). */
  somenteLeitura: boolean
  aoAlterarCampo: () => void
  /** Link da linha "ficam em Embalagens": rola ate a secao e foca o titulo. */
  aoIrParaEmbalagens: () => void
  /** Sigla por id de unidade, para dizer em que embalagem um codigo repetido esta. */
  siglaPorId: ReadonlyMap<string, string>
}

const AJUDA_CODIGO = 'O código que você digita no PDV e programa na balança. Até 6 dígitos; zeros à esquerda são ignorados.'

/** O atalho "Usar o número do produto" so faz sentido se o numero couber no codigo (e na etiqueta). */
function motivoNumeroNaoCabe(numero: number, digitosNaEtiqueta: number | null): string | null {
  if (numero > CODIGO_PRODUTO_MAXIMO) {
    return `O Nº ${numero} tem mais de 6 dígitos e não serve como código do produto.`
  }
  if (digitosNaEtiqueta !== null && String(numero).length > digitosNaEtiqueta) {
    return `O Nº ${numero} tem mais dígitos do que a etiqueta da balança comporta (${digitosNaEtiqueta}).`
  }
  return null
}

/**
 * Secao Codigos: a lista de codigos de barras (com reordenar) primeiro; depois
 * o codigo do produto (o da balanca e da digitacao no PDV) com "Vendido na
 * balança" e, por ultimo, o SKU (com sugestao automatica).
 */
export function SecaoCodigos({
  produto,
  desabilitado,
  somenteLeitura,
  aoAlterarCampo,
  aoIrParaEmbalagens,
  siglaPorId,
}: SecaoCodigosProps) {
  const {
    control,
    register,
    setValue,
    clearErrors,
    trigger,
    formState: { errors, isSubmitted },
  } = useFormContext<ProdutoFormValues>()
  const ehAdmin = useAuth().usuario?.perfil === 'ADMIN'
  const [anuncioSku, setAnuncioSku] = useState('')
  const [codigo, vendidoBalanca] = useWatch({ control, name: ['codigo', 'vendidoBalanca'] })
  // So se ha embalagem: digitar na quantidade ou no preco de uma embalagem nao renderiza esta secao.
  const temEmbalagem = useWatch({ control, name: 'embalagens', compute: (lista) => lista.length > 0 })
  const digitosNaEtiqueta = useConfiguracaoEtiqueta().data?.digitosCodigo ?? null
  // Atalho so na edicao: no cadastro o numero ainda nao existe (spec de Produtos).
  const pedeNumero = vendidoBalanca && codigo.trim() === '' && produto !== null && !somenteLeitura
  const numeroNaoCabe = pedeNumero ? motivoNumeroNaoCabe(produto.numero, digitosNaEtiqueta) : null
  const ajudaCodigo =
    vendidoBalanca && digitosNaEtiqueta !== null
      ? `${AJUDA_CODIGO} ${textoTamanhoNaEtiqueta(digitosNaEtiqueta)}`
      : AJUDA_CODIGO

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
      <section aria-labelledby="codigosBarras-titulo" className="space-y-2">
        <h3 id="codigosBarras-titulo" className="text-sm font-medium">
          Códigos de barras
        </h3>
        <CodigosBarrasDoProduto
          produto={produto}
          desabilitado={desabilitado}
          siglaPorId={siglaPorId}
          aoAlterarCampo={aoAlterarCampo}
        />
        {temEmbalagem && (
          <p className="text-sm text-muted-foreground">
            Os códigos de barras das embalagens ficam em{' '}
            <a
              href={`#${idDaSecao('embalagens')}`}
              onClick={(event) => {
                event.preventDefault()
                aoIrParaEmbalagens()
              }}
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
            >
              Embalagens
            </a>
            .
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <CampoTexto
          id="codigo"
          label={vendidoBalanca ? 'Código do produto' : 'Código do produto (opcional)'}
          obrigatorio={vendidoBalanca}
          erro={errors.codigo?.message}
          ajuda={ajudaCodigo}
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
                    if (valor && isSubmitted) {
                      // Depois de um envio com erro, a exigencia do codigo aparece na hora.
                      void trigger('codigo')
                    } else if (!valor && errors.codigo?.message === MENSAGEM_BALANCA_SEM_CODIGO) {
                      // Desligar tira a exigencia do codigo (o erro dela some junto).
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
            Ligue para produtos pesados na balança. O PDV lê o código e o valor da etiqueta.
          </p>
          {/* A etiqueta fica em Configurações, so do ADMIN. */}
          {ehAdmin && (
            <Link
              to="/configuracoes/balanca"
              className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4"
            >
              Configurar etiqueta
            </Link>
          )}
          {pedeNumero && numeroNaoCabe === null && (
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
          {numeroNaoCabe && <p className="text-xs text-muted-foreground">{numeroNaoCabe}</p>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <CampoTexto
            id="sku"
            label="SKU (opcional)"
            erro={errors.sku?.message}
            ajuda="Referência para seu controle (ex.: a do fornecedor). Não é usado na venda."
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
    </div>
  )
}
