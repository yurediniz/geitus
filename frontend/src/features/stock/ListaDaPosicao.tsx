import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, PackagePlus, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SeloSituacaoEstoque } from '@/features/products/estoque/SeloSituacaoEstoque'
import { formatarMoeda, formatarQuantidade } from '@/features/products/formatacaoProduto'
import { SemValor } from '@/features/products/listagem/ValoresDoProduto'
import { rotaDoProduto, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { SeloStatus } from '@/features/products/SeloStatus'
import { conversaoEmEmbalagens } from '@/lib/embalagem'
import { cn } from '@/lib/utils'
import type { OrdemDaPosicao, PosicaoDeEstoque, TipoMovimento } from '@/types/estoque'

export interface ListaDaPosicaoProps {
  itens: readonly PosicaoDeEstoque[]
  somenteLeitura: boolean
  estadoParaProduto: EstadoParaProduto
  /** "Ajustar" abre na Entrada; "Regularizar" (saldo negativo), na Contagem. */
  aoAjustar: (item: PosicaoDeEstoque, tipo: TipoMovimento, origem: HTMLElement) => void
}

/** "Nº 15 · Cód. 542" (o codigo sai so quando existe). */
function identificacao(item: PosicaoDeEstoque): string {
  return item.codigo === null ? `Nº ${item.numero}` : `Nº ${item.numero} · Cód. ${item.codigo}`
}

/** "Mín. 5 · Ponto 10 · Máx. 50", com os niveis informados; null sem nenhum. */
function niveis(item: PosicaoDeEstoque): string | null {
  const partes = [
    item.estoqueMinimo !== null && `Mín. ${item.estoqueMinimo.toLocaleString('pt-BR')}`,
    item.pontoReposicao !== null && `Ponto ${item.pontoReposicao.toLocaleString('pt-BR')}`,
    item.estoqueMaximo !== null && `Máx. ${item.estoqueMaximo.toLocaleString('pt-BR')}`,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : null
}

/** Saldo "55 UN", a conversao "18 CX + 1 UN" (com embalagem) e o selo da situacao. */
function SaldoDoItem({ item, className }: { item: PosicaoDeEstoque; className?: string }) {
  const conversao =
    item.embalagemPrincipal &&
    conversaoEmEmbalagens(item.saldo, item.embalagemPrincipal, item.unidade.sigla, item.unidade.fracionada)
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span className={cn('tabular-nums', item.saldo < 0 && 'font-medium text-destructive')}>
        {formatarQuantidade(item.saldo, item.unidade.sigla)}
      </span>
      {conversao && <span className="text-xs text-muted-foreground tabular-nums">({conversao})</span>}
      <SeloSituacaoEstoque situacao={item.situacao} saldo={item.saldo} />
    </span>
  )
}

function ValorDoItem({ item }: { item: PosicaoDeEstoque }) {
  if (item.valorEmCusto !== null) {
    return <span className="tabular-nums">{formatarMoeda(item.valorEmCusto)}</span>
  }
  return <SemValor motivo={item.custo === null ? 'Sem custo' : 'Sem saldo'} />
}

function AcoesDoItem({ item, somenteLeitura, aoAjustar }: Pick<ListaDaPosicaoProps, 'somenteLeitura' | 'aoAjustar'> & { item: PosicaoDeEstoque }) {
  if (somenteLeitura) {
    return null
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {item.saldo < 0 && (
        <Button
          type="button"
          size="sm"
          className="h-11 md:h-8"
          aria-label={`Regularizar o estoque de ${item.nome}`}
          onClick={(event) => aoAjustar(item, 'AJUSTE', event.currentTarget)}
        >
          <Scale className="h-4 w-4" aria-hidden="true" />
          Regularizar
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 md:h-8"
        aria-label={`Ajustar o estoque de ${item.nome}`}
        onClick={(event) => aoAjustar(item, 'ENTRADA', event.currentTarget)}
      >
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
        Ajustar
      </Button>
    </div>
  )
}

function NomeDoItem({ item, estadoParaProduto }: { item: PosicaoDeEstoque; estadoParaProduto: EstadoParaProduto }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        to={rotaDoProduto(item.id)}
        state={estadoParaProduto}
        className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
      >
        {item.nome}
      </Link>
      {!item.ativo && <SeloStatus ativo={false} />}
    </div>
  )
}

/** Colunas ordenaveis: o valor ascendente da `ordem`; o descendente tem o `-` na frente. */
type ColunaOrdenavel = 'nome' | 'saldo' | 'valor'

function direcaoDa(coluna: ColunaOrdenavel, ordem: OrdemDaPosicao): 'ascending' | 'descending' | undefined {
  if (ordem === coluna) {
    return 'ascending'
  }
  return ordem === `-${coluna}` ? 'descending' : undefined
}

function CabecalhoOrdenavel({
  coluna,
  ordem,
  aoOrdenar,
  alinharDireita,
  children,
}: {
  coluna: ColunaOrdenavel
  ordem: OrdemDaPosicao
  aoOrdenar: (ordem: OrdemDaPosicao) => void
  alinharDireita?: boolean
  children: ReactNode
}) {
  const direcao = direcaoDa(coluna, ordem)
  const Icone = direcao === 'ascending' ? ArrowUp : direcao === 'descending' ? ArrowDown : ArrowUpDown
  return (
    <th scope="col" aria-sort={direcao} className={cn('px-3 py-2 font-medium', alinharDireita && 'text-right')}>
      <button
        type="button"
        // Primeiro clique ordena ascendente; clicar de novo na mesma coluna inverte.
        onClick={() => aoOrdenar(ordem === coluna ? `-${coluna}` : coluna)}
        className={cn(
          '-mx-2 inline-flex h-9 items-center gap-1 rounded-md px-2 outline-none hover:bg-muted hover:text-foreground',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
          direcao && 'text-foreground',
        )}
      >
        {children}
        <Icone className={cn('h-3.5 w-3.5', !direcao && 'opacity-40')} aria-hidden="true" />
      </button>
    </th>
  )
}

const SO_EM_TELA_LARGA = 'hidden xl:table-cell'

/** Tabela da posicao a partir de 1.024 px (abaixo, os cards), com cabecalhos ordenaveis sincronizados com o select. */
export function TabelaDaPosicao({
  itens,
  somenteLeitura,
  estadoParaProduto,
  aoAjustar,
  ordem,
  aoOrdenar,
  idDoTitulo,
}: ListaDaPosicaoProps & { ordem: OrdemDaPosicao; aoOrdenar: (ordem: OrdemDaPosicao) => void; idDoTitulo: string }) {
  const cabecalho = { ordem, aoOrdenar }
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table aria-labelledby={idDoTitulo} className="w-full text-sm">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <CabecalhoOrdenavel coluna="nome" {...cabecalho}>
              Produto
            </CabecalhoOrdenavel>
            <th scope="col" className={cn('px-3 py-2 font-medium', SO_EM_TELA_LARGA)}>
              Categoria
            </th>
            <CabecalhoOrdenavel coluna="saldo" alinharDireita {...cabecalho}>
              Saldo
            </CabecalhoOrdenavel>
            <th scope="col" className={cn('px-3 py-2 font-medium', SO_EM_TELA_LARGA)}>
              Níveis
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Custo
            </th>
            <CabecalhoOrdenavel coluna="valor" alinharDireita {...cabecalho}>
              Valor
            </CabecalhoOrdenavel>
            {!somenteLeitura && (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {itens.map((item) => (
            <tr key={item.id} className="align-middle">
              <td className="px-3 py-3">
                <NomeDoItem item={item} estadoParaProduto={estadoParaProduto} />
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{identificacao(item)}</p>
              </td>
              <td className={cn('px-3 py-3 text-muted-foreground', SO_EM_TELA_LARGA)}>
                {item.categoria ? item.categoria.caminho : <SemValor motivo="Sem categoria" />}
              </td>
              <td className="px-3 py-3 text-right">
                <SaldoDoItem item={item} className="justify-end" />
              </td>
              <td className={cn('px-3 py-3 text-xs text-muted-foreground tabular-nums', SO_EM_TELA_LARGA)}>
                {niveis(item) ?? <SemValor motivo="Sem níveis" />}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {item.custo !== null ? formatarMoeda(item.custo) : <SemValor motivo="Sem custo" />}
              </td>
              <td className="px-3 py-3 text-right">
                <ValorDoItem item={item} />
              </td>
              {!somenteLeitura && (
                <td className="px-3 py-2">
                  <AcoesDoItem item={item} somenteLeitura={somenteLeitura} aoAjustar={aoAjustar} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Cards da posicao abaixo de 1.024 px: nome, saldo com selo, custo e valor, niveis e as acoes. */
export function CardsDaPosicao({ itens, somenteLeitura, estadoParaProduto, aoAjustar }: ListaDaPosicaoProps) {
  return (
    <ul className="grid gap-3 lg:hidden">
      {itens.map((item) => {
        const textoDosNiveis = niveis(item)
        return (
          <li key={item.id}>
            <article className="space-y-3 rounded-md border p-4">
              <div className="space-y-0.5">
                <h3 className="text-base">
                  <NomeDoItem item={item} estadoParaProduto={estadoParaProduto} />
                </h3>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {item.categoria ? `${identificacao(item)} · ${item.categoria.caminho}` : identificacao(item)}
                </p>
              </div>

              <SaldoDoItem item={item} className="text-sm" />

              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Custo</dt>
                  <dd className="tabular-nums">
                    {item.custo !== null ? formatarMoeda(item.custo) : <SemValor motivo="Sem custo" />}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd>
                    <ValorDoItem item={item} />
                  </dd>
                </div>
              </dl>
              {textoDosNiveis && <p className="text-xs text-muted-foreground tabular-nums">{textoDosNiveis}</p>}

              <AcoesDoItem item={item} somenteLeitura={somenteLeitura} aoAjustar={aoAjustar} />
            </article>
          </li>
        )
      })}
    </ul>
  )
}
