import { useId, useState, type FormEvent } from 'react'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FiltroMultiplo } from '@/components/ui/filtro-multiplo'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { OPCOES_DA_SITUACAO_DO_FILTRO } from '@/features/products/estoque/situacaoDoFiltro'
import { SeletorCategoria } from '@/features/products/SeletorCategoria'
import { umDe } from '@/lib/listas'
import { cn } from '@/lib/utils'
import type { Categoria } from '@/types/catalogo'
import {
  ORDENS_PRODUTOS,
  STATUS_FILTRO,
  type FiltrosDaListaDeProdutos,
  type OrdemProdutos,
  type StatusFiltro,
} from '@/types/produto'

const ROTULOS_DE_ORDEM: Record<OrdemProdutos, string> = {
  nome: 'Nome (A–Z)',
  '-nome': 'Nome (Z–A)',
  preco: 'Menor preço',
  '-preco': 'Maior preço',
  '-margem': 'Maior margem',
  margem: 'Menor margem',
  '-estoque': 'Maior estoque',
  estoque: 'Menor estoque',
  recentes: 'Mais recentes',
  atualizados: 'Atualizados recentemente',
}

const ROTULOS_DE_STATUS: Record<StatusFiltro, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
}

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

export interface FiltrosProdutosProps {
  filtros: FiltrosDaListaDeProdutos
  alterar: (parcial: Partial<FiltrosDaListaDeProdutos>) => void
  /** Limpa os filtros (e o texto da busca que ainda estiver pendente). */
  aoLimpar: () => void
  temFiltroAtivo: boolean
  /** Filtros ativos fora a busca (numero do botao "Filtros" no celular). */
  quantidadeDeFiltros: number
  /** Texto do campo de busca (local: a URL so recebe depois do atraso ou no Enter). */
  textoBusca: string
  aoDigitarBusca: (texto: string) => void
  /** Enter no campo: aplica a busca na hora. */
  aoBuscarAgora: () => void
  buscando: boolean
  categorias: Categoria[]
  /** Categoria mostrada no seletor: null ("Todas") quando a da URL nao existe mais. */
  categoriaExibida: string | null
  /** As categorias nao carregaram: o seletor fica com a da URL e aparece um aviso. */
  erroNasCategorias: boolean
}

/** Rotulo de um controle da barra (o atributo marca a ordem dos controles). */
function Rotulo({ htmlFor, id, children }: { htmlFor?: string; id?: string; children: string }) {
  const classe = 'block text-sm font-medium'
  return htmlFor ? (
    <label htmlFor={htmlFor} className={classe} data-rotulo-filtro>
      {children}
    </label>
  ) : (
    <span id={id} className={classe} data-rotulo-filtro>
      {children}
    </span>
  )
}

/**
 * Barra de filtros da lista: busca (sem botao), Status, Categoria, Estoque,
 * "Só em promoção" e, por ultimo, Ordenar por. No celular, os filtros ficam
 * num bloco que abre e fecha, com o numero de filtros ativos no botao e a
 * ordem atual ao lado quando nao for a padrao.
 */
export function FiltrosProdutos({
  filtros,
  alterar,
  aoLimpar,
  temFiltroAtivo,
  quantidadeDeFiltros,
  textoBusca,
  aoDigitarBusca,
  aoBuscarAgora,
  buscando,
  categorias,
  categoriaExibida,
  erroNasCategorias,
}: FiltrosProdutosProps) {
  const id = useId()
  const [abertoNoCelular, setAbertoNoCelular] = useState(false)

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
            placeholder="Nome, SKU, marca ou código"
            autoComplete="off"
            // Espaco fixo para o "Buscando…" (o campo nao muda de largura) e sem o "x" nativo.
            className={cn(ALTURA_DO_CONTROLE, 'pl-9 pr-28 [&::-webkit-search-cancel-button]:appearance-none')}
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
          <Button type="button" variant="ghost" className={ALTURA_DO_CONTROLE} onClick={aoLimpar}>
            <X className="h-4 w-4" aria-hidden="true" />
            Limpar filtros
          </Button>
        )}

        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            aria-expanded={abertoNoCelular}
            aria-controls={`${id}-filtros`}
            onClick={() => setAbertoNoCelular((aberto) => !aberto)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {quantidadeDeFiltros > 0 ? `Filtros (${quantidadeDeFiltros})` : 'Filtros'}
          </Button>
          {filtros.ordem !== 'nome' && (
            <span className="text-xs text-muted-foreground md:hidden">{`Ordem: ${ROTULOS_DE_ORDEM[filtros.ordem]}`}</span>
          )}
        </div>
      </div>

      <div
        id={`${id}-filtros`}
        className={cn('gap-3 sm:grid-cols-2 md:grid md:grid-cols-3 lg:grid-cols-5', abertoNoCelular ? 'grid' : 'hidden')}
      >
        <div className="space-y-1.5">
          <Rotulo htmlFor={`${id}-status`}>Status</Rotulo>
          <NativeSelect
            id={`${id}-status`}
            value={filtros.status}
            onChange={(event) => alterar({ status: umDe(STATUS_FILTRO, event.target.value) ?? 'ativos' })}
            className={ALTURA_DO_CONTROLE}
          >
            {STATUS_FILTRO.map((status) => (
              <option key={status} value={status}>
                {ROTULOS_DE_STATUS[status]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Rotulo id={`${id}-categoria-rotulo`}>Categoria</Rotulo>
          <SeletorCategoria
            id={`${id}-categoria`}
            idRotulo={`${id}-categoria-rotulo`}
            categorias={categorias}
            valor={categoriaExibida}
            onChange={(categoria) => alterar({ categoria })}
            podeCriar={false}
            incluirInativas
            rotuloSemValor="Todas"
            className={ALTURA_DO_CONTROLE}
          />
          {erroNasCategorias && (
            <p className="text-xs text-muted-foreground">Não foi possível carregar as categorias.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Rotulo id={`${id}-estoque-rotulo`}>Estoque</Rotulo>
          <FiltroMultiplo
            id={`${id}-estoque`}
            idRotulo={`${id}-estoque-rotulo`}
            opcoes={OPCOES_DA_SITUACAO_DO_FILTRO}
            valores={filtros.estoque}
            onChange={(estoque) => alterar({ estoque })}
            rotuloTodos="Todos"
            className={ALTURA_DO_CONTROLE}
          />
        </div>

        <div className="flex items-end">
          <label className="flex h-11 cursor-pointer items-center gap-2 text-sm font-medium md:h-9">
            <input
              type="checkbox"
              checked={filtros.promocao}
              onChange={(event) => alterar({ promocao: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <span data-rotulo-filtro>Só em promoção</span>
          </label>
        </div>

        <div className="space-y-1.5">
          <Rotulo htmlFor={`${id}-ordem`}>Ordenar por</Rotulo>
          <NativeSelect
            id={`${id}-ordem`}
            value={filtros.ordem}
            onChange={(event) => alterar({ ordem: umDe(ORDENS_PRODUTOS, event.target.value) ?? 'nome' })}
            className={ALTURA_DO_CONTROLE}
          >
            {ORDENS_PRODUTOS.map((ordem) => (
              <option key={ordem} value={ordem}>
                {ROTULOS_DE_ORDEM[ordem]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </div>
  )
}
