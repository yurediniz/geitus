import { useFormContext } from 'react-hook-form'

import { ErroDoCampo } from '@/features/products/CamposFormulario'
import type { FornecedorFormValues } from '@/features/suppliers/fornecedorFormulario'
import { CampoComMascara, CampoDeTexto, SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import { mascararTelefone } from '@/lib/documentos'

interface SecaoContatoProps {
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Contato (spec B5 §8.3, secao 3): telefone, e-mail e observacoes, todos opcionais. */
export function SecaoContato({ desabilitado, aoAlterarCampo }: SecaoContatoProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  return (
    <SecaoDoFornecedor id="secao-contato" titulo="Contato">
      <div className="grid gap-4 md:grid-cols-2">
        <CampoComMascara
          nome="telefone"
          rotulo="Telefone (opcional)"
          placeholder="(00) 00000-0000"
          inputMode="tel"
          autoComplete="tel"
          mascara={mascararTelefone}
          erro={errors.telefone?.message}
          desabilitado={desabilitado}
          aoAlterar={aoAlterarCampo}
        />
        <CampoDeTexto
          nome="email"
          rotulo="E-mail (opcional)"
          type="email"
          maxLength={180}
          autoComplete="email"
          erro={errors.email?.message}
          desabilitado={desabilitado}
          aoAlterar={aoAlterarCampo}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="observacoes" className="text-sm font-medium">
          Observações (opcional)
        </label>
        <textarea
          id="observacoes"
          rows={3}
          maxLength={500}
          disabled={desabilitado}
          aria-invalid={errors.observacoes ? true : undefined}
          aria-describedby={errors.observacoes ? 'observacoes-erro' : undefined}
          placeholder="Condições de pagamento, dias de entrega, pedido mínimo..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
          {...register('observacoes', { onChange: aoAlterarCampo })}
        />
        <ErroDoCampo id="observacoes-erro" mensagem={errors.observacoes?.message} />
      </div>
    </SecaoDoFornecedor>
  )
}
