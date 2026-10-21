import { useFormContext } from 'react-hook-form'

import { CampoTexto, ErroDoCampo } from '@/features/products/CamposFormulario'
import type { ProdutoFormValues } from '@/features/products/produtoFormulario'

export interface AbaCodigosProps {
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Aba Codigos: SKU e codigos de barras.
 *
 * Esqueleto da Task 3: os codigos gravados sao exibidos e reenviados intactos
 * no salvar (o PATCH substitui a lista). A Task 4 troca a lista pelo
 * `CampoCodigosBarras` (adicionar/remover/reordenar) e poe o "Gerar
 * automaticamente" ao lado do SKU.
 */
export function AbaCodigos({ desabilitado, aoAlterarCampo }: AbaCodigosProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const codigos = watch('codigosBarras')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <CampoTexto
          id="sku"
          label="SKU (opcional)"
          erro={errors.sku?.message}
          ajuda="Código interno do produto, único na empresa."
          inputProps={register('sku', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
        />
        {/* Task 4: botao "Gerar automaticamente" (ADMIN). */}
      </div>

      <section aria-labelledby="codigosBarras-titulo" className="space-y-2">
        <h3 id="codigosBarras-titulo" className="text-sm font-medium">
          Códigos de barras
        </h3>
        {/* Task 4: CampoCodigosBarras (id "codigosBarras") substitui a lista abaixo. */}
        {codigos.length > 0 ? (
          <ul id="codigosBarras" tabIndex={-1} className="space-y-1 text-sm tabular-nums outline-none">
            {codigos.map((codigo) => (
              <li key={codigo} className="rounded-md bg-muted/40 px-3 py-2">
                {codigo}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum código de barras cadastrado.</p>
        )}
        <ErroDoCampo id="codigosBarras-erro" mensagem={errors.codigosBarras?.message} />
      </section>
    </div>
  )
}
