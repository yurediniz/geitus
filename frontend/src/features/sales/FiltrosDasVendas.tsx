import { useEffect, useId, useState } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { STATUS_DO_FILTRO, type FiltrosDaTelaDeVendas as Filtros } from '@/features/sales/useFiltrosDasVendas'
import { ATALHOS_DE_PERIODO, type AtalhoDePeriodo } from '@/features/stock/useFiltrosDasMovimentacoes'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { umDe } from '@/lib/listas'
import { cn } from '@/lib/utils'
import type { PontoDeCaixa } from '@/types/caixa'
import type { StatusDaVenda } from '@/types/pdv'
import type { Usuario } from '@/types/usuario'

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

const ROTULO_DO_STATUS: Readonly<Record<StatusDaVenda, string>> = {
  CONCLUIDA: 'Concluídas',
  CANCELADA: 'Canceladas',
}

/** Data completa do campo: vazia ou com o ano ainda sendo digitado (0002, 0020, 0202) nao vale. */
function dataCompleta(valor: string): boolean {
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)
}

export interface FiltrosDasVendasProps {
  filtros: Filtros
  alterar: (parcial: Partial<Filtros>, opcoes?: { substituir?: boolean }) => void
  escolherAtalho: (atalho: AtalhoDePeriodo) => void
  atalho: AtalhoDePeriodo | null
  erroDoPeriodo: string | null
  hoje: string
  aoLimpar: () => void
  temFiltroAtivo: boolean
  /** Pontos e usuarios para os filtros do ADMIN; `undefined` esconde o filtro. */
  pontos: readonly PontoDeCaixa[] | undefined
  usuarios: readonly Usuario[] | undefined
  carregandoUsuarios: boolean
  erroNosUsuarios: boolean
}

/**
 * Filtros da tela Vendas: o periodo (atalhos Hoje, 7 dias e 30 dias e as duas
 * datas), a situacao, o numero da venda (que procura em qualquer data) e, para
 * o ADMIN, o caixa e o vendedor.
 */
export function FiltrosDasVendas({
  filtros,
  alterar,
  escolherAtalho,
  atalho,
  erroDoPeriodo,
  hoje,
  aoLimpar,
  temFiltroAtivo,
  pontos,
  usuarios,
  carregandoUsuarios,
  erroNosUsuarios,
}: FiltrosDasVendasProps) {
  const id = useId()
  const [numero, setNumero] = useState(filtros.numero)
  // O campo acompanha o numero da URL quando ele muda de fora (Limpar filtros, Voltar do navegador).
  const [numeroDaUrl, setNumeroDaUrl] = useState(filtros.numero)
  if (filtros.numero !== numeroDaUrl) {
    setNumeroDaUrl(filtros.numero)
    setNumero(filtros.numero)
  }
  const numeroDigitado = numero.replace(/\D/g, '').slice(0, 9)
  const numeroComAtraso = useBuscaComAtraso(numeroDigitado, 300)
  useEffect(() => {
    // So vale o atraso que corresponde ao campo: depois de "Limpar filtros", o valor antigo ainda em espera e ignorado.
    if (numeroComAtraso === numeroDigitado && numeroComAtraso !== filtros.numero) {
      alterar({ numero: numeroComAtraso }, { substituir: true })
    }
  }, [numeroComAtraso, numeroDigitado, filtros.numero, alterar])

  const porNumero = filtros.numero !== ''
  const mostrarVendedor = usuarios !== undefined || carregandoUsuarios || erroNosUsuarios

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" aria-describedby={porNumero ? `${id}-qualquer-data` : undefined}>
        <legend className="text-sm font-medium">Período</legend>
        <div className={cn('flex flex-wrap items-end gap-x-4 gap-y-3', porNumero && 'opacity-50')}>
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
                onChange={(event) => dataCompleta(event.target.value) && alterar({ de: event.target.value, numero: '' })}
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
                onChange={(event) => dataCompleta(event.target.value) && alterar({ ate: event.target.value, numero: '' })}
                className={cn(ALTURA_DO_CONTROLE, 'w-40')}
              />
            </div>
          </div>
        </div>
        {porNumero ? (
          <p id={`${id}-qualquer-data`} className="text-xs text-muted-foreground">
            Buscando em todas as datas. Apague o número para filtrar pelo período.
          </p>
        ) : (
          erroDoPeriodo && (
            <p id={`${id}-erro-periodo`} role="alert" className="text-sm text-destructive">
              {erroDoPeriodo}
            </p>
          )
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-numero`} className="block text-sm font-medium">
            Nº da venda
          </label>
          <Input
            id={`${id}-numero`}
            value={numero}
            aria-describedby={porNumero ? `${id}-qualquer-data` : undefined}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Qualquer"
            onChange={(event) => setNumero(event.target.value)}
            className={ALTURA_DO_CONTROLE}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${id}-status`} className="block text-sm font-medium">
            Situação
          </label>
          <NativeSelect
            id={`${id}-status`}
            value={filtros.status ?? ''}
            onChange={(event) => alterar({ status: umDe(STATUS_DO_FILTRO, event.target.value) })}
            className={ALTURA_DO_CONTROLE}
          >
            <option value="">Todas</option>
            {STATUS_DO_FILTRO.map((status) => (
              <option key={status} value={status}>
                {ROTULO_DO_STATUS[status]}
              </option>
            ))}
          </NativeSelect>
        </div>

        {pontos !== undefined && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-ponto`} className="block text-sm font-medium">
              Caixa
            </label>
            <NativeSelect
              id={`${id}-ponto`}
              value={filtros.pontoId ?? ''}
              onChange={(event) => alterar({ pontoId: event.target.value || null })}
              className={ALTURA_DO_CONTROLE}
            >
              <option value="">Todos</option>
              {pontos.map((ponto) => (
                <option key={ponto.id} value={ponto.id}>
                  {ponto.ativo ? ponto.nome : `${ponto.nome} (inativo)`}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}

        {mostrarVendedor && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-vendedor`} className="block text-sm font-medium">
              Vendedor
            </label>
            <NativeSelect
              id={`${id}-vendedor`}
              value={filtros.vendedorId === null ? '' : String(filtros.vendedorId)}
              disabled={carregandoUsuarios}
              onChange={(event) => alterar({ vendedorId: event.target.value ? Number(event.target.value) : null })}
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
      </div>

      {temFiltroAtivo && (
        <Button type="button" variant="ghost" className={cn(ALTURA_DO_CONTROLE, '-ml-3')} onClick={aoLimpar}>
          <X className="h-4 w-4" aria-hidden="true" />
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
