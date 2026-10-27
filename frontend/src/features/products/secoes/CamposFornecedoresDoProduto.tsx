import { useMemo, useState } from 'react'
import { Controller, useController, useFormContext, useWatch } from 'react-hook-form'
import { X } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import { MAXIMO_FORNECEDORES, type ProdutoFormValues } from '@/features/products/produtoFormulario'
import { BuscaDeFornecedor } from '@/features/suppliers/BuscaDeFornecedor'

interface CamposFornecedoresDoProdutoProps {
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Sem fornecedor da ultima compra (valor do select). */
const NENHUM = ''

/**
 * "Fornecedores" e "Fornecedor da última compra" na secao Geral (spec de Fornecedores e marcas):
 * a lista com busca (so ativos; os inativos ja ligados ficam marcados
 * "(inativo)"), ate 20, e o da ultima compra escolhido entre os da lista. Tirar
 * da lista o fornecedor da ultima compra limpa esse campo.
 */
export function CamposFornecedoresDoProduto({ desabilitado, aoAlterarCampo }: CamposFornecedoresDoProdutoProps) {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  // Registrada (useController): o `resetField` da sincronizacao com o produto gravado so age em campo registrado.
  const {
    field: { value: fornecedores },
  } = useController({ control, name: 'fornecedores' })
  const ultimaCompraId = useWatch({ control, name: 'fornecedorUltimaCompraId' })
  // O fornecedor da ultima compra saiu da lista (e o campo foi limpo): a ajuda avisa.
  const [ultimaCompraSaiu, setUltimaCompraSaiu] = useState(false)
  const escolhidos = useMemo(() => new Set(fornecedores.map((fornecedor) => fornecedor.id)), [fornecedores])
  const noLimite = fornecedores.length >= MAXIMO_FORNECEDORES

  const definirLista = (proxima: ProdutoFormValues['fornecedores']) => {
    setValue('fornecedores', proxima, { shouldDirty: true, shouldValidate: true })
    if (ultimaCompraId !== null && !proxima.some((fornecedor) => fornecedor.id === ultimaCompraId)) {
      // O da ultima compra saiu da lista: o campo e limpo (spec de Fornecedores e marcas, Review Focus 1).
      setValue('fornecedorUltimaCompraId', null, { shouldDirty: true })
      clearErrors('fornecedorUltimaCompraId')
      setUltimaCompraSaiu(true)
    }
    aoAlterarCampo()
  }

  const erroDaLista = errors.fornecedores?.message ?? errors.fornecedores?.root?.message

  return (
    <>
      <div className="space-y-1.5">
        <span id="fornecedores-rotulo" className="block text-sm font-medium">
          Fornecedores (opcional)
        </span>
        <p id="fornecedores-ajuda" className="text-xs text-muted-foreground">
          Quem vende este produto para você. Pode ter mais de um.
        </p>
        {fornecedores.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-labelledby="fornecedores-rotulo">
            {fornecedores.map((fornecedor) => (
              <li
                key={fornecedor.id}
                className="flex min-h-9 items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-sm text-accent-foreground pointer-coarse:min-h-11"
              >
                <span>
                  {fornecedor.nome}
                  {!fornecedor.ativo && <span className="text-muted-foreground"> (inativo)</span>}
                </span>
                {!desabilitado && (
                  <button
                    type="button"
                    aria-label={`Remover ${fornecedor.nome}`}
                    onClick={() => definirLista(fornecedores.filter((outro) => outro.id !== fornecedor.id))}
                    className="flex size-7 items-center justify-center rounded-full outline-none hover:bg-background/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:size-11"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!desabilitado && (
          <BuscaDeFornecedor
            id="fornecedores"
            idRotulo="fornecedores-rotulo"
            valor={null}
            textoSemValor={fornecedores.length === 0 ? 'Adicionar fornecedor' : 'Adicionar outro fornecedor'}
            ocultos={escolhidos}
            onChange={(fornecedor) => {
              if (fornecedor && !escolhidos.has(fornecedor.id)) {
                definirLista([...fornecedores, fornecedor])
              }
            }}
            desabilitado={noLimite}
            invalido={erroDaLista !== undefined}
            idsDescricao={
              ['fornecedores-ajuda', noLimite && 'fornecedores-limite', erroDaLista && 'fornecedores-erro']
                .filter(Boolean)
                .join(' ')
            }
          />
        )}
        {desabilitado && fornecedores.length === 0 && <p className="text-sm text-muted-foreground">Nenhum.</p>}
        {noLimite && !desabilitado && (
          <p id="fornecedores-limite" className="text-xs text-muted-foreground">
            Máximo de {MAXIMO_FORNECEDORES} fornecedores.
          </p>
        )}
        <ErroDoCampo id="fornecedores-erro" mensagem={erroDaLista} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fornecedorUltimaCompraId" className="text-sm font-medium">
          Fornecedor da última compra (opcional)
        </label>
        <Controller
          control={control}
          name="fornecedorUltimaCompraId"
          render={({ field }) => (
            <NativeSelect
              id="fornecedorUltimaCompraId"
              ref={field.ref}
              name={field.name}
              value={field.value ?? NENHUM}
              onBlur={field.onBlur}
              onChange={(event) => {
                field.onChange(event.target.value === NENHUM ? null : event.target.value)
                setUltimaCompraSaiu(false)
                aoAlterarCampo()
              }}
              disabled={desabilitado || fornecedores.length === 0}
              aria-invalid={errors.fornecedorUltimaCompraId ? true : undefined}
              aria-describedby={
                errors.fornecedorUltimaCompraId ? 'fornecedorUltimaCompraId-erro' : 'fornecedorUltimaCompraId-ajuda'
              }
            >
              <option value={NENHUM}>Nenhum</option>
              {fornecedores.map((fornecedor) => (
                <option key={fornecedor.id} value={fornecedor.id}>
                  {fornecedor.ativo ? fornecedor.nome : `${fornecedor.nome} (inativo)`}
                </option>
              ))}
            </NativeSelect>
          )}
        />
        {!errors.fornecedorUltimaCompraId && (
          <p id="fornecedorUltimaCompraId-ajuda" className="text-xs text-muted-foreground">
            {ultimaCompraSaiu && ultimaCompraId === null
              ? 'O fornecedor da última compra saiu da lista; o campo ficou vazio.'
              : fornecedores.length === 0
                ? 'Adicione um fornecedor à lista para escolher.'
                : 'De quem você comprou da última vez. A entrada por compra no estoque preenche sozinho.'}
          </p>
        )}
        <ErroDoCampo id="fornecedorUltimaCompraId-erro" mensagem={errors.fornecedorUltimaCompraId?.message} />
      </div>
    </>
  )
}
