import { useState, type ReactNode } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { CheckCircle2, ChevronDown, X } from 'lucide-react'

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
import { notaDaOrigemDoCusto } from '@/features/products/origemDoCusto'
import {
  CAMPOS_ATACADO,
  CAMPOS_PROMOCAO,
  type CampoDeBloco,
  calcularMargemMarkup,
  calcularPrecoPelaMargem,
  calcularPrecoPeloMarkup,
  dataHojeSaoPaulo,
  margemDesejadaValida,
  markupDesejadoValido,
  numeroValido,
  situacaoPromocaoLocal,
  textoAbaixoDoCusto,
  textoAjudaAtacado,
  textoSeloPromocao,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { cn } from '@/lib/utils'
import type { Produto, SituacaoPromocao } from '@/types/produto'

export interface SecaoPrecosProps {
  /** Produto gravado (custo e a origem dele, para a nota abaixo do campo); null no cadastro. */
  produto: Produto | null
  /**
   * Custo de uma entrada por compra registrada com o campo Custo ja alterado na
   * tela (o valor digitado ficou); null sem isso.
   */
  custoDaCompraNaoAplicado?: number | null
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
  const { control } = useFormContext<ProdutoFormValues>()
  const ligado = useWatch({ control, name: id })
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

interface MargemEMarkupDoPrecoProps {
  /** Nome do preco, para o grupo acessivel (ex.: "preço promocional"). */
  nome: string
  preco: string
  custo: string
}

/**
 * Margem e markup de um preco especial (promocional ou de atacado), calculados
 * sobre o custo como os do preco de venda (spec de Produtos). Sem custo ou preco, "—".
 */
function MargemEMarkupDoPreco({ nome, preco, custo }: MargemEMarkupDoPrecoProps) {
  const { margem, markup } = calcularMargemMarkup(preco, custo)
  return (
    <dl role="group" aria-label={`Margem e markup do ${nome}`} className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted-foreground">Margem</dt>
        <dd className="font-semibold tabular-nums">{formatarPercentual(margem) ?? '—'}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted-foreground">Markup</dt>
        <dd className="font-semibold tabular-nums">{formatarPercentual(markup) ?? '—'}</dd>
      </div>
    </dl>
  )
}

/**
 * O que sao margem e markup, com o mesmo exemplo para os dois (spec de Produtos).
 * Sempre visivel em tela larga; no celular, recolhida atras de um botao.
 */
function ExplicacaoMargemMarkup() {
  const [aberta, setAberta] = useState(false)
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls="explicacao-margem-markup"
        onClick={() => setAberta((valor) => !valor)}
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        O que são margem e markup?
        <ChevronDown className={cn('h-4 w-4 transition-transform', aberta && 'rotate-180')} aria-hidden="true" />
      </button>
      <div
        id="explicacao-margem-markup"
        className={cn('space-y-1 text-xs text-muted-foreground md:block', aberta ? 'block' : 'hidden')}
      >
        <p>
          <span className="font-medium text-foreground">Margem:</span> quanto do preço de venda é lucro, (preço − custo)
          ÷ preço. Vender a R$ 15,00 algo que custou R$ 10,00 dá 33,33%.
        </p>
        <p>
          <span className="font-medium text-foreground">Markup:</span> quanto se acrescenta sobre o custo, (preço −
          custo) ÷ custo. O mesmo exemplo dá 50%.
        </p>
      </div>
    </div>
  )
}

/**
 * O que acontece ao salvar com o campo Custo diferente do gravado: se uma
 * entrada por compra mudou o custo depois que o campo foi alterado, que vale o
 * valor do campo; senao, que o custo passa a contar como editado manualmente.
 * Null com o campo igual ao gravado.
 */
function textoDoCustoAlterado(
  custoDoCampo: string,
  custoGravado: number | null,
  custoDaCompraNaoAplicado: number | null,
): string | null {
  const doCampo = numeroValido(custoDoCampo)
  const centavos = (valor: number | null) => (valor === null ? null : Math.round(valor * 100))
  if (centavos(doCampo) === centavos(custoGravado)) {
    return null
  }
  return custoDaCompraNaoAplicado === null
    ? 'Ao salvar, o custo passa a contar como editado manualmente.'
    : `A entrada de compra mudou o custo para ${formatarMoeda(custoDaCompraNaoAplicado)}. Ao salvar, vale o valor deste campo.`
}

/** Ajuda do campo Custo: a nota da origem e, com o campo alterado, o aviso do que salvar faz. */
function AjudaDoCusto({ nota, aviso }: { nota: string | null; aviso: string | null }) {
  return (
    <>
      {nota && <span className="block">{nota}</span>}
      {nota && aviso && ' '}
      {aviso && <span className="block font-medium text-warning-soft-foreground">{aviso}</span>}
    </>
  )
}

/** Texto quando a margem nao pode ser calculada: o que falta informar. */
function textoSemMargem(precoVenda: string): string {
  return numeroValido(precoVenda) === null
    ? 'Informe o preço de venda em Geral para ver a margem.'
    : 'Informe o custo para ver a margem.'
}

/**
 * Secao Precos: custo e preco minimo, margem/markup derivados, o preco pela
 * margem desejada e os blocos opcionais de promocao e atacado. O preco de
 * venda e essencial e fica na secao Geral (cadastro rapido); aqui so aparece
 * como referencia.
 */
export function SecaoPrecos({
  produto,
  custoDaCompraNaoAplicado = null,
  siglaPorId,
  desabilitado,
  aoAlterarCampo,
}: SecaoPrecosProps) {
  const {
    control,
    register,
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
    precoPromocional,
    promocaoInicio,
    promocaoFim,
    atacadoAtivo,
    precoAtacado,
    quantidadeMinima,
  ] = useWatch({
    control,
    name: [
      'precoVenda',
      'custo',
      'unidadeId',
      'promocaoAtiva',
      'precoPromocional',
      'promocaoInicio',
      'promocaoFim',
      'atacadoAtivo',
      'precoAtacado',
      'quantidadeMinimaAtacado',
    ],
  })
  const { margem, markup } = calcularMargemMarkup(precoVenda, custo)
  const margemTexto = formatarPercentual(margem)
  const markupTexto = formatarPercentual(markup)
  const valorPrecoVenda = numeroValido(precoVenda)
  const avisoPrecoVenda = textoAbaixoDoCusto(precoVenda, custo)
  const siglaVenda = siglaPorId.get(unidadeId)
  // De onde veio o custo gravado (spec de Estoque): vem do backend, entao so muda depois de salvar ou ajustar.
  const notaDoCusto = produto ? notaDaOrigemDoCusto(produto.custo, produto.custoOrigem, produto.unidade.sigla) : null
  const avisoDoCusto = produto ? textoDoCustoAlterado(custo, produto.custo, custoDaCompraNaoAplicado) : null

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
          // Sem nota nem aviso, sem ajuda (o campo fica sem descricao).
          ajuda={notaDoCusto || avisoDoCusto ? <AjudaDoCusto nota={notaDoCusto} aviso={avisoDoCusto} /> : undefined}
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
        <ExplicacaoMargemMarkup />
      </GrupoCampos>

      <CalculadoraDePreco
        custo={custo}
        precoVenda={precoVenda}
        desabilitado={desabilitado}
        aoAlterarCampo={aoAlterarCampo}
      />

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
        <MargemEMarkupDoPreco nome="preço promocional" preco={precoPromocional} custo={custo} />
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
        <MargemEMarkupDoPreco nome="preço de atacado" preco={precoAtacado} custo={custo} />
        {ajudaAtacado && <p className="text-sm text-muted-foreground">{ajudaAtacado}</p>}
      </BlocoComInterruptor>

      {/* Regra do PDV (spec de Produtos): entre os precos que valem, o menor. */}
      {promocaoAtiva && atacadoAtivo && (
        <p className="text-sm text-muted-foreground">
          Se a promoção e o atacado valerem juntos, a venda usa o menor preço.
        </p>
      )}
    </div>
  )
}

