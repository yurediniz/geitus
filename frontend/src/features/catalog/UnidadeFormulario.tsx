import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import type { UnidadeMedida, UnidadeMedidaRequest } from '@/types/catalogo'

// Espelha as regras do backend (spec §3.3); o backend continua validando.
const unidadeSchema = z.object({
  sigla: z.string().trim()
    .min(1, 'Informe a sigla.')
    .max(20, 'Sigla deve ter no máximo 20 caracteres.'),
  descricao: z.string().trim()
    .min(1, 'Informe a descrição.')
    .max(60, 'Descrição deve ter no máximo 60 caracteres.'),
  fracionada: z.boolean(),
})

type UnidadeFormValues = z.infer<typeof unidadeSchema>

export type UnidadeCampoFormulario = keyof UnidadeFormValues

interface UnidadeFormularioProps {
  unidade: UnidadeMedida | null
  salvando: boolean
  erro: string | null
  erroCampos?: Partial<Record<UnidadeCampoFormulario, string>>
  onSalvar: (dados: UnidadeMedidaRequest) => void
  onCancelar: () => void
}

/** Formulario inline de cadastro/edicao de unidade de medida. */
export function UnidadeFormulario({
  unidade,
  salvando,
  erro,
  erroCampos,
  onSalvar,
  onCancelar,
}: UnidadeFormularioProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UnidadeFormValues>({
    resolver: zodResolver(unidadeSchema),
    defaultValues: {
      sigla: unidade?.sigla ?? '',
      descricao: unidade?.descricao ?? '',
      fracionada: unidade?.fracionada ?? false,
    },
  })

  useEffect(() => {
    for (const [campo, mensagem] of Object.entries(erroCampos ?? {})) {
      if (mensagem) {
        setError(campo as UnidadeCampoFormulario, { type: 'server', message: mensagem })
      }
    }
  }, [erroCampos, setError])

  return (
    <form onSubmit={handleSubmit(onSalvar)} noValidate className="space-y-4">
      {erro && <ErroInline mensagem={erro} />}

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="unidade-sigla" className="text-sm font-medium">
            Sigla
          </label>
          <Input
            id="unidade-sigla"
            autoFocus
            maxLength={20}
            placeholder="Ex.: KG"
            disabled={salvando}
            aria-invalid={errors.sigla ? true : undefined}
            aria-describedby={errors.sigla ? 'unidade-sigla-erro' : 'unidade-sigla-ajuda'}
            {...register('sigla')}
          />
          {errors.sigla ? (
            <p id="unidade-sigla-erro" className="text-sm text-destructive">
              {errors.sigla.message}
            </p>
          ) : (
            <p id="unidade-sigla-ajuda" className="text-xs text-muted-foreground">
              Gravada em maiúsculas.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="unidade-descricao" className="text-sm font-medium">
            Descrição
          </label>
          <Input
            id="unidade-descricao"
            maxLength={60}
            placeholder="Ex.: Quilograma"
            disabled={salvando}
            aria-invalid={errors.descricao ? true : undefined}
            aria-describedby={errors.descricao ? 'unidade-descricao-erro' : undefined}
            {...register('descricao')}
          />
          {errors.descricao && (
            <p id="unidade-descricao-erro" className="text-sm text-destructive">
              {errors.descricao.message}
            </p>
          )}
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          disabled={salvando}
          {...register('fracionada')}
        />
        Aceita quantidade fracionada (ex.: kg, litro)
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvando}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar unidade
        </Button>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
