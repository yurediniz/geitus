import { useId, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Loader2, Receipt } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CAIXA_QUERY_KEY } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { formatarDataHoraCaixa, formatarHora, formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import { chaveDaVenda, chaveDasVendas, PDV_QUERY_KEY } from '@/features/pdv/pdvQuery'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { HttpError } from '@/services/httpClient'
import { buscarVenda, cancelarVenda, listarVendas } from '@/services/pdvService'
import type { FiltrosDeVendas, Venda, VendaResumo } from '@/types/pdv'

export interface JanelaVendasDoCaixaProps {
  aberta: boolean
  /** A sessao atual do usuario (a lista padrao). */
  sessaoId: string
  ehAdmin: boolean
  aoFechar: () => void
}

const TAMANHO_MAXIMO_DO_MOTIVO = 200
const MENSAGEM_SEM_MOTIVO = 'Informe o motivo do cancelamento.'
const FALHA_AO_CANCELAR = 'Não foi possível cancelar a venda. Confira a conexão e tente de novo.'
const VENDA_INDISPONIVEL = 'Esta venda não está mais disponível.'

/** O que fazer depois do cancelamento: com dinheiro, quanto devolver (o recebido, sem o troco). */
function mensagemDoCancelamento(venda: Venda): string {
  const emDinheiro = venda.pagamentos
    .filter((pagamento) => pagamento.forma === 'DINHEIRO')
    .reduce((soma, pagamento) => soma + Math.round(pagamento.valor * 100), 0)
  const devolver = emDinheiro - Math.round(venda.troco * 100)
  return devolver > 0
    ? `Venda nº ${venda.numero} cancelada. Devolva ${formatarReais(devolver / 100)} em dinheiro ao cliente.`
    : `Venda nº ${venda.numero} cancelada. Estoque e caixa estornados.`
}

/**
 * Vendas do caixa (F8; spec do PDV §6.4): as da sessao atual, com no, hora,
 * cliente, formas, total e situacao. O detalhe mostra itens e pagamentos e
 * cancela com o motivo, so com o caixa da venda aberto (o servidor confere).
 * Busca pelo numero da venda e carrega mais paginas sob demanda; o ADMIN
 * filtra por periodo (o filtro por ponto depende da API, que ainda nao tem).
 */
export function JanelaVendasDoCaixa({ aberta, aoFechar, ...props }: JanelaVendasDoCaixaProps) {
  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && aoFechar()}>
      {aberta && <ConteudoDasVendas {...props} />}
    </Dialog>
  )
}

