import { useRef, useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Info, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CampoTexto, GrupoCampos } from '@/features/products/CamposFormulario'
import { ModalAjusteEstoque } from '@/features/products/estoque/ModalAjusteEstoque'
import { SeloSituacaoEstoque } from '@/features/products/estoque/SeloSituacaoEstoque'
import { mensagemDeSucesso } from '@/features/products/estoque/ajusteEstoque'
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import { fornecedorParaACompra } from '@/features/products/fornecedoresGravados'
import type { ProdutoFormValues } from '@/features/products/produtoFormulario'
import { conversaoEmEmbalagens, embalagemPrincipal } from '@/lib/embalagem'
import { interpretarQuantidade } from '@/lib/quantidade'
import type { FornecedorDoProduto, Produto } from '@/types/produto'

export interface SecaoEstoqueProps {
  /** Produto gravado (saldo e situacao); null no cadastro. */
  produto: Produto | null
  /** Sigla por id de unidade, para o estoque inicial ("em UN") e os niveis. */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  /** OPERADOR: ve o saldo, sem o botao de ajuste. */
  somenteLeitura: boolean
  aoAlterarCampo: () => void
  /** Ajuste gravado: a pagina mostra a mensagem (ex.: "Estoque atualizado: 10 UN."). */
  /** Ajuste gravado: a mensagem e, na compra com fornecedor, o fornecedor (a pagina o poe na lista). */
  aoAjustarEstoque: (mensagem: string, fornecedorDaCompra: FornecedorDoProduto | null) => void
}

/** Campos de nivel: texto com teclado decimal (aceitam virgula, como as demais quantidades). */
const NIVEIS = [
  { id: 'estoqueMinimo', nome: 'Estoque mínimo' },
  { id: 'pontoReposicao', nome: 'Ponto de reposição' },
  { id: 'estoqueMaximo', nome: 'Estoque máximo' },
] as const

const DICA_AJUSTE_BLOQUEADO = 'Salve as mudanças de controle, unidade ou embalagens antes de ajustar o estoque.'

/**
 * Embalagens do formulario no que muda o ajuste (lista, unidade e quantidade;
 * o preco nao conta), comparadas com as gravadas: o modal so conhece as salvas.
 */
function embalagensMudaram(atuais: ProdutoFormValues['embalagens'], gravadas: Produto['embalagens']): boolean {
  return (
    atuais.length !== gravadas.length ||
    atuais.some((atual, indice) => {
      const gravada = gravadas[indice]
      return (
        atual.id !== gravada.id ||
        atual.unidadeId !== gravada.unidade.id ||
        interpretarQuantidade(atual.quantidade) !== gravada.quantidade
      )
    })
  )
}

/**
 * Secao Estoque: o interruptor "Controlar estoque", o saldo atual (so leitura,
 * derivado das movimentacoes) ou, no cadastro, o estoque inicial, e os niveis
 * de referencia. As embalagens ficam na secao Embalagens. Com o controle desligado,
 * saldo e niveis saem da tela; os niveis voltam se tiverem erro, para o erro
 * nao ficar escondido.
 */
