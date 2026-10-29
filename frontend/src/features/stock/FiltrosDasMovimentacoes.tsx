import { useId } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { ROTULO_MOTIVO } from '@/features/products/estoque/ajusteEstoque'
import {
  ATALHOS_DE_PERIODO,
  motivosDoFiltro,
  type AtalhoDePeriodo,
} from '@/features/stock/useFiltrosDasMovimentacoes'
import { umDe } from '@/lib/listas'
import { cn } from '@/lib/utils'
import type { FiltrosDasMovimentacoes as Filtros, TipoMovimento } from '@/types/estoque'
import type { Usuario } from '@/types/usuario'

/** Tipos como aparecem na linha do historico ("Ajuste" e a contagem). */
const ROTULOS_DO_TIPO: Record<TipoMovimento, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste (contagem)',
}
const TIPOS = Object.keys(ROTULOS_DO_TIPO) as TipoMovimento[]

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

/** Data completa do campo: vazia ou com o ano ainda sendo digitado (0002, 0020, 0202) nao vale. */
function dataCompleta(valor: string): boolean {
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)
}

export interface FiltrosDasMovimentacoesProps {
  filtros: Filtros
  alterar: (parcial: Partial<Filtros>) => void
  escolherAtalho: (atalho: AtalhoDePeriodo) => void
  atalho: AtalhoDePeriodo | null
  erroDoPeriodo: string | null
  hoje: string
  aoLimpar: () => void
  temFiltroAtivo: boolean
  /** Usuarios da empresa para o filtro; `undefined` esconde o filtro (so o ADMIN o ve). */
  usuarios: readonly Usuario[] | undefined
  carregandoUsuarios: boolean
  erroNosUsuarios: boolean
}

/**
 * Filtros da aba Movimentacoes (spec de Estoque, regra 26): o periodo, com os
 * atalhos Hoje, 7 dias e 30 dias e as duas datas, o tipo, o motivo (so os do
 * tipo escolhido) e, para o ADMIN, o usuario.
 */
export function FiltrosDasMovimentacoes({
  filtros,
  alterar,
  escolherAtalho,
  atalho,
  erroDoPeriodo,
  hoje,
  aoLimpar,
  temFiltroAtivo,
  usuarios,
  carregandoUsuarios,
  erroNosUsuarios,
}: FiltrosDasMovimentacoesProps) {
  const id = useId()
  const mostrarUsuario = usuarios !== undefined || carregandoUsuarios || erroNosUsuarios

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Período</legend>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div role="group" aria-label="Atalhos de período" className="flex gap-1 rounded-md bg-muted p-1">
            {ATALHOS_DE_PERIODO.map((opcao) => (
              <Button
                key={opcao.id}
                type="button"
                variant="ghost"
                aria-pressed={atalho === opcao.id}
                onClick={() => escolherAtalho(opcao.id)}
                className={cn(
                  'h-9 px-3 md:h-7',
                  atalho === opcao.id && 'bg-background text-foreground shadow-sm hover:bg-background',
                )}
              >
                {opcao.rotulo}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-de`} className="block text-xs text-muted-foreground">
                De
              </label>
              <Input
                id={`${id}-de`}
                type="date"
                value={filtros.de}
                max={hoje}
                aria-invalid={erroDoPeriodo !== null}
                aria-describedby={erroDoPeriodo ? `${id}-erro-periodo` : undefined}
                // Data apagada ou incompleta nao muda o filtro: o campo volta ao valor da URL.
                onChange={(event) => dataCompleta(event.target.value) && alterar({ de: event.target.value })}
                className={cn(ALTURA_DO_CONTROLE, 'w-40')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-ate`} className="block text-xs text-muted-foreground">
                Até
              </label>
              <Input
                id={`${id}-ate`}
                type="date"
                value={filtros.ate}
                max={hoje}
                aria-invalid={erroDoPeriodo !== null}
                aria-describedby={erroDoPeriodo ? `${id}-erro-periodo` : undefined}
                onChange={(event) => dataCompleta(event.target.value) && alterar({ ate: event.target.value })}
                className={cn(ALTURA_DO_CONTROLE, 'w-40')}
              />
            </div>
          </div>
        </div>
        {erroDoPeriodo && (
          <p id={`${id}-erro-periodo`} role="alert" className="text-sm text-destructive">
            {erroDoPeriodo}
          </p>
        )}
      </fieldset>

      <div className={cn('grid gap-3 sm:grid-cols-2', mostrarUsuario ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-tipo`} className="block text-sm font-medium">
            Tipo
          </label>
          <NativeSelect
            id={`${id}-tipo`}
            value={filtros.tipo ?? ''}
            onChange={(event) => alterar({ tipo: umDe(TIPOS, event.target.value) })}
            className={ALTURA_DO_CONTROLE}
          >
            <option value="">Todos</option>
            {TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULOS_DO_TIPO[tipo]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${id}-motivo`} className="block text-sm font-medium">
            Motivo
          </label>
          <NativeSelect
            id={`${id}-motivo`}
            value={filtros.motivo ?? ''}
            onChange={(event) => alterar({ motivo: umDe(motivosDoFiltro(filtros.tipo), event.target.value) })}
            className={ALTURA_DO_CONTROLE}
          >
            <option value="">Todos</option>
            {motivosDoFiltro(filtros.tipo).map((motivo) => (
              <option key={motivo} value={motivo}>
                {ROTULO_MOTIVO[motivo]}
              </option>
            ))}
          </NativeSelect>
        </div>

        {mostrarUsuario && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-usuario`} className="block text-sm font-medium">
              Usuário
            </label>
            <NativeSelect
              id={`${id}-usuario`}
              value={filtros.usuario === null ? '' : String(filtros.usuario)}
              disabled={carregandoUsuarios}
              onChange={(event) => alterar({ usuario: event.target.value ? Number(event.target.value) : null })}
              className={ALTURA_DO_CONTROLE}
            >
              <option value="">{carregandoUsuarios ? 'Carregando…' : 'Todos'}</option>
              {(usuarios ?? []).map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.ativo ? usuario.nome : `${usuario.nome} (inativo)`}
                </option>
              ))}
            </NativeSelect>
            {erroNosUsuarios && <p className="text-xs text-muted-foreground">Não foi possível carregar os usuários.</p>}
          </div>
        )}

        {temFiltroAtivo && (
          <div className="flex items-end">
            <Button type="button" variant="ghost" className={ALTURA_DO_CONTROLE} onClick={aoLimpar}>
              <X className="h-4 w-4" aria-hidden="true" />
              Limpar filtros
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
