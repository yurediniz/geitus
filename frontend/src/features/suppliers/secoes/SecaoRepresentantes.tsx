import { useEffect, useRef } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Plus, Trash2, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import {
  MAXIMO_REPRESENTANTES,
  novoRepresentante,
  type FornecedorFormValues,
} from '@/features/suppliers/fornecedorFormulario'
import { CampoComMascara, CampoDeTexto, SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import { mascararTelefone } from '@/lib/documentos'

interface SecaoRepresentantesProps {
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Representantes de venda (spec B5 §4.2 e §8.3, secao 4): ate 10, na ordem da
 * tela (o primeiro aparece na listagem). Adicionar leva o foco ao nome do novo;
 * remover leva o foco ao proximo (ou ao botao de adicionar).
 */
export function SecaoRepresentantes({ desabilitado, aoAlterarCampo }: SecaoRepresentantesProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  // `chave`: o `id` de cada item e o UUID do representante (o RHF usaria `id` para a chave).
  const { fields, append, remove } = useFieldArray({ control, name: 'representantes', keyName: 'chave' })
  const botaoAdicionarRef = useRef<HTMLButtonElement>(null)
  const focarRef = useRef<number | null>(null)
  const noLimite = fields.length >= MAXIMO_REPRESENTANTES

  useEffect(() => {
    const indice = focarRef.current
    if (indice === null) {
      return
    }
    focarRef.current = null
    const alvo = document.getElementById(`representantes.${indice}.nome`) ?? botaoAdicionarRef.current
    alvo?.focus()
  }, [fields.length])

  const adicionar = () => {
    focarRef.current = fields.length
    append(novoRepresentante(), { shouldFocus: false })
    aoAlterarCampo()
  }

  const remover = (indice: number) => {
    // O seguinte assume o indice; sem seguinte, o anterior; sem nenhum, o botao.
    focarRef.current = indice < fields.length - 1 ? indice : indice - 1
    remove(indice)
    aoAlterarCampo()
  }

  const erroDaLista = errors.representantes?.message ?? errors.representantes?.root?.message

  return (
    <SecaoDoFornecedor
      id="secao-representantes"
      titulo="Representantes"
      descricao="Quem atende a empresa em nome do fornecedor. O primeiro aparece na lista de fornecedores."
    >
      {fields.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Nenhum representante cadastrado.
        </p>
      )}

      {fields.length > 0 && (
        <ol className="space-y-3" aria-label="Representantes de venda">
          {fields.map((campo, indice) => {
            const erro = errors.representantes?.[indice]
            return (
              <li key={campo.chave}>
                {/* Um grupo por representante: o leitor de tela diz de qual sao o nome, o telefone e o e-mail. */}
                <fieldset className="rounded-md bg-muted/40 p-4">
                  <legend className="float-left mb-3 w-full text-sm font-medium">Representante {indice + 1}</legend>
                  <div className="clear-both grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-start">
                    <CampoDeTexto
                      nome={`representantes.${indice}.nome`}
                      rotulo="Nome"
                      obrigatorio
                      maxLength={120}
                      erro={erro?.nome?.message}
                      desabilitado={desabilitado}
                      aoAlterar={aoAlterarCampo}
                    />
                    <CampoComMascara
                      nome={`representantes.${indice}.telefone`}
                      rotulo="Telefone (opcional)"
                      inputMode="tel"
                      placeholder="(00) 00000-0000"
                      mascara={mascararTelefone}
                      erro={erro?.telefone?.message}
                      desabilitado={desabilitado}
                      aoAlterar={aoAlterarCampo}
                    />
                    <CampoDeTexto
                      nome={`representantes.${indice}.email`}
                      rotulo="E-mail (opcional)"
                      type="email"
                      maxLength={180}
                      erro={erro?.email?.message}
                      desabilitado={desabilitado}
                      aoAlterar={aoAlterarCampo}
                    />
                    {!desabilitado && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 self-end text-muted-foreground hover:text-destructive md:mt-7 md:h-9 pointer-coarse:h-11"
                        aria-label={`Remover representante ${indice + 1}`}
                        onClick={() => remover(indice)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="md:sr-only">Remover</span>
                      </Button>
                    )}
                  </div>
                </fieldset>
              </li>
            )
          })}
        </ol>
      )}

      <ErroDoCampo id="representantes-erro" mensagem={erroDaLista} />

      {!desabilitado && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={botaoAdicionarRef}
            id="representantes"
            type="button"
            variant="outline"
            className="h-11 md:h-9 pointer-coarse:h-11"
            disabled={noLimite}
            onClick={adicionar}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar representante
          </Button>
          {noLimite && (
            <p className="text-sm text-muted-foreground">Máximo de {MAXIMO_REPRESENTANTES} representantes.</p>
          )}
        </div>
      )}
    </SecaoDoFornecedor>
  )
}
