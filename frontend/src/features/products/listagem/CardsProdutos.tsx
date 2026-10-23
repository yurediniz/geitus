import { Link } from 'react-router-dom'

import { AcoesDoProduto } from '@/features/products/listagem/AcoesDoProduto'
import type { ListaDeProdutosProps } from '@/features/products/listagem/tipos'
import { EstoqueDoProduto, PrecoDoProduto } from '@/features/products/listagem/ValoresDoProduto'
import { rotaDoProduto } from '@/features/products/navegacaoProdutos'
import { SeloStatus } from '@/features/products/SeloStatus'
import type { Produto } from '@/types/produto'

/** Linha discreta do card: o SKU ou, sem ele, o primeiro codigo de barras ("789... (+2)"). */
function identificacao(produto: Produto): string | null {
  if (produto.sku) {
    return produto.sku
  }
  const [primeiro, ...demais] = produto.codigosBarras
  if (!primeiro) {
    return null
  }
  return demais.length > 0 ? `${primeiro.codigo} (+${demais.length})` : primeiro.codigo
}

/**
 * Cards da lista no celular e no tablet (abaixo de 1.024 px; acima, a tabela, so por CSS).
 * Enxutos: nome (link), marca, preco, estoque, o selo "Inativo" quando for o
 * caso, uma linha com SKU ou codigo e as acoes. O resto fica na pagina do produto.
 */
export function CardsProdutos({ produtos, alterandoStatusId, aoAlterarStatus, aoAjustarEstoque, ...props }: ListaDeProdutosProps) {
  return (
    <ul className="grid gap-3 lg:hidden">
      {produtos.map((produto) => {
        const linhaDiscreta = identificacao(produto)
        return (
          <li key={produto.id}>
            <article className="space-y-3 rounded-md border p-4">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 text-base font-medium">
                    <Link
                      to={rotaDoProduto(produto.id)}
                      state={props.estadoParaProduto}
                      className="underline-offset-4 outline-none hover:underline focus-visible:underline"
                    >
                      {produto.nome}
                    </Link>
                  </h3>
                  {!produto.ativo && <SeloStatus ativo={false} />}
                </div>
                {produto.marca && <p className="truncate text-sm text-muted-foreground">{produto.marca}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                <PrecoDoProduto produto={produto} />
                <span className="text-muted-foreground">
                  <EstoqueDoProduto produto={produto} />
                </span>
              </div>

              {linhaDiscreta && <p className="truncate text-xs text-muted-foreground">{linhaDiscreta}</p>}

              <AcoesDoProduto
                produto={produto}
                {...props}
                alterandoStatus={alterandoStatusId === produto.id}
                aoAlterarStatus={() => aoAlterarStatus(produto)}
                aoAjustarEstoque={(origem) => aoAjustarEstoque(produto, origem)}
              />
            </article>
          </li>
        )
      })}
    </ul>
  )
}
