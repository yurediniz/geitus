import { useMemo, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import type { UseQueryResult } from '@tanstack/react-query'
import { Tag, X } from 'lucide-react'

import { AvisoCatalogo, ErroDoCampo } from '@/features/products/CamposFormulario'
import { SeletorMarca } from '@/features/products/SeletorCategoria'
import { MAXIMO_MARCAS, type FornecedorFormValues } from '@/features/suppliers/fornecedorFormulario'
import { SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import type { Marca, MarcaResumo } from '@/types/catalogo'

interface SecaoMarcasProps {
  marcasQuery: UseQueryResult<Marca[]>
  /** Marcas gravadas no fornecedor: o caminho continua conhecido mesmo se a marca sair da lista. */
  marcasGravadas: MarcaResumo[]
  desabilitado: boolean
  /** Somente ADMIN: "+ Nova marca" no seletor. */
  podeCriar: boolean
  aoAlterarCampo: () => void
}

interface Chip {
  id: string
  caminho: string
  inativa: boolean
}

/**
 * Marcas que vende (spec de Fornecedores e marcas): itens da arvore de marcas
 * (qualquer nivel), ate 200, sem repeticao, como chips com o caminho. O
 * seletor oferece so as selecionaveis e esconde as ja escolhidas; as inativas
 * ja ligadas continuam, marcadas "(inativa)". Escolher um fabricante nao inclui
 * os filhos.
 */
export function SecaoMarcas({ marcasQuery, marcasGravadas, desabilitado, podeCriar, aoAlterarCampo }: SecaoMarcasProps) {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  const marcaIds = useWatch({ control, name: 'marcaIds' })
  // A marca criada pelo "+ Nova" so chega na lista apos o refetch; ate la, o chip usa esta.
  const [criadas, setCriadas] = useState<Marca[]>([])
  const marcas = useMemo(() => {
    const lista = marcasQuery.data ?? []
    return [...lista, ...criadas.filter((criada) => !lista.some((marca) => marca.id === criada.id))]
  }, [marcasQuery.data, criadas])
  const escolhidas = useMemo(() => new Set(marcaIds), [marcaIds])
  const noLimite = marcaIds.length >= MAXIMO_MARCAS

  const chips = useMemo<Chip[]>(() => {
    const porId = new Map(marcas.map((marca) => [marca.id, marca]))
    const gravadas = new Map(marcasGravadas.map((marca) => [marca.id, marca]))
    return marcaIds.map((id) => {
      const conhecida = porId.get(id)
      return {
        id,
        caminho: conhecida?.caminho ?? gravadas.get(id)?.caminho ?? 'Marca',
        inativa: conhecida ? !conhecida.selecionavel : false,
      }
    })
  }, [marcaIds, marcas, marcasGravadas])

  const definir = (proximos: string[]) => {
    setValue('marcaIds', proximos, { shouldDirty: true, shouldValidate: true })
    aoAlterarCampo()
  }

  return (
    <SecaoDoFornecedor
      id="secao-marcas"
      titulo="Marcas que vende"
      descricao="Fabricantes, marcas ou linhas que este fornecedor vende. Escolher um fabricante não inclui as marcas dele."
    >
      {chips.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tag className="h-4 w-4" aria-hidden="true" />
          Nenhuma marca escolhida.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Marcas escolhidas">
          {chips.map((chip) => (
            <li
              key={chip.id}
              className="flex min-h-9 items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-sm text-accent-foreground pointer-coarse:min-h-11"
            >
              <span>
                {chip.caminho}
                {chip.inativa && <span className="text-muted-foreground"> (inativa)</span>}
              </span>
              {!desabilitado && (
                <button
                  type="button"
                  aria-label={`Remover ${chip.caminho}`}
                  onClick={() => definir(marcaIds.filter((id) => id !== chip.id))}
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
        <div className="max-w-md space-y-1.5">
          <label id="marcaIds-rotulo" htmlFor="marcaIds" className="text-sm font-medium">
            Adicionar marca
          </label>
          <SeletorMarca
            id="marcaIds"
            idRotulo="marcaIds-rotulo"
            marcas={marcas}
            valor={null}
            semOpcaoVazia
            textoSemValor="Buscar fabricante ou marca"
            ocultos={escolhidas}
            onChange={(id) => {
              if (id && !escolhidas.has(id)) {
                definir([...marcaIds, id])
              }
            }}
            podeCriar={podeCriar}
            onCriada={(marca) => setCriadas((anteriores) => [...anteriores, marca])}
            desabilitado={noLimite || marcasQuery.isPending}
            invalido={errors.marcaIds !== undefined}
            idsDescricao={
              [noLimite && 'marcaIds-limite', errors.marcaIds && 'marcaIds-erro'].filter(Boolean).join(' ') || undefined
            }
          />
          {noLimite && (
            <p id="marcaIds-limite" className="text-xs text-muted-foreground">
              Máximo de {MAXIMO_MARCAS} marcas.
            </p>
          )}
          <AvisoCatalogo
            carregouComFalha={marcasQuery.isError}
            mensagemFalha="Não foi possível carregar as marcas."
            onTentarNovamente={() => marcasQuery.refetch()}
          />
        </div>
      )}
      <ErroDoCampo id="marcaIds-erro" mensagem={errors.marcaIds?.message} />
    </SecaoDoFornecedor>
  )
}