/** Base da calculadora: a margem (sobre o preco) ou o markup (sobre o custo). */
type BaseDoCalculo = 'margem' | 'markup'

const REGRA_DA_BASE: Readonly<
  Record<
    BaseDoCalculo,
    {
      rotulo: string
      opcao: string
      vazio: string
      invalido: string
      valido: (percentual: string) => boolean
      calcular: (custo: string, percentual: string) => string | null
    }
  >
> = {
  margem: {
    rotulo: 'Margem desejada (%)',
    opcao: 'Pela margem',
    vazio: 'Informe a margem desejada.',
    invalido: 'A margem vai até 99,99%: 100% significaria custo zero.',
    valido: margemDesejadaValida,
    calcular: calcularPrecoPelaMargem,
  },
  markup: {
    rotulo: 'Markup desejado (%)',
    opcao: 'Pelo markup',
    vazio: 'Informe o markup desejado.',
    invalido: 'Informe um markup de 0% a 9.999,99%, com até 2 casas (ex.: 45,5).',
    valido: markupDesejadoValido,
    calcular: calcularPrecoPeloMarkup,
  },
}

interface CalculadoraDePrecoProps {
  custo: string
  /** Preco de venda atual: editado a mao, a confirmacao do calculo sai da tela. */
  precoVenda: string
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/** Por que o calculo nao pode ser feito; null quando pode. */
function motivoSemCalculo(base: BaseDoCalculo, custo: string, percentual: string): string | null {
  const regra = REGRA_DA_BASE[base]
  if (!(Number(custo) > 0)) {
    return 'Informe o custo para calcular o preço.'
  }
  if (percentual.trim() === '') {
    return regra.vazio
  }
  if (!regra.valido(percentual)) {
    return regra.invalido
  }
  return regra.calcular(custo, percentual) === null ? 'O preço calculado passa do limite permitido.' : null
}

/**
 * Calculadora do preco de venda (spec de Produtos), pela margem ou pelo markup
 * desejado: o percentual nao e gravado, so gera o preco de venda, que passa a
 * contar como alterado. Fica no estado da secao (e um auxilio de calculo, nao
 * um dado do produto).
 */
function CalculadoraDePreco({ custo, precoVenda, desabilitado, aoAlterarCampo }: CalculadoraDePrecoProps) {
  const { setValue } = useFormContext<ProdutoFormValues>()
  const [base, setBase] = useState<BaseDoCalculo>('margem')
  const [percentual, setPercentual] = useState('')
  // A confirmacao guarda o custo usado e o preco gerado: mudar o custo ou editar o preco a mao a esconde.
  const [confirmacao, setConfirmacao] = useState<{ texto: string; custo: string; preco: string } | null>(null)
  const regra = REGRA_DA_BASE[base]
  const preco = regra.calcular(custo, percentual)
  const motivo = motivoSemCalculo(base, custo, percentual)
  const percentualInvalido = percentual.trim() !== '' && !regra.valido(percentual)

  const calcular = () => {
    if (preco === null) {
      return
    }
    setValue('precoVenda', preco, { shouldDirty: true, shouldValidate: true })
    aoAlterarCampo()
    const percentualTexto = percentual.trim().replace('.', ',')
    setConfirmacao({
      texto: `Preço de venda atualizado para ${formatarMoeda(Number(preco))} (${base} de ${percentualTexto}%).`,
      custo,
      preco,
    })
  }

  return (
    <GrupoCampos
      titulo="Calculadora de preço"
      idTitulo="calculadora-preco-titulo"
      descricao="O preço de venda é calculado a partir do custo e substitui o atual."
    >
      <fieldset className="space-y-1.5" disabled={desabilitado}>
        <legend className="text-sm font-medium">Calcular</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(REGRA_DA_BASE) as BaseDoCalculo[]).map((opcao) => (
            <label
              key={opcao}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm has-[:checked]:border-primary has-[:checked]:font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
            >
              <input
                type="radio"
                name="baseDoCalculo"
                value={opcao}
                checked={base === opcao}
                onChange={() => {
                  setBase(opcao)
                  setConfirmacao(null)
                }}
                className="accent-primary"
              />
              {REGRA_DA_BASE[opcao].opcao}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44 space-y-1.5">
          <label htmlFor="percentualDesejado" className="text-sm font-medium">
            {regra.rotulo}
          </label>
          <Input
            id="percentualDesejado"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 30"
            value={percentual}
            onChange={(event) => {
              setPercentual(event.target.value)
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
            aria-invalid={percentualInvalido ? true : undefined}
            aria-describedby={motivo ? 'percentualDesejado-ajuda' : undefined}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={calcular}
          disabled={desabilitado || preco === null}
          aria-describedby={motivo ? 'percentualDesejado-ajuda' : undefined}
        >
          Calcular preço
        </Button>
      </div>
      {motivo && (
        <p id="percentualDesejado-ajuda" className="text-xs text-muted-foreground">
          {motivo}
        </p>
      )}
      <p role="status" className="text-sm">
        {confirmacao && confirmacao.custo === custo && confirmacao.preco === precoVenda && (
          <span className="inline-flex items-center gap-1.5 text-success-soft-foreground">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {confirmacao.texto}
          </span>
        )}
      </p>
    </GrupoCampos>
  )
}
