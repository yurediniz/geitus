import { useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  IE_ISENTO,
  mascararDocumento,
  rotuloDoDocumento,
  rotuloDoNome,
  type FornecedorFormValues,
} from '@/features/suppliers/fornecedorFormulario'
import { CampoComMascara, CampoDeTexto, SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import { cn } from '@/lib/utils'
import type { TipoPessoaFornecedor } from '@/types/fornecedor'

const OPCOES_DE_TIPO: { valor: TipoPessoaFornecedor; rotulo: string }[] = [
  { valor: 'PJ', rotulo: 'Pessoa jurídica' },
  { valor: 'PF', rotulo: 'Pessoa física' },
]

interface SecaoDadosProps {
  /** Nº do fornecedor na edicao; null no cadastro. */
  numero: number | null
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Dados do emitente (spec B5 §8.3, secao 1): tipo PJ/PF, CNPJ/CPF, razao
 * social/nome, nome fantasia e inscricao estadual (so no PJ, com "Isento").
 * Trocar o tipo limpa o documento (o CNPJ nao vira CPF) e a inscricao estadual.
 */
export function SecaoDados({ numero, desabilitado, aoAlterarCampo }: SecaoDadosProps) {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  const tipo = useWatch({ control, name: 'tipoPessoa' })
  const pj = tipo === 'PJ'

  const trocarTipo = (proximo: TipoPessoaFornecedor) => {
    if (proximo === tipo) {
      return
    }
    setValue('tipoPessoa', proximo, { shouldDirty: true })
    setValue('documento', '', { shouldDirty: true })
    setValue('inscricaoEstadual', '', { shouldDirty: true })
    clearErrors(['documento', 'inscricaoEstadual', 'razaoSocial'])
    aoAlterarCampo()
  }

  return (
    <SecaoDoFornecedor
      id="secao-dados"
      titulo="Dados"
      acessorio={
        numero !== null && (
          <p className="text-sm font-medium text-muted-foreground tabular-nums">
            <span className="sr-only">Número do fornecedor: </span>
            {`Nº ${numero}`}
          </p>
        )
      }
    >
      <fieldset className="space-y-2" disabled={desabilitado}>
        <legend className="text-sm font-medium">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {OPCOES_DE_TIPO.map((opcao) => {
            const marcado = opcao.valor === tipo
            return (
              <label
                key={opcao.valor}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm',
                  marcado ? 'border-primary bg-accent font-medium text-accent-foreground' : 'hover:bg-muted/60',
                )}
              >
                <input
                  type="radio"
                  name="tipoPessoa"
                  value={opcao.valor}
                  checked={marcado}
                  onChange={() => trocarTipo(opcao.valor)}
                  className="h-4 w-4 accent-primary"
                />
                {opcao.rotulo}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <CampoComMascara
          // A troca de tipo remonta o campo com a mascara certa.
          key={tipo}
          nome="documento"
          rotulo={`${rotuloDoDocumento(tipo)} (opcional)`}
          placeholder={pj ? '00.000.000/0000-00' : '000.000.000-00'}
          mascara={(valor) => mascararDocumento(tipo, valor)}
          erro={errors.documento?.message}
          desabilitado={desabilitado}
          aoAlterar={aoAlterarCampo}
        />
        <CampoDeTexto
          nome="razaoSocial"
          rotulo={rotuloDoNome(tipo)}
          obrigatorio
          maxLength={180}
          erro={errors.razaoSocial?.message}
          desabilitado={desabilitado}
          aoAlterar={aoAlterarCampo}
        />
        <CampoDeTexto
          nome="nomeFantasia"
          rotulo="Nome fantasia (opcional)"
          maxLength={180}
          erro={errors.nomeFantasia?.message}
          desabilitado={desabilitado}
          aoAlterar={aoAlterarCampo}
        />
        {pj && (
          <CampoDeTexto
            nome="inscricaoEstadual"
            rotulo="Inscrição estadual (opcional)"
            maxLength={20}
            inputMode="numeric"
            ajuda="Só números, ou ISENTO."
            erro={errors.inscricaoEstadual?.message}
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
            acessorio={
              !desabilitado && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 pointer-coarse:h-11"
                  onClick={() => {
                    setValue('inscricaoEstadual', IE_ISENTO, { shouldDirty: true, shouldValidate: true })
                    aoAlterarCampo()
                  }}
                >
                  Isento
                </Button>
              )
            }
          />
        )}
      </div>
    </SecaoDoFornecedor>
  )
}
