import { useFormContext } from 'react-hook-form'

import { CampoTexto } from '@/features/products/CamposFormulario'
import { formatarPercentual } from '@/features/products/formatacaoProduto'
import { calcularMargemMarkup, type ProdutoFormValues } from '@/features/products/produtoFormulario'

export interface AbaPrecosProps {
  /** Sigla da unidade de venda escolhida (rotulo "Preço de venda (por UN)"). */
  siglaVenda: string | undefined
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Aba Precos: preco de venda, custo e preco minimo, com margem/markup derivados. */
export function AbaPrecos({ siglaVenda, desabilitado, aoAlterarCampo }: AbaPrecosProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const [precoVenda, custo] = watch(['precoVenda', 'custo'])
  const { margem, markup } = calcularMargemMarkup(precoVenda, custo)
  const margemTexto = formatarPercentual(margem)
  const markupTexto = formatarPercentual(markup)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <CampoTexto
          id="precoVenda"
          label={siglaVenda ? `Preço de venda (por ${siglaVenda})` : 'Preço de venda'}
          obrigatorio
          erro={errors.precoVenda?.message}
          inputProps={register('precoVenda', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
          type="number"
          step="0.01"
          min="0"
        />
        <CampoTexto
          id="custo"
          label="Custo (opcional)"
          erro={errors.custo?.message}
          inputProps={register('custo', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
          type="number"
          step="0.01"
          min="0"
        />
        <CampoTexto
          id="precoMinimo"
          label="Preço mínimo (opcional)"
          erro={errors.precoMinimo?.message}
          ajuda="Menor preço permitido na venda."
          inputProps={register('precoMinimo', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
          type="number"
          step="0.01"
          min="0"
        />
      </div>

      {/* Derivados: calculados a partir do preco e do custo, nunca digitados. */}
      <section aria-labelledby="derivados-titulo" className="rounded-md bg-muted/40 p-4">
        <h3 id="derivados-titulo" className="text-sm font-medium">
          Margem e markup
        </h3>
        {margemTexto || markupTexto ? (
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Margem</dt>
              <dd className="font-semibold tabular-nums">{margemTexto ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Markup</dt>
              <dd className="font-semibold tabular-nums">{markupTexto ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Informe o preço de venda e o custo para ver a margem.</p>
        )}
      </section>
    </div>
  )
}