function ConteudoDasVendas({ sessaoId, ehAdmin }: Omit<JanelaVendasDoCaixaProps, 'aberta' | 'aoFechar'>) {
  const [vendaId, setVendaId] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState({ de: '', ate: '' })
  const [aviso, setAviso] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const numeroComAtraso = useBuscaComAtraso(numero.replace(/\D/g, ''), 300)
  const idDe = useId()
  const idAte = useId()
  const idNumero = useId()
  const porPeriodo = ehAdmin && (periodo.de !== '' || periodo.ate !== '')
  const filtros: FiltrosDeVendas = {
    sessaoId: porPeriodo ? '' : sessaoId,
    status: '',
    de: porPeriodo ? periodo.de : '',
    ate: porPeriodo ? periodo.ate : '',
    numero: numeroComAtraso,
    pagina: 1,
  }

  return (
    <DialogContent onCloseAutoFocus={devolverFocoAoCampo} className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Vendas do caixa</DialogTitle>
        <DialogDescription>
          {porPeriodo ? 'Vendas do período escolhido.' : 'As vendas deste caixa, da mais recente para a mais antiga.'}
        </DialogDescription>
      </DialogHeader>

      {aviso && (
        <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {aviso}
        </p>
      )}

      {vendaId ? (
        <DetalheDaVenda
          vendaId={vendaId}
          aoVoltar={() => setVendaId(null)}
          aoCancelar={(venda) => {
            setAviso(mensagemDoCancelamento(venda))
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor={idNumero} className="text-xs font-medium">
                Nº da venda
              </label>
              <Input
                id={idNumero}
                value={numero}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => setNumero(event.target.value)}
                className="h-11 w-32 md:h-9"
              />
            </div>
            {ehAdmin && (
              <>
              <div className="space-y-1">
                <label htmlFor={idDe} className="text-xs font-medium">
                  De
                </label>
                <Input
                  id={idDe}
                  type="date"
                  value={periodo.de}
                  onChange={(event) => setPeriodo((atual) => ({ ...atual, de: event.target.value }))}
                  className="h-11 md:h-9"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={idAte} className="text-xs font-medium">
                  Até
                </label>
                <Input
                  id={idAte}
                  type="date"
                  value={periodo.ate}
                  onChange={(event) => setPeriodo((atual) => ({ ...atual, ate: event.target.value }))}
                  className="h-11 md:h-9"
                />
              </div>
              {porPeriodo && (
                <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={() => setPeriodo({ de: '', ate: '' })}>
                  Só este caixa
                </Button>
              )}
              </>
            )}
          </div>
          <ListaDasVendas
            filtros={filtros}
            aoAbrir={(id) => {
              setAviso(null)
              setVendaId(id)
            }}
          />
        </>
      )}
    </DialogContent>
  )
}

function ListaDasVendas({ filtros, aoAbrir }: { filtros: FiltrosDeVendas; aoAbrir: (id: string) => void }) {
  const consulta = useInfiniteQuery({
    queryKey: chaveDasVendas(filtros),
    queryFn: ({ pageParam, signal }) => listarVendas({ ...filtros, pagina: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (ultima, paginas) => {
      const carregadas = paginas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      // Pagina incompleta tambem encerra (a lista pode ter mudado entre as paginas).
      return carregadas < ultima.totalItens && ultima.itens.length >= ultima.tamanho ? paginas.length + 1 : undefined
    },
  })

  if (consulta.isPending) {
    return <CarregandoCaixa rotulo="Carregando as vendas" />
  }
  if (consulta.isError) {
    return <ErroAoCarregar mensagem="Não foi possível carregar as vendas." aoTentarDeNovo={() => consulta.refetch()} />
  }
  const vendas = consulta.data.pages.flatMap((pagina) => pagina.itens)
  if (vendas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Receipt className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {filtros.numero ? `Nenhuma venda nº ${filtros.numero}.` : 'Nenhuma venda neste caixa ainda.'}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <ul aria-label="Vendas" className="max-h-96 divide-y overflow-y-auto">
        {vendas.map((venda) => (
          <li key={venda.id}>
            <LinhaDaVenda venda={venda} aoAbrir={() => aoAbrir(venda.id)} />
          </li>
        ))}
      </ul>
      {consulta.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full md:h-9"
          onClick={() => consulta.fetchNextPage()}
          disabled={consulta.isFetchingNextPage}
        >
          {consulta.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Carregar mais
        </Button>
      )}
    </div>
  )
}

function LinhaDaVenda({ venda, aoAbrir }: { venda: VendaResumo; aoAbrir: () => void }) {
  const cancelada = venda.status === 'CANCELADA'
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="grid min-h-11 w-full grid-cols-[4.5rem_3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="font-medium tabular-nums">{`Nº ${venda.numero}`}</span>
      <span className="text-muted-foreground tabular-nums">{formatarHora(venda.concluidaEm)}</span>
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">{venda.pagamentos.map((pagamento) => ROTULO_DA_FORMA[pagamento.forma]).join(' + ')}</span>
        {venda.clienteNome && <span>{` · ${venda.clienteNome}`}</span>}
      </span>
      <span className="flex items-center gap-2 justify-self-end">
        {cancelada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            <Ban className="h-3 w-3" aria-hidden="true" />
            Cancelada
          </span>
        )}
        <span className={cn('font-semibold tabular-nums', cancelada && 'text-muted-foreground line-through')}>
          {formatarReais(venda.total)}
        </span>
      </span>
    </button>
  )
}

function DetalheDaVenda({
  vendaId,
  aoVoltar,
  aoCancelar,
}: {
  vendaId: string
  aoVoltar: () => void
  aoCancelar: (venda: Venda) => void
}) {
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: chaveDaVenda(vendaId), queryFn: () => buscarVenda(vendaId) })
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const idMotivo = useId()

  const cancelamento = useMutation<Venda, unknown, string>({
    mutationFn: (texto) => cancelarVenda(vendaId, texto),
    onSuccess: (venda) => {
      queryClient.setQueryData(chaveDaVenda(vendaId), venda)
      setCancelando(false)
      aoCancelar(venda)
      // O estorno muda o caixa, a lista de vendas e o saldo dos produtos.
      void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'vendas'] })
      void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'busca'] })
      void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
    },
    onError: (falha) => {
      if (falha instanceof HttpError && falha.status === 404) {
        setErro(VENDA_INDISPONIVEL)
        return
      }
      const { porCampo, geral } = lerErroDoServidor(falha, ['motivo'], FALHA_AO_CANCELAR)
      setErroDoMotivo(porCampo.motivo ?? null)
      setErro(geral)
    },
  })

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const texto = motivo.trim()
    if (texto === '') {
      setErroDoMotivo(MENSAGEM_SEM_MOTIVO)
      return
    }
    setErro(null)
    setErroDoMotivo(null)
    cancelamento.mutate(texto)
  }

  if (consulta.isPending) {
    return <CarregandoCaixa rotulo="Carregando a venda" />
  }
  if (consulta.isError) {
    return (
      <ErroAoCarregar mensagem="Não foi possível carregar a venda." aoTentarDeNovo={() => consulta.refetch()}>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={aoVoltar}>
          Voltar
        </Button>
      </ErroAoCarregar>
    )
  }
  const venda = consulta.data
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={aoVoltar}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vendas
        </Button>
        <p className="text-sm text-muted-foreground">
          {`Nº ${venda.numero} · ${formatarDataHoraCaixa(venda.concluidaEm)} · ${venda.vendedorNome}`}
        </p>
      </div>

      {venda.clienteNome && <p className="text-sm">{`Cliente: ${venda.clienteNome}`}</p>}

      <ul aria-label={`Itens da venda nº ${venda.numero}`} className="divide-y text-sm">
        {venda.itens.map((item) => (
          <li key={item.ordem} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{item.nome}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {`${formatarQuantidade(item.quantidade)} ${item.embalagemRotulo ?? item.unidade} × ${formatarReais(item.precoUnitario)}`}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatarReais(item.valorLiquido)}</span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
        {venda.descontoItens + venda.descontoTotal > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Descontos</dt>
            <dd className="tabular-nums">{`− ${formatarReais(venda.descontoItens + venda.descontoTotal)}`}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatarReais(venda.total)}</dd>
        </div>
        {venda.pagamentos.map((pagamento) => (
          <div key={pagamento.forma} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{ROTULO_DA_FORMA[pagamento.forma]}</dt>
            <dd className="tabular-nums">{formatarReais(pagamento.valor)}</dd>
          </div>
        ))}
        {venda.troco > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Troco</dt>
            <dd className="tabular-nums">{formatarReais(venda.troco)}</dd>
          </div>
        )}
      </dl>

      {venda.cancelamento && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {`Cancelada por ${venda.cancelamento.canceladaPorNome} em ${formatarDataHoraCaixa(venda.cancelamento.canceladaEm)}: ${venda.cancelamento.motivo}`}
        </p>
      )}

      {erro && <ErroInline mensagem={erro} />}

      {cancelando ? (
        <form onSubmit={confirmar} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={idMotivo} className="text-sm font-medium">
              Motivo do cancelamento
              <MarcaObrigatorio />
            </label>
            <textarea
              id={idMotivo}
              value={motivo}
              autoFocus
              rows={2}
              maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
              onChange={(event) => {
                setMotivo(event.target.value)
                setErroDoMotivo(null)
              }}
              disabled={cancelamento.isPending}
              aria-invalid={erroDoMotivo ? true : undefined}
              aria-describedby={erroDoMotivo ? `${idMotivo}-erro` : undefined}
              placeholder="Ex.: Cliente desistiu da compra"
              className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm"
            />
            <ErroDoCampo id={`${idMotivo}-erro`} mensagem={erroDoMotivo ?? undefined} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setCancelando(false)}
              disabled={cancelamento.isPending}
            >
              Voltar
            </Button>
            <Button type="submit" variant="destructive" className="min-h-11" disabled={cancelamento.isPending}>
              {cancelamento.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </form>
      ) : (
        venda.podeCancelar &&
        venda.status === 'CONCLUIDA' && (
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setCancelando(true)}>
              <Ban className="h-4 w-4" aria-hidden="true" />
              Cancelar venda
            </Button>
          </DialogFooter>
        )
      )}
    </div>
  )
}
