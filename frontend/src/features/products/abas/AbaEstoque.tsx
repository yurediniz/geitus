import { useRef, useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { Info, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CampoTexto, GrupoCampos } from '@/features/products/CamposFormulario'
import { ModalAjusteEstoque } from '@/features/products/estoque/ModalAjusteEstoque'
import { SeloSituacaoEstoque } from '@/features/products/estoque/SeloSituacaoEstoque'
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import type { ProdutoFormValues } from '@/features/products/produtoFormulario'
import type { Produto } from '@/types/produto'

export interface AbaEstoqueProps {
  /** Produto gravado (saldo e situacao); null no cadastro. */
  produto: Produto | null
  /** Sigla por id de unidade, para o estoque inicial ("em UN"). */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  /** OPERADOR: ve o saldo, sem o botao de ajuste. */
  somenteLeitura: boolean
  aoAlterarCampo: () => void
  /** Ajuste gravado: a pagina mostra a mensagem (ex.: "Estoque atualizado: 10 UN."). */
  aoAjustarEstoque: (mensagem: string) => void
}

/** Campos de nivel: texto com teclado decimal (aceitam virgula, como as demais quantidades). */
const NIVEIS = [
  { id: 'estoqueMinimo', label: 'Estoque mínimo (opcional)' },
  { id: 'pontoReposicao', label: 'Ponto de reposição (opcional)' },
  { id: 'estoqueMaximo', label: 'Estoque máximo (opcional)' },
] as const

/**
 * Aba Estoque: o interruptor "Controlar estoque", o saldo atual (so leitura,
 * derivado das movimentacoes) ou, no cadastro, o estoque inicial, e os niveis
 * de referencia. Com o controle desligado, saldo e niveis saem da tela; os
 * niveis voltam se tiverem erro, para o erro nao ficar escondido.
 */
export function AbaEstoque({
  produto,
  siglaPorId,
  desabilitado,
  somenteLeitura,
  aoAlterarCampo,
  aoAjustarEstoque,
}: AbaEstoqueProps) {
  const {
    control,
    register,
    watch,
    clearErrors,
    formState: { errors, isDirty },
  } = useFormContext<ProdutoFormValues>()
  const [ajustando, setAjustando] = useState(false)
  const botaoAjustarRef = useRef<HTMLButtonElement>(null)
  const [controla, unidadeId] = watch(['controlaEstoque', 'unidadeId'])
  const siglaVenda = siglaPorId.get(unidadeId)
  const erroNosNiveis = NIVEIS.some(({ id }) => errors[id] !== undefined)
  // O saldo e da unidade gravada (produto com movimento nao troca de unidade).
  const saldoTexto = produto ? formatarQuantidade(produto.estoqueAtual, produto.unidade.sigla) : null
  const avisarSaldoGuardado = produto !== null && produto.controlaEstoque && !controla && produto.estoqueAtual > 0

  return (
    <div className="space-y-6">
      <GrupoCampos
        idTitulo="controlaEstoque-titulo"
        titulo={
          <label id="controlaEstoque-rotulo" htmlFor="controlaEstoque" className="cursor-pointer">
            Controlar estoque
          </label>
        }
        descricao="O saldo muda só por movimentações (entradas, saídas e contagens), sempre com histórico."
        acao={
          <Controller
            control={control}
            name="controlaEstoque"
            render={({ field }) => (
              <Switch
                id="controlaEstoque"
                aria-labelledby="controlaEstoque-rotulo"
                aria-describedby="controlaEstoque-titulo-descricao"
                ref={field.ref}
                checked={field.value}
                onCheckedChange={(valor) => {
                  field.onChange(valor)
                  if (!valor) {
                    clearErrors('estoqueInicial')
                  }
                  aoAlterarCampo()
                }}
                onBlur={field.onBlur}
                disabled={desabilitado}
              />
            )}
          />
        }
      >
        {controla && produto && saldoTexto && (
          <div role="group" aria-labelledby="saldo-atual-rotulo" className="space-y-1">
            <p id="saldo-atual-rotulo" className="text-sm text-muted-foreground">
              Saldo atual
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold tabular-nums">{saldoTexto}</p>
              <SeloSituacaoEstoque situacao={produto.situacaoEstoque} />
            </div>
            {!somenteLeitura && (
              <div className="space-y-1 pt-2">
                {/* type="button": a aba fica dentro do formulario do produto. */}
                <Button
                  ref={botaoAjustarRef}
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setAjustando(true)}
                  // Com alteracoes pendentes, o ajuste esperaria um formulario que ainda nao foi salvo.
                  disabled={desabilitado || isDirty}
                  aria-describedby={isDirty ? 'ajustar-estoque-dica' : undefined}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Ajustar estoque
                </Button>
                {isDirty && (
                  <p id="ajustar-estoque-dica" className="text-xs text-muted-foreground">
                    Salve o produto antes de ajustar o estoque.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {controla && !produto && (
          <div className="max-w-xs">
            <CampoTexto
              id="estoqueInicial"
              label="Estoque inicial (opcional)"
              erro={errors.estoqueInicial?.message}
              ajuda={
                siglaVenda
                  ? `Quantidade em ${siglaVenda} que você já tem. Entra como a primeira movimentação.`
                  : 'Quantidade que você já tem. Entra como a primeira movimentação.'
              }
              inputProps={register('estoqueInicial', { onChange: aoAlterarCampo })}
              disabled={desabilitado}
              inputMode="decimal"
            />
          </div>
        )}
        {avisarSaldoGuardado && saldoTexto && (
          <p role="status" className="flex items-start gap-2 text-sm text-warning-soft-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{`O saldo atual de ${saldoTexto} fica guardado e volta se você religar o controle.`}</span>
          </p>
        )}
      </GrupoCampos>

      {(controla || erroNosNiveis) && (
        <section aria-labelledby="niveis-estoque-titulo" className="space-y-3">
          <div>
            <h3 id="niveis-estoque-titulo" className="text-sm font-medium">
              Níveis de referência
            </h3>
            <p className="text-xs text-muted-foreground">
              Avisam quando o estoque está baixo. O ponto de reposição fica entre o mínimo e o máximo.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {NIVEIS.map(({ id, label }) => (
              <CampoTexto
                key={id}
                id={id}
                label={label}
                erro={errors[id]?.message}
                inputProps={register(id, { onChange: aoAlterarCampo })}
                disabled={desabilitado}
                inputMode="decimal"
              />
            ))}
          </div>
        </section>
      )}
      {produto && !somenteLeitura && (
        <ModalAjusteEstoque
          aberto={ajustando}
          produtoId={produto.id}
          saldo={produto.estoqueAtual}
          sigla={produto.unidade.sigla}
          fracionada={produto.unidade.fracionada}
          aoFechar={() => setAjustando(false)}
          focoAoFechar={() => botaoAjustarRef.current}
          aoConcluir={(movimento) => {
            setAjustando(false)
            aoAjustarEstoque(`Estoque atualizado: ${formatarQuantidade(movimento.saldoNovo, produto.unidade.sigla)}.`)
          }}
        />
      )}
    </div>
  )
}
