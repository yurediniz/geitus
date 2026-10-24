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
  numeroValido,
  type FormatosGravados,
  type OpcaoUnidade,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { precoCalculadoDaEmbalagem, rotuloDaEmbalagem } from '@/lib/embalagem'
import { interpretarQuantidade } from '@/lib/quantidade'
import type { ConfiguracaoEtiqueta } from '@/types/etiquetaBalanca'

/** Preco vigente da unidade (o promocional quando a promocao vale hoje). */
export interface PrecoDaUnidade {
  preco: string
  emPromocao: boolean
}

export interface BlocoEmbalagemProps {
  indice: number
  /** Unidades que a embalagem pode usar (ativas, sem a de venda, e a atual dela). */
  opcoesUnidade: OpcaoUnidade[]
  siglaPorId: ReadonlyMap<string, string>
  /** Sigla da unidade de venda; undefined enquanto a lista carrega. */
  siglaDeVenda: string | undefined
  precoDaUnidade: PrecoDaUnidade
  /** Custo da unidade de venda ('' sem custo). */
  custoDaUnidade: string
  formatosGravados: FormatosGravados
  configuracaoEtiqueta: ConfiguracaoEtiqueta | null
  /** Codigos da unidade e das outras embalagens (nao podem entrar nesta). */
  codigosDeOutrasListas: readonly string[]
  carregandoUnidades: boolean
  desabilitado: boolean
  /** OPERADOR: sem o botao de remover. */
  somenteLeitura: boolean
  /** Ligar "Embalagem de compra" aqui desliga nas outras. */
  aoMarcarDeCompra: (indice: number) => void
  aoRemover: (indice: number) => void
  aoAlterarCampo: () => void
}

/** Quantidade em pt-BR para a dica ("3", "25,5"). */
function quantidadeDaDica(quantidade: string): string | null {
  const valor = interpretarQuantidade(quantidade)
  return valor === null || valor <= 0 ? null : valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/**
 * Dica do preco calculado sem preco proprio (spec B3 §5.1): "3 × R$ 89,90 =
 * R$ 269,70" ou "3 × R$ 79,90 (promoção) = R$ 239,70". Null enquanto faltar a
 * quantidade ou o preco da unidade.
 */
function textoDoPrecoCalculado(quantidade: string, precoDaUnidade: PrecoDaUnidade): string | null {
  const calculado = precoCalculadoDaEmbalagem(quantidade, precoDaUnidade.preco)
  const vezes = quantidadeDaDica(quantidade)
  const unidade = numeroValido(precoDaUnidade.preco)
  if (calculado === null || vezes === null || unidade === null) {
    return null
  }
  const promocao = precoDaUnidade.emPromocao ? ' (promoção)' : ''
  return `${vezes} × ${formatarMoeda(unidade)}${promocao} = ${formatarMoeda(Number(calculado))}`
}

/**
 * Uma embalagem da secao Embalagens: unidade, "com [quantidade] UN", preco
 * opcional (vazio, vale o calculado), margem e markup do preco efetivo sobre o
 * custo da embalagem, os codigos de barras (ate 5) e "Embalagem de compra".
 */
export function BlocoEmbalagem({
  indice,
  opcoesUnidade,
  siglaPorId,
  siglaDeVenda,
  precoDaUnidade,
  custoDaUnidade,
  formatosGravados,
  configuracaoEtiqueta,
  codigosDeOutrasListas,
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
  const [unidadeId, quantidade, preco] = useWatch({
    control,
    name: [`embalagens.${indice}.unidadeId`, `embalagens.${indice}.quantidade`, `embalagens.${indice}.preco`],
  })
  const erros = errors.embalagens?.[indice]
  const sigla = siglaPorId.get(unidadeId)
  const rotulo =
    sigla && siglaDeVenda && interpretarQuantidade(quantidade) !== null
      ? rotuloDaEmbalagem(sigla, quantidade, siglaDeVenda)
      : null
  const titulo = rotulo ?? 'Nova embalagem'
  const idTitulo = `embalagens-${indice}-titulo`

  const semPrecoProprio = preco.trim() === ''
  const precoEfetivo = semPrecoProprio ? precoCalculadoDaEmbalagem(quantidade, precoDaUnidade.preco) : preco
  const custoDaEmbalagem = precoCalculadoDaEmbalagem(quantidade, custoDaUnidade)
  const { margem, markup } = calcularMargemMarkup(precoEfetivo ?? '', custoDaEmbalagem ?? '')
  const abaixoDoCusto =
    precoEfetivo !== null && custoDaEmbalagem !== null && Number(precoEfetivo) < Number(custoDaEmbalagem)
  const dica = semPrecoProprio ? textoDoPrecoCalculado(quantidade, precoDaUnidade) : null

  const idQuantidade = `embalagens.${indice}.quantidade` as const
  const erroQuantidade = erros?.quantidade?.message
  const idCompra = `embalagens.${indice}.deCompra` as const

  return (
    <li role="group" aria-labelledby={idTitulo} className="space-y-4 rounded-md bg-muted/40 p-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h3 id={idTitulo} className="text-sm font-semibold tabular-nums">
          {titulo}
        </h3>
        {!somenteLeitura && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground hover:text-destructive"
            onClick={() => aoRemover(indice)}
            disabled={desabilitado}
            aria-label={`Remover embalagem ${rotulo ?? 'nova'}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
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
            Com
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
        <CampoMoedaFormulario
          id={`embalagens.${indice}.preco`}
          label="Preço (opcional)"
          erro={erros?.preco?.message}
          ajuda={dica ?? undefined}
          aoAlterar={aoAlterarCampo}
          disabled={desabilitado}
        />
      </div>

      <div className="space-y-1">
        <dl
          role="group"
          aria-label={`Margem e markup da embalagem ${titulo}`}
          className="flex flex-wrap gap-x-6 gap-y-1 text-sm"
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
        {abaixoDoCusto && (
          <p className="text-sm">
            <AvisoAbaixoDoCusto
              texto={`Preço abaixo do custo da embalagem (${formatarMoeda(Number(custoDaEmbalagem))}).`}
            />
          </p>
        )}
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
          codigosDeOutrasListas={codigosDeOutrasListas}
          desabilitado={desabilitado}
          aoAlterarCampo={aoAlterarCampo}
        />
      </section>

      <div className="flex min-h-11 items-center gap-3">
        <Controller
          control={control}
          name={idCompra}
          render={({ field }) => (
            <Switch
              id={idCompra}
              aria-labelledby={`${idCompra}-rotulo`}
              aria-invalid={erros?.deCompra ? true : undefined}
              aria-describedby={erros?.deCompra ? `${idCompra}-erro` : undefined}
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
      <ErroDoCampo id={`${idCompra}-erro`} mensagem={erros?.deCompra?.message} />
    </li>
  )
}

interface CodigosBarrasDaEmbalagemProps {
  indice: number
  titulo: string
  formatosGravados: FormatosGravados
  configuracaoEtiqueta: ConfiguracaoEtiqueta | null
  codigosDeOutrasListas: readonly string[]
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Liga a lista de codigos da embalagem (e o texto ainda nao adicionado) ao formulario. */
function CodigosBarrasDaEmbalagem({
  indice,
  titulo,
  formatosGravados,
  configuracaoEtiqueta,
  codigosDeOutrasListas,
  desabilitado,
  aoAlterarCampo,
}: CodigosBarrasDaEmbalagemProps) {
  const { control, setError, clearErrors } = useFormContext<ProdutoFormValues>()
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
      outrasListas={codigosDeOutrasListas}
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
