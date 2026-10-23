import { useId, useState, type FormEvent } from 'react'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SeletorCategoria } from '@/features/products/SeletorCategoria'
import { cn } from '@/lib/utils'
import type { Categoria } from '@/types/catalogo'
import type { EstoqueFiltro, FiltrosDaListaDeProdutos, OrdemProdutos, StatusFiltro } from '@/types/produto'

const OPCOES_DE_ORDEM: readonly { valor: OrdemProdutos; rotulo: string }[] = [
  { valor: 'nome', rotulo: 'Nome (A–Z)' },
  { valor: '-nome', rotulo: 'Nome (Z–A)' },
  { valor: 'preco', rotulo: 'Menor preço' },
  { valor: '-preco', rotulo: 'Maior preço' },
  { valor: '-margem', rotulo: 'Maior margem' },
  { valor: 'margem', rotulo: 'Menor margem' },
  { valor: '-estoque', rotulo: 'Maior estoque' },
  { valor: 'estoque', rotulo: 'Menor estoque' },
  { valor: 'recentes', rotulo: 'Mais recentes' },
  { valor: 'atualizados', rotulo: 'Atualizados recentemente' },
]

const OPCOES_DE_STATUS: readonly { valor: StatusFiltro; rotulo: string }[] = [
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'inativos', rotulo: 'Inativos' },
  { valor: 'todos', rotulo: 'Todos' },
]

/** Valor vazio do select de estoque = sem filtro. */
const OPCOES_DE_ESTOQUE: readonly { valor: EstoqueFiltro | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'baixo', rotulo: 'Estoque baixo' },
  { valor: 'sem', rotulo: 'Sem estoque' },
]

function umDe<T extends string>(opcoes: readonly { valor: T | '' }[], valor: string): T | null {
  return opcoes.find((opcao) => opcao.valor !== '' && opcao.valor === valor)?.valor || null
}

export interface FiltrosProdutosProps {
  filtros: FiltrosDaListaDeProdutos
  alterar: (parcial: Partial<FiltrosDaListaDeProdutos>) => void
  limpar: () => void
  temFiltroAtivo: boolean
  /** Texto do campo de busca (local: a URL so recebe depois do atraso ou no Enter). */
  textoBusca: string
  aoDigitarBusca: (texto: string) => void
  /** Enter no campo: aplica a busca na hora. */
  aoBuscarAgora: () => void
  buscando: boolean
  categorias: Categoria[]
  /** Categoria mostrada no seletor: null ("Todas") quando a da URL nao existe mais. */
  categoriaExibida: string | null
}

/**
 * Barra de filtros da lista: busca (sem botao), status, categoria, estoque,
 * "Só em promoção" e ordem. No celular, os filtros ficam num bloco que abre e
 * fecha, com o numero de filtros ativos no botao.
 */
export function FiltrosProdutos({
  filtros,
  alterar,
  limpar,
  temFiltroAtivo,
  textoBusca,
  aoDigitarBusca,
  aoBuscarAgora,
  buscando,
  categorias,
  categoriaExibida,
}: FiltrosProdutosProps) {
  const id = useId()
  const [abertoNoCelular, setAbertoNoCelular] = useState(false)
  const quantidadeDeFiltros = [
    filtros.status !== 'ativos',
    filtros.categoria !== null,
    filtros.estoque !== null,
    filtros.promocao,
  ].filter(Boolean).length

  const buscarAgora = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    aoBuscarAgora()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form role="search" onSubmit={buscarAgora} className="relative min-w-0 flex-1 basis-64">
          <label htmlFor={`${id}-busca`} className="sr-only">
            Buscar produtos
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${id}-busca`}
            type="search"
            value={textoBusca}
            onChange={(event) => aoDigitarBusca(event.target.value)}
            placeholder="Buscar por nome, SKU, marca ou código de barras"
            autoComplete="off"
            className={cn('h-11 pl-9 md:h-9', buscando && 'pr-28')}
          />
          <span
            aria-live="polite"
            className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs text-muted-foreground"
          >
            {buscando && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Buscando…</span>
              </>
            )}
          </span>
        </form>

        {temFiltroAtivo && (
          <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={limpar}>
            <X className="h-4 w-4" aria-hidden="true" />
            Limpar filtros
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-11 md:hidden"
          aria-expanded={abertoNoCelular}
          aria-controls={`${id}-filtros`}
          onClick={() => setAbertoNoCelular((aberto) => !aberto)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {quantidadeDeFiltros > 0 ? `Filtros (${quantidadeDeFiltros})` : 'Filtros'}
        </Button>
      </div>

      <div
        id={`${id}-filtros`}
        className={cn(
          'gap-3 sm:grid-cols-2 md:grid md:grid-cols-3 lg:grid-cols-5',
          abertoNoCelular ? 'grid' : 'hidden',
        )}
      >
        <div className="space-y-1.5">
          <label htmlFor={`${id}-status`} className="text-sm font-medium">
            Status
          </label>
          <NativeSelect
            id={`${id}-status`}
            value={filtros.status}
            onChange={(event) => alterar({ status: umDe(OPCOES_DE_STATUS, event.target.value) ?? 'ativos' })}
            className="h-11 md:h-9"
          >
            {OPCOES_DE_STATUS.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <span id={`${id}-categoria-rotulo`} className="block text-sm font-medium">
            Categoria
          </span>
          <SeletorCategoria
            id={`${id}-categoria`}
            idRotulo={`${id}-categoria-rotulo`}
            categorias={categorias}
            valor={categoriaExibida}
            onChange={(categoria) => alterar({ categoria })}
            podeCriar={false}
            incluirInativas
            rotuloSemValor="Todas"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${id}-estoque`} className="text-sm font-medium">
            Estoque
          </label>
          <NativeSelect
            id={`${id}-estoque`}
            value={filtros.estoque ?? ''}
            onChange={(event) => alterar({ estoque: umDe(OPCOES_DE_ESTOQUE, event.target.value) })}
            className="h-11 md:h-9"
          >
            {OPCOES_DE_ESTOQUE.map((opcao) => (
              <option key={opcao.valor || 'todos'} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${id}-ordem`} className="text-sm font-medium">
            Ordenar por
          </label>
          <NativeSelect
            id={`${id}-ordem`}
            value={filtros.ordem}
            onChange={(event) => alterar({ ordem: umDe(OPCOES_DE_ORDEM, event.target.value) ?? 'nome' })}
            className="h-11 md:h-9"
          >
            {OPCOES_DE_ORDEM.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex items-end">
          <label className="flex h-11 cursor-pointer items-center gap-2 text-sm font-medium md:h-9">
            <input
              type="checkbox"
              checked={filtros.promocao}
              onChange={(event) => alterar({ promocao: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            Só em promoção
          </label>
        </div>
      </div>
    </div>
  )
}
