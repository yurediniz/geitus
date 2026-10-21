import { useState, type ReactNode } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { CheckCircle2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  AvisoAbaixoDoCusto,
  CampoMoedaFormulario,
  CampoTexto,
} from '@/features/products/CamposFormulario'
import { formatarMoeda, formatarPercentual } from '@/features/products/formatacaoProduto'
import {
  CAMPOS_ATACADO,
  CAMPOS_PROMOCAO,
  type CampoDeBloco,
  calcularMargemMarkup,
  calcularPrecoPelaMargem,
  dataLocalHoje,
  precoAbaixoDoCusto,
  situacaoPromocaoLocal,
  textoAjudaAtacado,
  textoSeloPromocao,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { cn } from '@/lib/utils'
import type { SituacaoPromocao } from '@/types/produto'

export interface AbaPrecosProps {
  /** Sigla por id de unidade, para "A partir de 12 UN". */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Cor do selo por situacao; o texto diz a situacao (nunca so a cor). */
const CLASSE_SELO: Readonly<Record<SituacaoPromocao, string>> = {
  VIGENTE: 'bg-success-soft text-success-soft-foreground',
  AGENDADA: 'bg-info-soft text-info-soft-foreground',
  ENCERRADA: 'bg-muted text-muted-foreground',
}

/** Aviso de abaixo do custo para a ajuda de um campo de preco; undefined quando nao se aplica. */
function avisoDeCusto(preco: string, custo: string): ReactNode {
  return precoAbaixoDoCusto(preco, custo) ? <AvisoAbaixoDoCusto custo={Number(custo)} /> : undefined
}

interface BlocoComInterruptorProps {
  id: 'promocaoAtiva' | 'atacadoAtivo'
  /** Rotulo do interruptor, que tambem nomeia o bloco (ex.: "Ativar preço promocional"). */
  rotulo: string
  descricao: string
  desabilitado: boolean
  /** Ligar/desligar; desligar limpa os campos do bloco. */
  aoAlternar: (ligado: boolean) => void
  children: ReactNode
}

/** Bloco opcional com interruptor no topo: os campos so aparecem com ele ligado. */
function BlocoComInterruptor({ id, rotulo, descricao, desabilitado, aoAlternar, children }: BlocoComInterruptorProps) {
  const { control, watch } = useFormContext<ProdutoFormValues>()
  const ligado = watch(id)
  return (
    <section aria-labelledby={`${id}-rotulo`} className="space-y-4 rounded-md bg-muted/40 p-4">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div>
          {/* O rotulo tambem alterna o interruptor: alvo de toque maior que o trilho. */}
          <label id={`${id}-rotulo`} htmlFor={id} className="cursor-pointer text-sm font-medium">
            {rotulo}
          </label>
          <p id={`${id}-descricao`} className="text-xs text-muted-foreground">
            {descricao}
          </p>
        </div>
        <Controller
          control={control}
          name={id}
          render={({ field }) => (
            <Switch
              id={id}
              ref={field.ref}
              checked={field.value}
              onCheckedChange={(valor) => {
                field.onChange(valor)
                aoAlternar(valor)
              }}
              onBlur={field.onBlur}
              disabled={desabilitado}
              aria-describedby={`${id}-descricao`}
            />
          )}
        />
      </div>
      {ligado && children}
    </section>
  )
}

/**
 * Aba Precos: custo e preco minimo, margem/markup derivados, o preco pela
 * margem desejada e os blocos opcionais de promocao e atacado. O preco de
 * venda e essencial e fica na aba Geral (cadastro rapido); aqui so aparece
 * como referencia.
 */
export function AbaPrecos({ siglaPorId, desabilitado, aoAlterarCampo }: AbaPrecosProps) {
  const {
    register,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const [precoVenda, custo, unidadeId, precoPromocional, promocaoInicio, promocaoFim, precoAtacado, quantidadeMinima] =
    watch([
      'precoVenda',
      'custo',
      'unidadeId',
      'precoPromocional',
      'promocaoInicio',
      'promocaoFim',
      'precoAtacado',
      'quantidadeMinimaAtacado',
    ])
  const { margem, markup } = calcularMargemMarkup(precoVenda, custo)
  const margemTexto = formatarPercentual(margem)
  const markupTexto = formatarPercentual(markup)
  const precoInformado = precoVenda.trim() !== '' && Number.isFinite(Number(precoVenda))
  const siglaVenda = siglaPorId.get(unidadeId)

  const situacao = situacaoPromocaoLocal(promocaoInicio, promocaoFim, dataLocalHoje())
  const ajudaAtacado = textoAjudaAtacado(quantidadeMinima, precoAtacado, siglaVenda)

  /** Desligar um bloco limpa os campos dele (o produto fica sem promocao ou sem atacado ao salvar). */
  const limparBloco = (campos: readonly CampoDeBloco[]) => {
    for (const campo of campos) {
      setValue(campo, '', { shouldDirty: true })
    }
    clearErrors([...campos])
  }

  const alternarPromocao = (ligado: boolean) => {
    if (!ligado) {
      limparBloco(CAMPOS_PROMOCAO)
    }
    aoAlterarCampo()
  }

  const alternarAtacado = (ligado: boolean) => {
    if (!ligado) {
      limparBloco(CAMPOS_ATACADO)
    }
    aoAlterarCampo()
  }

  const removerPromocao = () => {
    setValue('promocaoAtiva', false, { shouldDirty: true })
    alternarPromocao(false)
    // O botao sai da tela junto com o bloco: o foco fica no interruptor.
    document.getElementById('promocaoAtiva')?.focus()
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <CampoMoedaFormulario
          id="custo"
          label="Custo (opcional)"
          erro={errors.custo?.message}
          aoAlterar={aoAlterarCampo}
          disabled={desabilitado}
        />
        <CampoMoedaFormulario
          id="precoMinimo"
          label="Preço mínimo (opcional)"
          erro={errors.precoMinimo?.message}
          ajuda="Menor preço permitido na venda."
          aoAlterar={aoAlterarCampo}
          disabled={desabilitado}
        />
      </div>

      {/* Derivados: calculados a partir do preco e do custo, nunca digitados. */}
      <section aria-labelledby="derivados-titulo" className="space-y-2 rounded-md bg-muted/40 p-4">
        <h3 id="derivados-titulo" className="text-sm font-medium">
          Margem e markup
        </h3>
        {margemTexto || markupTexto ? (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {precoInformado && (
              <div>
                <dt className="text-muted-foreground">Preço de venda</dt>
                <dd className="font-semibold tabular-nums">{formatarMoeda(Number(precoVenda))}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Margem</dt>
              <dd className="font-semibold tabular-nums">{margemTexto ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Markup</dt>
              <dd className="font-semibold tabular-nums">{markupTexto ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Informe o preço de venda (aba Geral) e o custo para ver a margem.</p>
        )}
        {precoAbaixoDoCusto(precoVenda, custo) && (
          <p className="text-sm">
            <AvisoAbaixoDoCusto custo={Number(custo)} />
          </p>
        )}
      </section>

      <CalculoPelaMargem custo={custo} desabilitado={desabilitado} aoAlterarCampo={aoAlterarCampo} />

      <BlocoComInterruptor
        id="promocaoAtiva"
        rotulo="Ativar preço promocional"
        descricao="Vale automaticamente entre as datas de início e fim (inclusive)."
        desabilitado={desabilitado}
        aoAlternar={alternarPromocao}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <CampoMoedaFormulario
            id="precoPromocional"
            label="Preço promocional"
            erro={errors.precoPromocional?.message}
            ajuda={avisoDeCusto(precoPromocional, custo)}
            aoAlterar={aoAlterarCampo}
            disabled={desabilitado}
          />
          <CampoTexto
            id="promocaoInicio"
            label="Início"
            type="date"
            erro={errors.promocaoInicio?.message}
            inputProps={register('promocaoInicio', { onChange: aoAlterarCampo })}
            disabled={desabilitado}
          />
          <CampoTexto
            id="promocaoFim"
            label="Fim"
            type="date"
            erro={errors.promocaoFim?.message}
            inputProps={register('promocaoFim', { onChange: aoAlterarCampo })}
            disabled={desabilitado}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {situacao ? (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CLASSE_SELO[situacao])}>
              {textoSeloPromocao(situacao, promocaoInicio, promocaoFim)}
            </span>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 text-muted-foreground"
            onClick={removerPromocao}
            disabled={desabilitado}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Remover promoção
          </Button>
        </div>
      </BlocoComInterruptor>

      <BlocoComInterruptor
        id="atacadoAtivo"
        rotulo="Ativar preço de atacado"
        descricao="Preço menor para quem leva a partir de uma quantidade."
        desabilitado={desabilitado}
        aoAlternar={alternarAtacado}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <CampoMoedaFormulario
            id="precoAtacado"
            label="Preço de atacado"
            erro={errors.precoAtacado?.message}
            ajuda={avisoDeCusto(precoAtacado, custo)}
            aoAlterar={aoAlterarCampo}
            disabled={desabilitado}
          />
          <CampoTexto
            id="quantidadeMinimaAtacado"
            label={siglaVenda ? `A partir de (quantidade em ${siglaVenda})` : 'A partir de (quantidade)'}
            erro={errors.quantidadeMinimaAtacado?.message}
            inputProps={register('quantidadeMinimaAtacado', { onChange: aoAlterarCampo })}
            disabled={desabilitado}
            type="number"
            step="0.001"
            min="0"
            placeholder="Ex.: 12"
          />
        </div>
        {ajudaAtacado && <p className="text-sm text-muted-foreground">{ajudaAtacado}</p>}
      </BlocoComInterruptor>
    </div>
  )
}

interface CalculoPelaMargemProps {
  custo: string
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Por que o calculo nao pode ser feito; null quando pode. */
function motivoSemCalculo(custo: string, margem: string): string | null {
  if (!(Number(custo) > 0)) {
    return 'Informe o custo para calcular o preço.'
  }
  if (margem.trim() === '') {
    return 'Informe a margem desejada.'
  }
  return calcularPrecoPelaMargem(custo, margem) === null ? 'Use uma margem de 0 a 99,99%, com até 2 casas.' : null
}

/**
 * "Calcular preco pela margem" (spec 4.2): a margem desejada nao e gravada, so
 * gera o preco de venda, que passa a contar como alterado. Fica no estado da
 * aba (e um auxilio de calculo, nao um dado do produto).
 */
function CalculoPelaMargem({ custo, desabilitado, aoAlterarCampo }: CalculoPelaMargemProps) {
  const { setValue } = useFormContext<ProdutoFormValues>()
  const [margem, setMargem] = useState('')
  const [confirmacao, setConfirmacao] = useState<string | null>(null)
  const preco = calcularPrecoPelaMargem(custo, margem)
  const motivo = motivoSemCalculo(custo, margem)

  const calcular = () => {
    if (preco === null) {
      return
    }
    setValue('precoVenda', preco, { shouldDirty: true, shouldValidate: true })
    aoAlterarCampo()
    setConfirmacao(`Preço de venda atualizado para ${formatarMoeda(Number(preco))}.`)
  }

  return (
    <section aria-labelledby="margem-desejada-titulo" className="space-y-3 rounded-md bg-muted/40 p-4">
      <div>
        <h3 id="margem-desejada-titulo" className="text-sm font-medium">
          Calcular preço pela margem
        </h3>
        <p className="text-xs text-muted-foreground">O preço de venda é calculado a partir do custo e substitui o atual.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40 space-y-1.5">
          <label htmlFor="margemDesejada" className="text-sm font-medium">
            Margem desejada (%)
          </label>
          <Input
            id="margemDesejada"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 30"
            value={margem}
            onChange={(event) => {
              setMargem(event.target.value)
              setConfirmacao(null)
            }}
            disabled={desabilitado}
            aria-describedby={motivo ? 'margemDesejada-ajuda' : undefined}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={calcular}
          disabled={desabilitado || preco === null}
          aria-describedby={motivo ? 'margemDesejada-ajuda' : undefined}
        >
          Calcular preço
        </Button>
      </div>
      {motivo && (
        <p id="margemDesejada-ajuda" className="text-xs text-muted-foreground">
          {motivo}
        </p>
      )}
      <p role="status" className="text-sm">
        {confirmacao && (
          <span className="inline-flex items-center gap-1.5 text-success-soft-foreground">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {confirmacao}
          </span>
        )}
      </p>
    </section>
  )
}
