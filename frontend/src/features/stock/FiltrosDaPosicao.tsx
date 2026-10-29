import { useId, useState, type FormEvent } from 'react'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { ROTULOS_DA_SITUACAO_DO_FILTRO } from '@/features/products/estoque/situacaoDoFiltro'
import { SeletorCategoria } from '@/features/products/SeletorCategoria'
import { umDe } from '@/lib/listas'
import { cn } from '@/lib/utils'
import type { Categoria } from '@/types/catalogo'
import {
  ORDENS_POSICAO,
  SITUACOES_POSICAO,
  STATUS_POSICAO,
  type FiltrosDaPosicao as Filtros,
  type OrdemDaPosicao,
  type StatusDaPosicao,
} from '@/types/estoque'

const ROTULOS_DA_ORDEM: Record<OrdemDaPosicao, string> = {
  nome: 'Nome (A–Z)',
  '-nome': 'Nome (Z–A)',
  saldo: 'Menor saldo',
  '-saldo': 'Maior saldo',
  '-valor': 'Maior valor',
  valor: 'Menor valor',
}

const ROTULOS_DE_STATUS: Record<StatusDaPosicao, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
}

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

export interface FiltrosDaPosicaoProps {
  filtros: Filtros
  alterar: (parcial: Partial<Filtros>) => void
  aoLimpar: () => void
  temFiltroAtivo: boolean
  quantidadeDeFiltros: number
  textoBusca: string
  aoDigitarBusca: (texto: string) => void
  aoBuscarAgora: () => void
  buscando: boolean
  categorias: Categoria[]
  categoriaExibida: string | null
  erroNasCategorias: boolean
}

function Rotulo({ htmlFor, id, children }: { htmlFor?: string; id?: string; children: string }) {
  const classe = 'block text-sm font-medium'
  return htmlFor ? (
    <label htmlFor={htmlFor} className={classe}>
      {children}
    </label>
  ) : (
    <span id={id} className={classe}>
      {children}
    </span>
  )
}

/**
 * Barra de filtros da posicao, no padrao da lista de produtos: busca (sem
 * botao), Status, Categoria, Situacao e Ordenar por. No celular, os filtros
 * ficam num bloco que abre e fecha, com o numero de filtros ativos no botao.
 */
export function FiltrosDaPosicao({
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
}: FiltrosDaPosicaoProps) {
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
            Buscar produtos no estoque
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
            <span className="text-xs text-muted-foreground">{`Ordem: ${ROTULOS_DA_ORDEM[filtros.ordem]}`}</span>
          )}
        </div>
      </div>

      <div
        id={`${id}-filtros`}
        className={cn('gap-3 sm:grid-cols-2 md:grid md:grid-cols-4', abertoNoCelular ? 'grid' : 'hidden')}
      >
        <div className="space-y-1.5">
          <Rotulo htmlFor={`${id}-status`}>Status</Rotulo>
          <NativeSelect
            id={`${id}-status`}
            value={filtros.status}
            onChange={(event) => alterar({ status: umDe(STATUS_POSICAO, event.target.value) ?? 'ativos' })}
            className={ALTURA_DO_CONTROLE}
          >
            {STATUS_POSICAO.map((status) => (
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
          <Rotulo htmlFor={`${id}-situacao`}>Situação</Rotulo>
          <NativeSelect
            id={`${id}-situacao`}
            value={filtros.situacao ?? ''}
            onChange={(event) => alterar({ situacao: umDe(SITUACOES_POSICAO, event.target.value) })}
            className={ALTURA_DO_CONTROLE}
          >
            <option value="">Todas</option>
            {SITUACOES_POSICAO.map((situacao) => (
              <option key={situacao} value={situacao}>
                {ROTULOS_DA_SITUACAO_DO_FILTRO[situacao]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Rotulo htmlFor={`${id}-ordem`}>Ordenar por</Rotulo>
          <NativeSelect
            id={`${id}-ordem`}
            value={filtros.ordem}
            onChange={(event) => alterar({ ordem: umDe(ORDENS_POSICAO, event.target.value) ?? 'nome' })}
            className={ALTURA_DO_CONTROLE}
          >
            {ORDENS_POSICAO.map((ordem) => (
              <option key={ordem} value={ordem}>
                {ROTULOS_DA_ORDEM[ordem]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </div>
  )
}
