import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import type { UseQueryResult } from '@tanstack/react-query'
import { Package, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useConfiguracaoEtiqueta } from '@/features/catalog/useConfiguracaoEtiqueta'
import { AvisoCatalogo, ErroDoCampo } from '@/features/products/CamposFormulario'
import {
  MAXIMO_EMBALAGENS,
  dataHojeSaoPaulo,
  formatosDoProduto,
  novaEmbalagem,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { BlocoEmbalagem } from '@/features/products/secoes/BlocoEmbalagem'
import { precoVigenteDaUnidade } from '@/lib/embalagem'
import type { UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

export interface SecaoEmbalagensProps {
  /** Produto em edicao (null no cadastro): mantem a unidade atual de cada embalagem, mesmo inativa. */
  produto: Produto | null
  unidadesQuery: UseQueryResult<UnidadeMedida[]>
  /** Sigla por id de unidade (lista + unidades do produto e das embalagens). */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  /** OPERADOR: so leitura, sem adicionar nem remover. */
  somenteLeitura: boolean
  aoAlterarCampo: () => void
}

/** Id do botao "Adicionar embalagem" (recebe o foco depois de remover uma embalagem). */
const ID_ADICIONAR = 'embalagens-adicionar'

const SEM_UNIDADES: readonly UnidadeMedida[] = []

/**
 * Secao Embalagens (spec de Produtos): outras formas de vender ou comprar o mesmo
 * produto, com estoque unico na unidade de venda. Cada embalagem e um bloco
 * (`BlocoEmbalagem`); "Adicionar embalagem" fica depois da lista, ate 10. No
 * cadastro novo, as embalagens sao gravadas junto com o produto.
 *
 * Le do formulario so a unidade de venda e o preco vigente/custo da unidade
 * (com `compute`): digitar na quantidade ou no preco de uma embalagem so
 * renderiza o bloco dela.
 */
export function SecaoEmbalagens({
  produto,
  unidadesQuery,
  siglaPorId,
  desabilitado,
  somenteLeitura,
  aoAlterarCampo,
}: SecaoEmbalagensProps) {
  const {
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  // `keyName` proprio: o `id` da embalagem e o UUID gravado, que vai no request.
  const { fields, append, remove } = useFieldArray({ control, name: 'embalagens', keyName: 'chave' })
  const unidadeId = useWatch({ control, name: 'unidadeId' })
  const custo = useWatch({ control, name: 'custo' })
  const precoDaUnidade = useWatch({
    control,
    name: ['precoVenda', 'promocaoAtiva', 'precoPromocional', 'promocaoInicio', 'promocaoFim'],
    compute: ([precoVenda, promocaoAtiva, precoPromocional, promocaoInicio, promocaoFim]) =>
      precoVigenteDaUnidade(
        { precoVenda, promocaoAtiva, precoPromocional, promocaoInicio, promocaoFim },
        dataHojeSaoPaulo(),
      ),
  })
  const [focoPendente, setFocoPendente] = useState<string | null>(null)
  const etiquetaQuery = useConfiguracaoEtiqueta()
  const formatosGravados = useMemo(() => formatosDoProduto(produto), [produto])
  const unidades = unidadesQuery.data ?? SEM_UNIDADES
  const unidadesGravadas = useMemo<UnidadeResumo[]>(
    () => (produto?.embalagens ?? []).map((embalagem) => embalagem.unidade),
    [produto],
  )

  // Foco depois do render que adicionou (a unidade da nova) ou removeu (o botao de adicionar).
  useEffect(() => {
    if (focoPendente === null) {
      return
    }
    document.getElementById(focoPendente)?.focus()
    setFocoPendente(null)
  }, [focoPendente])

  const siglaDeVenda = siglaPorId.get(unidadeId)

  const adicionar = () => {
    append(novaEmbalagem(), { shouldFocus: false })
    setFocoPendente(`embalagens.${fields.length}.unidadeId`)
    aoAlterarCampo()
  }

  const removerEmbalagem = (indice: number) => {
    remove(indice)
    setFocoPendente(ID_ADICIONAR)
    aoAlterarCampo()
  }

  /** So uma embalagem de compra: ligar numa desliga nas outras. */
  const marcarDeCompra = (indice: number) => {
    getValues('embalagens').forEach((embalagem, outro) => {
      if (outro !== indice && embalagem.deCompra) {
        setValue(`embalagens.${outro}.deCompra`, false, { shouldDirty: true })
      }
    })
  }

  const ajuda = `Outras formas de vender ou comprar este produto, como a caixa com 3, cada uma com seu código de barras e preço. ${
    siglaDeVenda ? `O estoque continua em ${siglaDeVenda}.` : 'O estoque continua na unidade de venda.'
  }`
  const erroDaLista = errors.embalagens?.root?.message ?? errors.embalagens?.message
  const podeAdicionar = !somenteLeitura && fields.length < MAXIMO_EMBALAGENS

  const botaoAdicionar = podeAdicionar && (
    <Button
      id={ID_ADICIONAR}
      type="button"
      variant="outline"
      className="min-h-11"
      onClick={adicionar}
      disabled={desabilitado}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Adicionar embalagem
    </Button>
  )

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md bg-muted/40 px-4 py-6 text-center">
        <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        {somenteLeitura && <p className="text-sm font-medium">Nenhuma embalagem cadastrada.</p>}
        <p className="max-w-prose text-sm text-muted-foreground">{ajuda}</p>
        {botaoAdicionar}
        <ErroDoCampo id="embalagens-erro" mensagem={erroDaLista} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-muted-foreground">{ajuda}</p>
      <AvisoCatalogo
        carregouComFalha={unidadesQuery.isError}
        mensagemFalha="Não foi possível carregar as unidades."
        onTentarNovamente={() => unidadesQuery.refetch()}
      />
      <ol aria-label="Embalagens do produto" className="space-y-4">
        {fields.map((campo, indice) => (
          <BlocoEmbalagem
            key={campo.chave}
            indice={indice}
            unidades={unidades}
            unidadesGravadas={unidadesGravadas}
            unidadeIdDeVenda={unidadeId}
            siglaPorId={siglaPorId}
            siglaDeVenda={siglaDeVenda}
            precoDaUnidade={precoDaUnidade}
            custoDaUnidade={custo}
            formatosGravados={formatosGravados}
            configuracaoEtiqueta={etiquetaQuery.data ?? null}
            carregandoUnidades={unidadesQuery.isPending}
            desabilitado={desabilitado}
            somenteLeitura={somenteLeitura}
            aoMarcarDeCompra={marcarDeCompra}
            aoRemover={removerEmbalagem}
            aoAlterarCampo={aoAlterarCampo}
          />
        ))}
      </ol>
      <ErroDoCampo id="embalagens-erro" mensagem={erroDaLista} />
      {botaoAdicionar}
      {!somenteLeitura && !podeAdicionar && (
        <p className="text-sm text-muted-foreground">{`Limite de ${MAXIMO_EMBALAGENS} embalagens atingido.`}</p>
      )}
    </div>
  )
}
