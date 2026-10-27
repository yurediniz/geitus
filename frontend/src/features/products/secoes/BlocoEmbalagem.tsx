import { useMemo, type ReactNode } from 'react'
import { Controller, useController, useFormContext, useWatch } from 'react-hook-form'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CampoCodigosBarras } from '@/features/products/CampoCodigosBarras'
import {
  AvisoAbaixoDoCusto,
  CampoMoedaFormulario,
  CampoSelect,
  ErroDoCampo,
} from '@/features/products/CamposFormulario'
import { formatarMoeda, formatarPercentual } from '@/features/products/formatacaoProduto'
import {
  MAXIMO_CODIGOS_POR_EMBALAGEM,
  calcularMargemMarkup,
  localizarCodigoForaDaLista,
  numeroValido,
  opcoesDeUnidade,
  type FormatosGravados,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { precoCalculadoDaEmbalagem, rotuloDaEmbalagem, valorPorUnidade } from '@/lib/embalagem'
import { formatarMoedaDigitando } from '@/lib/moeda'
import { interpretarQuantidade } from '@/lib/quantidade'
import type { UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import type { ConfiguracaoEtiqueta } from '@/types/etiquetaBalanca'

/** Preco vigente da unidade (o promocional quando a promocao vale hoje). */
export interface PrecoDaUnidade {
  preco: string
  emPromocao: boolean
}

export interface BlocoEmbalagemProps {
  indice: number
  /** Unidades do catalogo (as ativas sao oferecidas). */
  unidades: readonly UnidadeMedida[]
  /** Unidades das embalagens gravadas: a atual fica no seletor mesmo inativa. */
  unidadesGravadas: readonly UnidadeResumo[]
  /** Unidade de venda escolhida (nao e oferecida, salvo se ja for a da embalagem). */
  unidadeIdDeVenda: string
  siglaPorId: ReadonlyMap<string, string>
  /** Sigla da unidade de venda; undefined enquanto a lista carrega. */
  siglaDeVenda: string | undefined
  precoDaUnidade: PrecoDaUnidade
  /** Custo da unidade de venda ('' sem custo). */
  custoDaUnidade: string
  formatosGravados: FormatosGravados
  configuracaoEtiqueta: ConfiguracaoEtiqueta | null
  carregandoUnidades: boolean
  desabilitado: boolean
  /** OPERADOR: sem o botao de remover. */
  somenteLeitura: boolean
  /** Ligar "Embalagem de compra" aqui desliga nas outras. */
  aoMarcarDeCompra: (indice: number) => void
  aoRemover: (indice: number) => void
  aoAlterarCampo: () => void
}

const AJUDA_DE_COMPRA =
  'Como o produto chega do fornecedor. Já vem escolhida ao registrar entrada por compra. Só uma por produto.'

/** Quantidade em pt-BR para a dica ("3", "25,5"); null se ainda nao e numero > 0. */
function quantidadeDaDica(quantidade: string): string | null {
  const valor = interpretarQuantidade(quantidade)
  return valor === null || valor <= 0 ? null : valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/**
 * Ajuda do preco (spec de Produtos). Vazio: "Vazio, vende por 3 × R$ 89,90 = R$
 * 269,70." (com "(promoção)" quando vale a promocional) ou, faltando a
 * quantidade ou o preco da unidade, como a conta e feita. Com preco proprio:
 * "Sai a R$ 69,97 por UN (avulso: R$ 269,70)."; null enquanto falta a quantidade.
 */
function textoDoPreco(
  preco: string,
  quantidade: string,
  precoDaUnidade: PrecoDaUnidade,
  siglaDeVenda: string | undefined,
): string | null {
  const calculado = precoCalculadoDaEmbalagem(quantidade, precoDaUnidade.preco)
  if (preco.trim() === '') {
    const vezes = quantidadeDaDica(quantidade)
    const unidade = numeroValido(precoDaUnidade.preco)
    if (calculado === null || vezes === null || unidade === null) {
      return 'Vazio, vende pela quantidade × o preço de venda.'
    }
    const promocao = precoDaUnidade.emPromocao ? ' (promoção)' : ''
    return `Vazio, vende por ${vezes} × ${formatarMoeda(unidade)}${promocao} = ${formatarMoeda(Number(calculado))}.`
  }
  const porUnidade = valorPorUnidade(preco, quantidade)
  if (porUnidade === null || !siglaDeVenda) {
    return null
  }
  const avulso = calculado === null ? '' : ` (avulso: ${formatarMoeda(Number(calculado))})`
  return `Sai a ${formatarMoeda(Number(porUnidade))} por ${siglaDeVenda}${avulso}.`
}

/**
 * Uma embalagem da secao Embalagens: unidade e "Contém [quantidade] UN",
 * "Embalagem de compra", o preco opcional (vazio, vale o calculado) com margem
 * e markup do preco efetivo sobre o custo da embalagem e os codigos de barras
 * (ate 5). Le do formulario so os proprios campos: digitar numa embalagem nao
 * renderiza as outras.
 */
export function BlocoEmbalagem({
  indice,
  unidades,
  unidadesGravadas,
  unidadeIdDeVenda,
  siglaPorId,
  siglaDeVenda,
  precoDaUnidade,
  custoDaUnidade,
  formatosGravados,
  configuracaoEtiqueta,
  carregandoUnidades,
  desabilitado,
  somenteLeitura,
  aoMarcarDeCompra,
  aoRemover,
  aoAlterarCampo,
}: BlocoEmbalagemProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const [unidadeId, quantidade, preco, deCompra] = useWatch({
    control,
    name: [
      `embalagens.${indice}.unidadeId`,
      `embalagens.${indice}.quantidade`,
      `embalagens.${indice}.preco`,
      `embalagens.${indice}.deCompra`,
    ],
  })
  const erros = errors.embalagens?.[indice]

  // Ativas sem a unidade de venda; a ja escolhida fica (mesmo inativa, ou igual a de venda depois de troca-la).
  const opcoesUnidade = useMemo(() => {
    const gravada = unidadesGravadas.find((unidade) => unidade.id === unidadeId) ?? null
    return opcoesDeUnidade([...unidades], gravada).filter(
      (opcao) => opcao.id !== unidadeIdDeVenda || opcao.id === unidadeId,
    )
  }, [unidades, unidadesGravadas, unidadeId, unidadeIdDeVenda])

  const sigla = siglaPorId.get(unidadeId)
  const rotulo =
    sigla && siglaDeVenda && interpretarQuantidade(quantidade) !== null
      ? rotuloDaEmbalagem(sigla, quantidade, siglaDeVenda)
      : null
  const titulo = rotulo ?? 'Nova embalagem'
  const idTitulo = `embalagens-${indice}-titulo`

  const semPrecoProprio = preco.trim() === ''
  const calculado = precoCalculadoDaEmbalagem(quantidade, precoDaUnidade.preco)
  const precoEfetivo = semPrecoProprio ? calculado : preco
  const custoDaEmbalagem = precoCalculadoDaEmbalagem(quantidade, custoDaUnidade)
  const { margem, markup } = calcularMargemMarkup(precoEfetivo ?? '', custoDaEmbalagem ?? '')
  const abaixoDoCusto =
    precoEfetivo !== null && custoDaEmbalagem !== null && Number(precoEfetivo) < Number(custoDaEmbalagem)
  const textoPreco = textoDoPreco(preco, quantidade, precoDaUnidade, siglaDeVenda)
  // O aviso abaixo do custo fica na ajuda do campo, como nos precos da secao Precos.
  const ajudaPreco: ReactNode =
    textoPreco || abaixoDoCusto ? (
      <>
        {textoPreco}
        {abaixoDoCusto && (
          <>
            {' '}
            <span className="mt-1 block">
              <AvisoAbaixoDoCusto
                texto={`Preço abaixo do custo da embalagem (${formatarMoeda(Number(custoDaEmbalagem))}).`}
              />
            </span>
          </>
        )}
      </>
    ) : undefined

  const idQuantidade = `embalagens.${indice}.quantidade` as const
  const erroQuantidade = erros?.quantidade?.message
  const idCompra = `embalagens.${indice}.deCompra` as const
  const descricaoCompra = [`${idCompra}-ajuda`, erros?.deCompra ? `${idCompra}-erro` : null].filter(Boolean).join(' ')

  return (
    <li>
      <div role="group" aria-labelledby={idTitulo} className="space-y-4 rounded-md border bg-card p-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 id={idTitulo} className="text-sm font-semibold tabular-nums">
              {titulo}
            </h3>
            {deCompra && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                De compra
              </span>
            )}
          </div>
          {!somenteLeitura && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => aoRemover(indice)}
              disabled={desabilitado}
              aria-label={`Remover embalagem ${rotulo ?? `${indice + 1} (nova)`}`}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            id={`embalagens.${indice}.unidadeId`}
            label="Unidade"
            erro={erros?.unidadeId?.message}
            selectProps={register(`embalagens.${indice}.unidadeId`, { onChange: aoAlterarCampo })}
            disabled={desabilitado || carregandoUnidades}
            opcaoVazia={carregandoUnidades ? 'Carregando unidades...' : 'Selecione a unidade'}
            opcoes={opcoesUnidade}
          />
          <div className="space-y-1.5">
            <label htmlFor={idQuantidade} className="text-sm font-medium">
              Contém
              <span className="sr-only">{` quantas ${siglaDeVenda ?? 'unidades de venda'}`}</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={idQuantidade}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ex.: 3"
                disabled={desabilitado}
                aria-invalid={erroQuantidade ? true : undefined}
                aria-describedby={erroQuantidade ? `${idQuantidade}-erro` : undefined}
                className="tabular-nums"
                {...register(idQuantidade, { onChange: aoAlterarCampo })}
              />
              {siglaDeVenda && (
                <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
                  {siglaDeVenda}
                </span>
              )}
            </div>
            <ErroDoCampo id={`${idQuantidade}-erro`} mensagem={erroQuantidade} />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex min-h-11 items-center gap-3">
            <Controller
              control={control}
              name={idCompra}
              render={({ field }) => (
                <Switch
                  id={idCompra}
                  aria-labelledby={`${idCompra}-rotulo`}
                  aria-describedby={descricaoCompra}
                  aria-invalid={erros?.deCompra ? true : undefined}
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={(valor) => {
                    field.onChange(valor)
                    if (valor) {
                      aoMarcarDeCompra(indice)
                    }
                    aoAlterarCampo()
                  }}
                  onBlur={field.onBlur}
                  disabled={desabilitado}
                />
              )}
            />
            <label id={`${idCompra}-rotulo`} htmlFor={idCompra} className="cursor-pointer text-sm font-medium">
              Embalagem de compra
            </label>
          </div>
          <p id={`${idCompra}-ajuda`} className="text-xs text-muted-foreground">
            {AJUDA_DE_COMPRA}
          </p>
          <ErroDoCampo id={`${idCompra}-erro`} mensagem={erros?.deCompra?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoMoedaFormulario
            id={`embalagens.${indice}.preco`}
            label="Preço (opcional)"
            erro={erros?.preco?.message}
            ajuda={ajudaPreco}
            // Vazio, o campo mostra o preco que vale (o calculado).
            placeholder={calculado === null ? undefined : formatarMoedaDigitando(calculado)}
            aoAlterar={aoAlterarCampo}
            disabled={desabilitado}
          />
          <dl
            role="group"
            aria-label={`Margem e markup da embalagem ${titulo}`}
            className="flex flex-wrap content-start gap-x-6 gap-y-1 text-sm sm:pt-7"
          >
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Margem</dt>
              <dd className="font-semibold tabular-nums">{formatarPercentual(margem) ?? '—'}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Markup</dt>
              <dd className="font-semibold tabular-nums">{formatarPercentual(markup) ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <section aria-labelledby={`${idTitulo}-codigos`} className="space-y-2">
          <h4 id={`${idTitulo}-codigos`} className="text-sm font-medium">
            Códigos de barras da embalagem
          </h4>
          <CodigosBarrasDaEmbalagem
            indice={indice}
            titulo={titulo}
            formatosGravados={formatosGravados}
            configuracaoEtiqueta={configuracaoEtiqueta}
            siglaPorId={siglaPorId}
            desabilitado={desabilitado}
            aoAlterarCampo={aoAlterarCampo}
          />
        </section>
      </div>
    </li>
  )
}

interface CodigosBarrasDaEmbalagemProps {
  indice: number
  titulo: string
  formatosGravados: FormatosGravados
  configuracaoEtiqueta: ConfiguracaoEtiqueta | null
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Liga a lista de codigos da embalagem (e o texto ainda nao adicionado) ao formulario. */
function CodigosBarrasDaEmbalagem({
  indice,
  titulo,
  formatosGravados,
  configuracaoEtiqueta,
  siglaPorId,
  desabilitado,
  aoAlterarCampo,
}: CodigosBarrasDaEmbalagemProps) {
  const { control, getValues, setError, clearErrors } = useFormContext<ProdutoFormValues>()
  const nomeLista = `embalagens.${indice}.codigosBarras` as const
  const nomePendente = `embalagens.${indice}.codigoPendente` as const
  const { field: lista, fieldState: estadoLista } = useController({ control, name: nomeLista })
  const { field: pendente, fieldState: estadoPendente } = useController({ control, name: nomePendente })

  return (
    <CampoCodigosBarras
      id={nomeLista}
      limite={MAXIMO_CODIGOS_POR_EMBALAGEM}
      ajuda={`Até ${MAXIMO_CODIGOS_POR_EMBALAGEM} códigos.`}
      rotuloLista={`Códigos de barras da embalagem ${titulo}`}
      mostrarPrincipal={false}
      // Um codigo pertence a uma lista so (spec de Produtos): a unidade e as outras embalagens, lidas ao adicionar.
      localizador={(codigo) => localizarCodigoForaDaLista(getValues(), indice, siglaPorId)(codigo)}
      valor={lista.value}
      onChange={(codigos) => {
        lista.onChange(codigos)
        aoAlterarCampo()
      }}
      entrada={pendente.value}
      onEntradaChange={(texto) => {
        pendente.onChange(texto)
        aoAlterarCampo()
      }}
      erroEntrada={estadoPendente.error?.message}
      onErroEntradaChange={(mensagem) =>
        mensagem ? setError(nomePendente, { type: 'manual', message: mensagem }) : clearErrors(nomePendente)
      }
      formatosGravados={formatosGravados}
      configuracaoEtiqueta={configuracaoEtiqueta}
      desabilitado={desabilitado}
      erro={estadoLista.error?.message}
    />
  )
}
