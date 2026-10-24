import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { formatarPercentual } from '@/features/products/formatacaoProduto'
import { AcoesDoProduto } from '@/features/products/listagem/AcoesDoProduto'
import { identificacaoDoProduto } from '@/features/products/listagem/identificacaoDoProduto'
import { MiniaturaDoProduto } from '@/features/products/listagem/MiniaturaDoProduto'
import type { ListaDeProdutosProps } from '@/features/products/listagem/tipos'
import { EstoqueDoProduto, PrecoDoProduto, SemValor } from '@/features/products/listagem/ValoresDoProduto'
import { rotaDoProduto } from '@/features/products/navegacaoProdutos'
import { SeloStatus } from '@/features/products/SeloStatus'
import { cn } from '@/lib/utils'
import type { OrdemProdutos } from '@/types/produto'

/** Colunas ordenaveis: o valor ascendente da `ordem`; o descendente tem o `-` na frente. */
type ColunaOrdenavel = 'nome' | 'preco' | 'margem' | 'estoque'

function direcaoDa(coluna: ColunaOrdenavel, ordem: OrdemProdutos): 'ascending' | 'descending' | undefined {
  if (ordem === coluna) {
    return 'ascending'
  }
  if (ordem === `-${coluna}`) {
    return 'descending'
  }
  return undefined
}

/** Primeiro clique ordena ascendente; clicar de novo na mesma coluna inverte. */
function proximaOrdem(coluna: ColunaOrdenavel, ordem: OrdemProdutos): OrdemProdutos {
  return ordem === coluna ? `-${coluna}` : coluna
}

interface CabecalhoOrdenavelProps {
  coluna: ColunaOrdenavel
  ordem: OrdemProdutos
  aoOrdenar: (ordem: OrdemProdutos) => void
  alinharDireita?: boolean
  children: ReactNode
}

function CabecalhoOrdenavel({ coluna, ordem, aoOrdenar, alinharDireita, children }: CabecalhoOrdenavelProps) {
  const direcao = direcaoDa(coluna, ordem)
  const Icone = direcao === 'ascending' ? ArrowUp : direcao === 'descending' ? ArrowDown : ArrowUpDown
  return (
    <th scope="col" aria-sort={direcao} className={cn('px-3 py-2 font-medium', alinharDireita && 'text-right')}>
      <button
        type="button"
        onClick={() => aoOrdenar(proximaOrdem(coluna, ordem))}
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

export interface TabelaProdutosProps extends ListaDeProdutosProps {
  ordem: OrdemProdutos
  aoOrdenar: (ordem: OrdemProdutos) => void
  /** Id do titulo da lista (com o total), que nomeia a tabela. */
  idDoTitulo: string
}

/** Colunas secundarias: so a partir de 1.280 px, para a tabela caber sem rolagem entre 1.024 e 1.280 px. */
const SO_EM_TELA_LARGA = 'hidden xl:table-cell'

/**
 * Tabela da lista a partir de 1.024 px (abaixo, os cards), com rolagem lateral
 * se ainda faltar espaco. Os cabecalhos ordenaveis tem `aria-sort` e ficam
 * sincronizados com o select "Ordenar por".
 */
export function TabelaProdutos({
  produtos,
  somenteLeitura,
  estadoParaProduto,
  alterandoStatusId,
  aoAlterarStatus,
  aoAjustarEstoque,
  ordem,
  aoOrdenar,
  idDoTitulo,
}: TabelaProdutosProps) {
  const cabecalho = { ordem, aoOrdenar }
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table aria-labelledby={idDoTitulo} className="w-full text-sm">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            {/* Coluna estreita (w-px: so a largura do quadro) e sem padding a direita, para caber a 1.024 px. */}
            <th scope="col" className="w-px py-2 pr-0 pl-3">
              <span className="sr-only">Imagem</span>
            </th>
            <CabecalhoOrdenavel coluna="nome" {...cabecalho}>
              Nome
            </CabecalhoOrdenavel>
            <th scope="col" className={cn('px-3 py-2 font-medium', SO_EM_TELA_LARGA)}>
              Categoria
            </th>
            <th scope="col" className={cn('px-3 py-2 font-medium', SO_EM_TELA_LARGA)}>
              Unidade
            </th>
            <CabecalhoOrdenavel coluna="preco" alinharDireita {...cabecalho}>
              Preço
            </CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="margem" alinharDireita {...cabecalho}>
              Margem
            </CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="estoque" alinharDireita {...cabecalho}>
              Estoque
            </CabecalhoOrdenavel>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {produtos.map((produto) => {
            const detalhe = identificacaoDoProduto(produto)
            const margem = formatarPercentual(produto.margem)
            return (
              <tr key={produto.id} className="align-middle">
                <td className="w-px py-2 pr-0 pl-3">
                  <MiniaturaDoProduto imagem={produto.imagem} tamanho="tabela" />
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      to={rotaDoProduto(produto.id)}
                      state={estadoParaProduto}
                      className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
                    >
                      {produto.nome}
                    </Link>
                    {!produto.ativo && <SeloStatus ativo={false} />}
                  </div>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground tabular-nums">{detalhe}</p>
                </td>
                <td className={cn('px-3 py-3 text-muted-foreground', SO_EM_TELA_LARGA)}>
                  {produto.categoria ? produto.categoria.caminho : <SemValor motivo="Sem categoria" />}
                </td>
                <td className={cn('px-3 py-3 text-muted-foreground', SO_EM_TELA_LARGA)} title={produto.unidade.descricao}>
                  {produto.unidade.sigla}
                </td>
                <td className="px-3 py-3 text-right">
                  <PrecoDoProduto produto={produto} className="justify-end" />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{margem ?? <SemValor motivo="Sem custo" />}</td>
                <td className="px-3 py-3 text-right">
                  <EstoqueDoProduto produto={produto} className="justify-end" />
                </td>
                <td className="px-3 py-2">
                  <AcoesDoProduto
                    produto={produto}
                    somenteLeitura={somenteLeitura}
                    estadoParaProduto={estadoParaProduto}
                    alterandoStatus={alterandoStatusId === produto.id}
                    aoAlterarStatus={() => aoAlterarStatus(produto)}
                    aoAjustarEstoque={(origem) => aoAjustarEstoque(produto, origem)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