export function SecaoEstoque({
  produto,
  siglaPorId,
  desabilitado,
  somenteLeitura,
  aoAlterarCampo,
  aoAjustarEstoque,
}: SecaoEstoqueProps) {
  const {
    control,
    register,
    clearErrors,
    formState: { errors, dirtyFields },
  } = useFormContext<ProdutoFormValues>()
  const [ajustando, setAjustando] = useState(false)
  // Niveis que um erro mostrou com o controle desligado: ficam ate religar o controle (ou o
  // formulario recomecar), para o campo em edicao nao sumir quando o erro e corrigido.
  const [manterNiveis, setManterNiveis] = useState(false)
  const botaoAjustarRef = useRef<HTMLButtonElement>(null)
  const [controla, unidadeId] = useWatch({ control, name: ['controlaEstoque', 'unidadeId'] })
  const siglaVenda = siglaPorId.get(unidadeId)
  const erroNosNiveis = NIVEIS.some(({ id }) => errors[id] !== undefined)
  if (!controla && erroNosNiveis && !manterNiveis) {
    setManterNiveis(true)
  } else if (controla && manterNiveis) {
    setManterNiveis(false)
  }
  const mostrarNiveis = controla || erroNosNiveis || manterNiveis
  // So o que muda o sentido do saldo bloqueia o ajuste; nome, preco etc. continuam no formulario.
  // So o resultado da comparacao e observado: digitar um preco de embalagem nao renderiza a secao.
  const embalagensAlteradas = useWatch({
    control,
    name: 'embalagens',
    compute: (atuais) => produto !== null && embalagensMudaram(atuais, produto.embalagens),
  })
  const ajusteBloqueado = Boolean(dirtyFields.controlaEstoque || dirtyFields.unidadeId || embalagensAlteradas)
  // O saldo e da unidade gravada (produto com movimento nao troca de unidade).
  const saldoTexto = produto ? formatarQuantidade(produto.estoqueAtual, produto.unidade.sigla) : null
  // Com embalagem gravada, o saldo tambem em embalagens: "55 UN (18 CX + 1 UN)" (spec B3 §5.2).
  const principal = produto ? embalagemPrincipal(produto.embalagens) : undefined
  const saldoEmEmbalagens =
    produto && principal
      ? conversaoEmEmbalagens(
          produto.estoqueAtual,
          { sigla: principal.unidade.sigla, quantidade: principal.quantidade },
          produto.unidade.sigla,
          produto.unidade.fracionada,
        )
      : null
  // As embalagens gravadas (o ajuste vai para o servidor, que so conhece as salvas).
  const embalagensDoAjuste = (produto?.embalagens ?? []).map(({ id, rotulo, quantidade, deCompra }) => ({
    id,
    rotulo,
    quantidade,
    deCompra,
  }))
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
              <p className="text-2xl font-semibold tabular-nums">
                {saldoTexto}
                {saldoEmEmbalagens && (
                  <>
                    {' '}
                    <span className="text-base font-medium text-muted-foreground">{`(${saldoEmEmbalagens})`}</span>
                  </>
                )}
              </p>
              <SeloSituacaoEstoque situacao={produto.situacaoEstoque} />
            </div>
            {!somenteLeitura && (
              <div className="space-y-1 pt-2">
                {/* type="button": a secao fica dentro do formulario do produto. */}
                {/* aria-disabled (e nao disabled): o botao segue no Tab e a dica chega ao leitor de tela. */}
                <Button
                  ref={botaoAjustarRef}
                  type="button"
                  variant="outline"
                  className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  onClick={() => {
                    if (!ajusteBloqueado) {
                      setAjustando(true)
                    }
                  }}
                  disabled={desabilitado}
                  aria-disabled={ajusteBloqueado || undefined}
                  aria-describedby={ajusteBloqueado ? 'ajustar-estoque-dica' : undefined}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Ajustar estoque
                </Button>
                {ajusteBloqueado && (
                  <p id="ajustar-estoque-dica" className="text-xs text-muted-foreground">
                    {DICA_AJUSTE_BLOQUEADO}
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
            <span>{`Ao salvar, o saldo de ${saldoTexto} deixa de aparecer e de ser atualizado. Ele fica guardado e volta se você religar o controle.`}</span>
          </p>
        )}
      </GrupoCampos>

      {mostrarNiveis && (
        <section aria-labelledby="niveis-estoque-titulo" className="space-y-3">
          <div>
            <h3 id="niveis-estoque-titulo" className="text-sm font-medium">
              Níveis de referência
            </h3>
            <p className="text-xs text-muted-foreground">
              {controla
                ? 'O selo Estoque baixo aparece quando o saldo chega ao ponto de reposição (ou ao mínimo, se o ponto estiver vazio).'
                : 'Corrija ou apague estes valores para salvar.'}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {NIVEIS.map(({ id, nome }) => (
              <CampoTexto
                key={id}
                id={id}
                label={siglaVenda ? `${nome} em ${siglaVenda} (opcional)` : `${nome} (opcional)`}
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
          embalagens={embalagensDoAjuste}
          custo={produto.custo}
          fornecedorDaCompra={fornecedorParaACompra(produto)}
          aoFechar={() => setAjustando(false)}
          focoAoFechar={() => botaoAjustarRef.current}
          aoConcluir={(movimento, fornecedorDaCompra) => {
            setAjustando(false)
            aoAjustarEstoque(mensagemDeSucesso(movimento, produto.unidade.sigla, produto.custo), fornecedorDaCompra)
          }}
        />
      )}
    </div>
  )
}
