import { useFormContext } from 'react-hook-form'

import { CampoTexto } from '@/features/products/CamposFormulario'
import type { ProdutoFormValues } from '@/features/products/produtoFormulario'

export interface AbaEstoqueProps {
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Aba Estoque: niveis de referencia (o saldo vem das movimentacoes, na Fase D). */
export function AbaEstoque({ desabilitado, aoAlterarCampo }: AbaEstoqueProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <CampoTexto
        id="estoqueMinimo"
        label="Estoque mínimo (opcional)"
        erro={errors.estoqueMinimo?.message}
        inputProps={register('estoqueMinimo', { onChange: aoAlterarCampo })}
        disabled={desabilitado}
        type="number"
        step="0.001"
        min="0"
      />
      <CampoTexto
        id="pontoReposicao"
        label="Ponto de reposição (opcional)"
        erro={errors.pontoReposicao?.message}
        inputProps={register('pontoReposicao', { onChange: aoAlterarCampo })}
        disabled={desabilitado}
        type="number"
        step="0.001"
        min="0"
      />
      <CampoTexto
        id="estoqueMaximo"
        label="Estoque máximo (opcional)"
        erro={errors.estoqueMaximo?.message}
        inputProps={register('estoqueMaximo', { onChange: aoAlterarCampo })}
        disabled={desabilitado}
        type="number"
        step="0.001"
        min="0"
      />
    </div>
  )
}
