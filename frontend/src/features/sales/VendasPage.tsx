import { useId, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import { chaveDosPontos } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { formatarDataHoraCaixa, formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { ImpressaoDoComprovante } from '@/features/pdv/ImpressaoDoComprovante'
import { chaveDasVendas } from '@/features/pdv/pdvQuery'
import { SelosDaVenda } from '@/features/pdv/SelosDaVenda'
import { FiltrosDasVendas } from '@/features/sales/FiltrosDasVendas'
import { JanelaDaVendaDaTela } from '@/features/sales/JanelaDaVendaDaTela'
import { filtrosDaApi, useFiltrosDasVendas } from '@/features/sales/useFiltrosDasVendas'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { listarPontos } from '@/services/caixaService'
import { listarVendas } from '@/services/pdvService'
import { listarUsuarios } from '@/services/usuarioService'
import type { Venda, VendaResumo } from '@/types/pdv'
import type { Usuario } from '@/types/usuario'

/** Os usuarios do filtro "Vendedor" (so ADMIN), com os inativos, que tambem venderam. */
const USUARIOS_DO_FILTRO_QUERY_KEY = ['usuarios', 'filtro-das-vendas'] as const

function formas(venda: VendaResumo): string {
  return venda.pagamentos.map((pagamento) => ROTULO_DA_FORMA[pagamento.forma]).join(' + ')
}

/**
 * Vendas (/vendas, spec do PDV): todas as vendas que o usuario pode ver, da
 * mais recente para a mais antiga, com periodo (padrao hoje), situacao,
 * numero (em qualquer data) e, para o ADMIN, caixa e vendedor, tudo na URL,
 * paginadas no servidor. O OPERADOR ve so as proprias (o backend filtra). A
 * venda abre numa janela com o detalhe do F8.
 */
export function VendasPage() {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'ADMIN'
  const { filtros, alterar, limpar, escolherAtalho, atalho, erroDoPeriodo, temFiltroAtivo, hoje } =
    useFiltrosDasVendas(ehAdmin)
  const [vendaAberta, setVendaAberta] = useState<{ id: string; numero: number } | null>(null)
  const [vendaParaImprimir, setVendaParaImprimir] = useState<Venda | null>(null)
  const linhaQueAbriu = useRef<HTMLElement | null>(null)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const idTitulo = useId()

  const porNumero = filtros.numero !== ''
  const podeConsultar = porNumero || erroDoPeriodo === null
  const pedido = filtrosDaApi(filtros)

  const pontos = useQuery({ queryKey: chaveDosPontos(), queryFn: () => listarPontos(), enabled: ehAdmin })
  const usuarios = useQuery<Usuario[]>({
    queryKey: USUARIOS_DO_FILTRO_QUERY_KEY,
    queryFn: () => listarUsuarios(),
    enabled: ehAdmin,
  })
  const consulta = useQuery({
    queryKey: chaveDasVendas(pedido),
    queryFn: ({ signal }) => listarVendas(pedido, signal),
    placeholderData: keepPreviousData,
    enabled: podeConsultar,
  })

  const abrir = (venda: VendaResumo, origem: HTMLElement) => {
    linhaQueAbriu.current = origem
    setVendaAberta({ id: venda.id, numero: venda.numero })
  }

  const mudarPagina = (proxima: number) => {
    alterar({ pagina: proxima })
    tituloRef.current?.scrollIntoView?.({ block: 'start' })
    tituloRef.current?.focus({ preventScroll: true })
  }

  const conteudo = () => {
    if (!podeConsultar) {
      return <Vazio mensagem="Corrija o período para ver as vendas." aoLimpar={limpar} />
    }
    if (consulta.isPending) {
      return <CarregandoCaixa rotulo="Carregando as vendas" linhas={5} />
    }
    if (consulta.isError && !consulta.data) {
      return <ErroAoCarregar mensagem="Não foi possível carregar as vendas." aoTentarDeNovo={() => consulta.refetch()} />
    }
    const pagina = consulta.data
    if (pagina.itens.length === 0) {
      return (
        <Vazio
          mensagem={porNumero ? `Nenhuma venda nº ${filtros.numero}.` : 'Nenhuma venda neste período.'}
          aoLimpar={temFiltroAtivo ? limpar : undefined}
        />
      )
    }
    return (
      <div
        aria-busy={consulta.isPlaceholderData}
        className={cn('space-y-4 transition-opacity duration-150', consulta.isPlaceholderData && 'opacity-60')}
      >
        <TabelaDasVendas vendas={pagina.itens} idTitulo={idTitulo} aoAbrir={abrir} />
        <CardsDasVendas vendas={pagina.itens} aoAbrir={abrir} />
        <PaginacaoLista
          pagina={filtros.pagina}
          total={pagina.totalItens}
          tamanho={pagina.tamanho}
          aoMudar={mudarPagina}
          className="border-t pt-4"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {ehAdmin
            ? 'Todas as vendas da empresa, da mais recente para a mais antiga.'
            : 'As vendas que você fez, da mais recente para a mais antiga.'}
        </p>
      </div>

      <Card>
        <CardContent>
          <FiltrosDasVendas
            filtros={filtros}
            alterar={alterar}
            escolherAtalho={escolherAtalho}
            atalho={atalho}
            erroDoPeriodo={erroDoPeriodo}
            hoje={hoje}
            aoLimpar={limpar}
            temFiltroAtivo={temFiltroAtivo}
            pontos={ehAdmin ? (pontos.data ?? []) : undefined}
            usuarios={ehAdmin ? usuarios.data : undefined}
            carregandoUsuarios={ehAdmin && usuarios.isPending}
            erroNosUsuarios={ehAdmin && usuarios.isError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2
            id={idTitulo}
            ref={tituloRef}
            tabIndex={-1}
            className="scroll-mt-4 font-display font-semibold leading-none outline-none"
          >
            {consulta.data && podeConsultar
              ? `${consulta.data.totalItens.toLocaleString('pt-BR')} ${consulta.data.totalItens === 1 ? 'venda' : 'vendas'}`
              : 'Vendas'}
          </h2>
        </CardHeader>
        <CardContent>{conteudo()}</CardContent>
      </Card>

      {vendaAberta && (
        <JanelaDaVendaDaTela
          venda={vendaAberta}
          ehAdmin={ehAdmin}
          aoFechar={() => setVendaAberta(null)}
          aoImprimir={setVendaParaImprimir}
          focoAoFechar={() => linhaQueAbriu.current}
        />
      )}
      {usuario && (
        <ImpressaoDoComprovante
          venda={vendaParaImprimir}
          nomeDaEmpresa={usuario.empresa.nome}
          aoTerminar={() => setVendaParaImprimir(null)}
        />
      )}
    </div>
  )
}

function Vazio({ mensagem, aoLimpar }: { mensagem: string; aoLimpar?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md bg-muted/50 p-4 sm:flex-row sm:items-center">
      <Receipt className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{mensagem}</p>
      {aoLimpar && (
        <Button type="button" variant="outline" className="h-11 sm:ml-auto md:h-9" onClick={aoLimpar}>
          Limpar filtros
        </Button>
      )}
    </div>
  )
}

interface ListaDasVendasProps {
  vendas: VendaResumo[]
  aoAbrir: (venda: VendaResumo, origem: HTMLElement) => void
}

/** Tabela a partir de 1.024 px; o numero e o botao que abre a venda (teclado e leitor de tela), a linha abre com o mouse. */
function TabelaDasVendas({ vendas, idTitulo, aoAbrir }: ListaDasVendasProps & { idTitulo: string }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table aria-labelledby={idTitulo} className="w-full text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Nº
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Data e hora
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Caixa
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Vendedor
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Cliente
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Formas
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Total
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              <span className="sr-only">Situação</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {vendas.map((venda) => {
            const cancelada = venda.status === 'CANCELADA'
            return (
              <tr
                key={venda.id}
                onClick={(event) => {
                  const botao = event.currentTarget.querySelector('button')
                  aoAbrir(venda, botao ?? event.currentTarget)
                }}
                className="cursor-pointer align-middle transition-colors hover:bg-muted/50"
              >
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      aoAbrir(venda, event.currentTarget)
                    }}
                    className="min-h-11 rounded-sm font-medium whitespace-nowrap tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-0"
                  >
                    {`Nº ${venda.numero}`}
                  </button>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatarDataHoraCaixa(venda.concluidaEm)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{venda.pontoNome}</td>
                <td className="px-3 py-2.5">{venda.vendedorNome}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{venda.clienteNome ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{formas(venda)}</td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap',
                    cancelada && 'text-muted-foreground line-through',
                  )}
                >
                  {formatarReais(venda.total)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    <SelosDaVenda venda={venda} />
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Cards abaixo de 1.024 px: o card inteiro e o botao que abre a venda. */
function CardsDasVendas({ vendas, aoAbrir }: ListaDasVendasProps) {
  return (
    <ul aria-label="Vendas" className="grid gap-3 lg:hidden">
      {vendas.map((venda) => {
        const cancelada = venda.status === 'CANCELADA'
        return (
          <li key={venda.id}>
            <button
              type="button"
              onClick={(event) => aoAbrir(venda, event.currentTarget)}
              className="w-full space-y-2 rounded-md border p-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block font-medium tabular-nums">{`Nº ${venda.numero}`}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatarDataHoraCaixa(venda.concluidaEm)}
                  </span>
                </span>
                <span
                  className={cn('font-semibold tabular-nums', cancelada && 'text-muted-foreground line-through')}
                >
                  {formatarReais(venda.total)}
                </span>
              </span>
              <span className="block text-sm text-muted-foreground">
                {`${venda.pontoNome} · ${venda.vendedorNome}${venda.clienteNome ? ` · Cliente: ${venda.clienteNome}` : ''}`}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{formas(venda)}</span>
                <SelosDaVenda venda={venda} />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
