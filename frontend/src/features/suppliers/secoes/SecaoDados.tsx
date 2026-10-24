import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  IE_ISENTO,
  mascararDocumento,
  mascararInscricaoEstadual,
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

/** "O CNPJ foi apagado ao trocar para pessoa física." (e a IE, se havia); null se nada foi apagado. */
function textoDoQueFoiApagado(
  anterior: TipoPessoaFornecedor,
  proximo: TipoPessoaFornecedor,
  documento: string,
  inscricaoEstadual: string,
): string | null {
  const destino = proximo === 'PF' ? 'pessoa física' : 'pessoa jurídica'
  const documentoApagado = documento.trim() !== ''
  const ieApagada = anterior === 'PJ' && inscricaoEstadual.trim() !== ''
  if (documentoApagado && ieApagada) {
    return `O ${rotuloDoDocumento(anterior)} e a inscrição estadual foram apagados ao trocar para ${destino}.`
  }
  if (documentoApagado) {
    return `O ${rotuloDoDocumento(anterior)} foi apagado ao trocar para ${destino}.`
  }
  return ieApagada ? `A inscrição estadual foi apagada ao trocar para ${destino}.` : null
}

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
    getValues,
    clearErrors,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  const tipo = useWatch({ control, name: 'tipoPessoa' })
  const pj = tipo === 'PJ'
  // O que a troca de tipo apagou (some na proxima alteracao do documento ou da IE).
  const [avisoDaTroca, setAvisoDaTroca] = useState<string | null>(null)

  const trocarTipo = (proximo: TipoPessoaFornecedor) => {
    if (proximo === tipo) {
      return
    }
    setAvisoDaTroca(textoDoQueFoiApagado(tipo, proximo, getValues('documento'), getValues('inscricaoEstadual')))
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
      {avisoDaTroca && (
        <p role="status" className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {avisoDaTroca}
        </p>
      )}

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
          aoAlterar={() => {
            setAvisoDaTroca(null)
            aoAlterarCampo()
          }}
        />
        <CampoDeTexto
          nome="razaoSocial"
          rotulo={rotuloDoNome(tipo)}
          obrigatorio
          maxLength={180}
          ajuda={pj ? 'Como aparece na nota fiscal. Se não souber, use o nome pelo qual você conhece o fornecedor.' : undefined}
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
          <CampoComMascara
            nome="inscricaoEstadual"
            rotulo="Inscrição estadual (opcional)"
            maxLength={20}
            inputMode="text"
            mascara={mascararInscricaoEstadual}
            ajuda="Só números, ou ISENTO."
            erro={errors.inscricaoEstadual?.message}
            desabilitado={desabilitado}
            aoAlterar={() => {
              setAvisoDaTroca(null)
              aoAlterarCampo()
            }}
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
