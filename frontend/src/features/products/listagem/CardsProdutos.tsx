import type { ReactNode } from 'react'

import { formatarMoeda, formatarPercentual, formatarQuantidade } from '@/features/products/formatacaoProduto'
import { AcoesDoProduto } from '@/features/products/listagem/AcoesDoProduto'
import { EstoqueDoProduto, PrecoDoProduto } from '@/features/products/listagem/ValoresDoProduto'
import type { EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { SeloStatus } from '@/features/products/SeloStatus'
import type { Produto } from '@/types/produto'

export interface ListaDeProdutosProps {
  produtos: Produto[]
  somenteLeitura: boolean
  estadoParaProduto: EstadoParaProduto
  /** Produto com a troca de status em andamento. */
  alterandoStatusId: string | null
  aoAlterarStatus: (produto: Produto) => void
  aoAjustarEstoque: (produto: Produto, origem: HTMLElement) => void
}

/** "7891000315507" ou "7891000315507 (+2)" quando ha mais codigos. */
function textoCodigos(produto: Produto): string | null {
  const [primeiro, ...demais] = produto.codigosBarras
  if (!primeiro) {
    return null
  }
  return demais.length > 0 ? `${primeiro.codigo} (+${demais.length})` : primeiro.codigo
}

function Item({ rotulo, children, title }: { rotulo: string; children: ReactNode; title?: string }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{rotulo}</dt>
      <dd title={title}>{children}</dd>
    </div>
  )
}

/** Cards da lista no celular (abaixo de 768 px); acima disso a tabela assume (so CSS). */
export function CardsProdutos({ produtos, ...props }: ListaDeProdutosProps) {
  return (
    <ul className="grid gap-3 md:hidden">
      {produtos.map((produto) => (
        <li key={produto.id}>
          <CardProduto produto={produto} {...props} />
        </li>
      ))}
    </ul>
  )
}

function CardProduto({
  produto,
  somenteLeitura,
  estadoParaProduto,
  alterandoStatusId,
  aoAlterarStatus,
  aoAjustarEstoque,
}: Omit<ListaDeProdutosProps, 'produtos'> & { produto: Produto }) {
  // Sem controle de estoque, os niveis nao valem nada na tela (o saldo nem aparece).
  const mostrarNiveis = produto.controlaEstoque
  const margem = formatarPercentual(produto.margem)
  const markup = formatarPercentual(produto.markup)
  const codigos = textoCodigos(produto)
  const sigla = produto.unidade.sigla

  return (
    <article className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="truncate text-base font-medium">{produto.nome}</h3>
        {produto.marca && <span className="truncate text-sm text-muted-foreground">{produto.marca}</span>}
        <SeloStatus ativo={produto.ativo} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Item rotulo="Preço">
          <PrecoDoProduto produto={produto} />
        </Item>
        <Item rotulo="Estoque">
          <EstoqueDoProduto produto={produto} />
        </Item>
        {produto.custo !== null && <Item rotulo="Custo">{formatarMoeda(produto.custo)}</Item>}
        {margem && <Item rotulo="Margem">{margem}</Item>}
        {markup && <Item rotulo="Markup">{markup}</Item>}
        {produto.precoMinimo !== null && <Item rotulo="Preço mínimo">{formatarMoeda(produto.precoMinimo)}</Item>}
        {produto.sku && <Item rotulo="SKU">{produto.sku}</Item>}
        {codigos && <Item rotulo="Código de barras">{codigos}</Item>}
        {produto.categoria && <Item rotulo="Categoria">{produto.categoria.caminho}</Item>}
        <Item rotulo="Unidade" title={produto.unidade.descricao}>
          {sigla}
        </Item>
        {produto.conversaoTexto && <Item rotulo="Compra">{produto.conversaoTexto}</Item>}
        {mostrarNiveis && produto.estoqueMinimo !== null && (
          <Item rotulo="Estoque mínimo">{formatarQuantidade(produto.estoqueMinimo, sigla)}</Item>
        )}
        {mostrarNiveis && produto.estoqueMaximo !== null && (
          <Item rotulo="Estoque máximo">{formatarQuantidade(produto.estoqueMaximo, sigla)}</Item>
        )}
        {mostrarNiveis && produto.pontoReposicao !== null && (
          <Item rotulo="Ponto de reposição">{formatarQuantidade(produto.pontoReposicao, sigla)}</Item>
        )}
      </dl>

      <AcoesDoProduto
        produto={produto}
        somenteLeitura={somenteLeitura}
        estadoParaProduto={estadoParaProduto}
        alterandoStatus={alterandoStatusId === produto.id}
        aoAlterarStatus={() => aoAlterarStatus(produto)}
        aoAjustarEstoque={(origem) => aoAjustarEstoque(produto, origem)}
      />
    </article>
  )
}
