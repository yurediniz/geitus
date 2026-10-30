import { useId, useState } from 'react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { Loader2, Receipt, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { formatarHora, formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { DetalheDaVenda } from '@/features/pdv/DetalheDaVenda'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { FormularioDeDevolucao } from '@/features/pdv/FormularioDeDevolucao'
import { mensagemDaDevolucao, mensagemDoCancelamento } from '@/features/pdv/mensagensDaVenda'
import { chaveDasVendas } from '@/features/pdv/pdvQuery'
import { SelosDaVenda } from '@/features/pdv/SelosDaVenda'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { HttpError } from '@/services/httpClient'
import { buscarVendaParaDevolucao, listarVendas } from '@/services/pdvService'
import type { FiltrosDeVendas, Venda, VendaResumo } from '@/types/pdv'

export interface JanelaVendasDoCaixaProps {
  aberta: boolean
  /** A sessao atual do usuario (a lista padrao). */
  sessaoId: string
  ehAdmin: boolean
  aoFechar: () => void
  /** Reimprime o comprovante da venda aberta no detalhe. */
  aoImprimir: (venda: Venda) => void
  /** A venda foi cancelada aqui: a tela atualiza o que mostra dela (a ultima venda e o F9). */
  aoCancelarVenda: (venda: Venda) => void
}

/**
 * Vendas do caixa (F8; spec do PDV): as da sessao atual, com no, hora,
 * cliente, formas, total e situacao. O detalhe mostra itens e pagamentos e
 * cancela com o motivo, so com o caixa da venda aberto (o servidor confere).
 * Busca pelo numero da venda e carrega mais paginas sob demanda; o ADMIN
 * filtra por periodo (a consulta completa, com caixa e vendedor, fica na tela Vendas).
 */
export function JanelaVendasDoCaixa({ aberta, aoFechar, ...props }: JanelaVendasDoCaixaProps) {
  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && aoFechar()}>
      {aberta && <ConteudoDasVendas {...props} />}
    </Dialog>
  )
}

function ConteudoDasVendas({
  sessaoId,
  ehAdmin,
  aoImprimir,
  aoCancelarVenda,
}: Omit<JanelaVendasDoCaixaProps, 'aberta' | 'aoFechar'>) {
  const [vendaId, setVendaId] = useState<string | null>(null)
  // A venda com o formulario "Devolver itens" aberto (so ADMIN).
  const [devolvendo, setDevolvendo] = useState<{ id: string; numero: number } | null>(null)
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

      {devolvendo ? (
        <FormularioDeDevolucao
          vendaId={devolvendo.id}
          numero={devolvendo.numero}
          aoVoltar={() => setDevolvendo(null)}
          aoDevolver={(devolucao) => {
            setAviso(mensagemDaDevolucao(devolucao))
            setDevolvendo(null)
          }}
        />
      ) : vendaId ? (
        <DetalheDaVenda
          vendaId={vendaId}
          ehAdmin={ehAdmin}
          aoVoltar={() => setVendaId(null)}
          aoImprimir={aoImprimir}
          aoCancelar={(venda) => {
            setAviso(mensagemDoCancelamento(venda))
            aoCancelarVenda(venda)
          }}
          aoDevolver={(venda) => {
            setAviso(null)
            setDevolvendo({ id: venda.id, numero: venda.numero })
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
          {ehAdmin && numeroComAtraso !== '' && (
            <VendaDeOutroCaixa
              key={numeroComAtraso}
              numero={Number(numeroComAtraso)}
              aoAbrir={(id) => {
                setAviso(null)
                setVendaId(id)
              }}
            />
          )}
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

/**
 * So ADMIN: abre a venda pelo numero mesmo sendo de outro caixa (a lista mostra
 * so as deste caixa sem periodo), para ver ou devolver itens. Usa a consulta
 * da devolucao, que acha a venda em qualquer caixa da empresa.
 */
function VendaDeOutroCaixa({ numero, aoAbrir }: { numero: number; aoAbrir: (id: string) => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const busca = useMutation({
    mutationFn: () => buscarVendaParaDevolucao(numero),
    onSuccess: (venda) => aoAbrir(venda.id),
    onError: (falha) => {
      if (falha instanceof HttpError && falha.status === 404) {
        setErro(`Nenhuma venda nº ${numero} na empresa.`)
      } else if (falha instanceof HttpError && falha.status === 409) {
        setErro(falha.message)
      } else {
        setErro('Não foi possível buscar a venda. Tente de novo.')
      }
    },
  })
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-sm"
        onClick={() => {
          setErro(null)
          busca.mutate()
        }}
        disabled={busca.isPending}
      >
        {busca.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="h-4 w-4" aria-hidden="true" />
        )}
        {`Abrir a venda nº ${numero} de qualquer caixa`}
      </Button>
      {erro && <ErroInline mensagem={erro} />}
    </div>
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
        <SelosDaVenda venda={venda} />
        <span className={cn('font-semibold tabular-nums', cancelada && 'text-muted-foreground line-through')}>
          {formatarReais(venda.total)}
        </span>
      </span>
    </button>
  )
}
