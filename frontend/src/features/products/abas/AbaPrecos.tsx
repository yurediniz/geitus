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
  GrupoCampos,
} from '@/features/products/CamposFormulario'
import { formatarMoeda, formatarPercentual } from '@/features/products/formatacaoProduto'
import {
  CAMPOS_ATACADO,
  CAMPOS_PROMOCAO,
  type CampoDeBloco,
  calcularMargemMarkup,
  calcularPrecoPelaMargem,
  dataHojeSaoPaulo,
  margemDesejadaValida,
  numeroValido,
  situacaoPromocaoLocal,
  textoAbaixoDoCusto,
  textoAjudaAtacado,
  textoSeloPromocao,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { cn } from '@/lib/utils'
import type { SituacaoPromocao } from '@/types/produto'

export interface AbaPrecosProps {
  /** Sigla por id de unidade, para "Quantidade mínima (UN)". */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Cor do selo por situacao; o texto diz a situacao (nunca so a cor). Vigente
 * usa o mesmo destaque do selo "Promoção" da listagem.
 */
const CLASSE_SELO: Readonly<Record<SituacaoPromocao, string>> = {
  VIGENTE: 'bg-accent text-accent-foreground',
  AGENDADA: 'bg-info-soft text-info-soft-foreground',
  ENCERRADA: 'bg-muted text-muted-foreground',
}

/** Foca um campo que acabou de aparecer (monta no render seguinte). */
function focarAoAparecer(id: string) {
  window.setTimeout(() => document.getElementById(id)?.focus(), 0)
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
  const idTitulo = `${id}-titulo`
  return (
    <GrupoCampos
      idTitulo={idTitulo}
      // O rotulo tambem alterna o interruptor.
      titulo={
        <label id={`${id}-rotulo`} htmlFor={id} className="cursor-pointer">
          {rotulo}
        </label>
      }
      descricao={descricao}
      acao={
        <Controller
          control={control}
          name={id}
          render={({ field }) => (
            <Switch
              id={id}
              aria-labelledby={`${id}-rotulo`}
              aria-describedby={`${idTitulo}-descricao`}
              ref={field.ref}
              checked={field.value}
              onCheckedChange={(valor) => {
                field.onChange(valor)
                aoAlternar(valor)
              }}
              onBlur={field.onBlur}
              disabled={desabilitado}
            />
          )}
        />
      }
    >
      {ligado && children}
    </GrupoCampos>
  )
}

/** Texto quando a margem nao pode ser calculada: o que falta informar. */
function textoSemMargem(precoVenda: string): string {
  return numeroValido(precoVenda) === null
    ? 'Informe o preço de venda na aba Geral para ver a margem.'
    : 'Informe o custo para ver a margem.'
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
    getValues,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()
  const [
    precoVenda,
    custo,
    unidadeId,
    promocaoAtiva,
    promocaoInicio,
    promocaoFim,
    atacadoAtivo,
    precoAtacado,
    quantidadeMinima,
  ] = watch([
    'precoVenda',
    'custo',
    'unidadeId',
    'promocaoAtiva',
    'promocaoInicio',
    'promocaoFim',
    'atacadoAtivo',
    'precoAtacado',
    'quantidadeMinimaAtacado',
  ])
  const { margem, markup } = calcularMargemMarkup(precoVenda, custo)
  const margemTexto = formatarPercentual(margem)
  const markupTexto = formatarPercentual(markup)
  const valorPrecoVenda = numeroValido(precoVenda)
  const avisoPrecoVenda = textoAbaixoDoCusto(precoVenda, custo)
  const siglaVenda = siglaPorId.get(unidadeId)

  const hoje = dataHojeSaoPaulo()
  const situacao = situacaoPromocaoLocal(promocaoInicio, promocaoFim, hoje)
  const ajudaAtacado = textoAjudaAtacado(quantidadeMinima, precoAtacado, siglaVenda)

  /** Desligar um bloco limpa os campos dele (o produto fica sem promocao ou sem atacado ao salvar). */
  const limparBloco = (campos: readonly CampoDeBloco[]) => {
    for (const campo of campos) {
      setValue(campo, '', { shouldDirty: true })
    }
    clearErrors([...campos])
  }

  // Ligar a promocao ja sugere o inicio hoje e leva ao preco promocional.
  const alternarPromocao = (ligado: boolean) => {
    if (!ligado) {
      limparBloco(CAMPOS_PROMOCAO)
    } else {
      if (getValues('promocaoInicio') === '') {
        setValue('promocaoInicio', hoje, { shouldDirty: true })
      }
      focarAoAparecer('precoPromocional')
    }
    aoAlterarCampo()
  }

  const alternarAtacado = (ligado: boolean) => {
    if (!ligado) {
      limparBloco(CAMPOS_ATACADO)
    } else {
      focarAoAparecer('precoAtacado')
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
      <GrupoCampos titulo="Margem e markup" idTitulo="derivados-titulo">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Preço de venda</dt>
            <dd className="font-semibold tabular-nums">{formatarMoeda(valorPrecoVenda)}</dd>
          </div>
          {(margemTexto || markupTexto) && (
            <>
              <div>
                <dt className="text-muted-foreground">Margem</dt>
                <dd className="font-semibold tabular-nums">{margemTexto ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Markup</dt>
                <dd className="font-semibold tabular-nums">{markupTexto ?? '—'}</dd>
              </div>
            </>
          )}
        </dl>
        {!margemTexto && !markupTexto && (
          <p className="text-sm text-muted-foreground">{textoSemMargem(precoVenda)}</p>
        )}
        {avisoPrecoVenda && (
          <p className="text-sm">
            <AvisoAbaixoDoCusto texto={avisoPrecoVenda} />
          </p>
        )}
      </GrupoCampos>

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
            custo={custo}
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
            min={promocaoInicio || undefined}
            erro={errors.promocaoFim?.message}
            inputProps={register('promocaoFim', { onChange: aoAlterarCampo })}
            disabled={desabilitado}
          />
        </div>
        {situacao && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CLASSE_SELO[situacao])}>
              {textoSeloPromocao(situacao, promocaoInicio, promocaoFim, hoje)}
            </span>
            {/* Encerrada continua gravada (so deixa de valer): aqui a saida e remove-la. */}
            {situacao === 'ENCERRADA' && (
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
            )}
          </div>
        )}
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
            custo={custo}
            aoAlterar={aoAlterarCampo}
            disabled={desabilitado}
          />
          <CampoTexto
            id="quantidadeMinimaAtacado"
            label={siglaVenda ? `Quantidade mínima (${siglaVenda})` : 'Quantidade mínima'}
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

      {/* Regra do PDV (spec 4.5): entre os precos que valem, o menor. */}
      {promocaoAtiva && atacadoAtivo && (
        <p className="text-sm text-muted-foreground">
          Se a promoção e o atacado valerem juntos, a venda usa o menor preço.
        </p>
      )}
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
  if (!margemDesejadaValida(margem)) {
    return 'Use uma margem entre 0 e 99,99% (até 2 casas decimais).'
  }
  return calcularPrecoPelaMargem(custo, margem) === null ? 'O preço calculado passa do limite permitido.' : null
}

/**
 * "Calcular preco pela margem" (spec 4.2): a margem desejada nao e gravada, so
 * gera o preco de venda, que passa a contar como alterado. Fica no estado da
 * aba (e um auxilio de calculo, nao um dado do produto).
 */
function CalculoPelaMargem({ custo, desabilitado, aoAlterarCampo }: CalculoPelaMargemProps) {
  const { setValue } = useFormContext<ProdutoFormValues>()
  const [margem, setMargem] = useState('')
  // A confirmacao guarda o custo usado: mudar o custo a esconde (o preco ja nao corresponde).
  const [confirmacao, setConfirmacao] = useState<{ texto: string; custo: string } | null>(null)
  const preco = calcularPrecoPelaMargem(custo, margem)
  const motivo = motivoSemCalculo(custo, margem)
  const margemInvalida = margem.trim() !== '' && !margemDesejadaValida(margem)

  const calcular = () => {
    if (preco === null) {
      return
    }
    setValue('precoVenda', preco, { shouldDirty: true, shouldValidate: true })
    aoAlterarCampo()
    const margemTexto = margem.trim().replace('.', ',')
    setConfirmacao({
      texto: `Preço de venda atualizado para ${formatarMoeda(Number(preco))} (margem de ${margemTexto}%).`,
      custo,
    })
  }

  return (
    <GrupoCampos
      titulo="Calcular preço pela margem"
      idTitulo="margem-desejada-titulo"
      descricao="O preço de venda é calculado a partir do custo e substitui o atual."
    >
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
            // Enter aqui calcula (nao salva o produto); Ctrl/Cmd+Enter segue para o formulario.
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault()
                calcular()
              }
            }}
            disabled={desabilitado}
            aria-invalid={margemInvalida ? true : undefined}
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
        {confirmacao && confirmacao.custo === custo && (
          <span className="inline-flex items-center gap-1.5 text-success-soft-foreground">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {confirmacao.texto}
          </span>
        )}
      </p>
    </GrupoCampos>
  )
}
