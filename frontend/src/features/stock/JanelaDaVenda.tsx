import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { cabecalhoDaVenda } from '@/features/pdv/formatacaoPdv'
import { chaveDaVenda } from '@/features/pdv/pdvQuery'
import { ResumoDaVenda } from '@/features/pdv/ResumoDaVenda'
import { HttpError } from '@/services/httpClient'
import { buscarVenda } from '@/services/pdvService'
import type { Venda } from '@/types/pdv'

export interface JanelaDaVendaProps {
  /** A venda do movimento (o numero ja aparece no titulo enquanto carrega). */
  venda: { id: string; numero: number }
  aoFechar: () => void
  /** Elemento que recebe o foco ao fechar (o "Venda nº" que abriu a janela). */
  focoAoFechar?: () => HTMLElement | null
}

/**
 * A venda de um movimento de estoque (spec de Estoque, regra 27), so leitura:
 * itens, pagamentos e o cancelamento, sem sair da area Estoque. Imprimir e
 * cancelar continuam no PDV. O foco volta ao "Venda nº" que abriu a janela.
 */
export function JanelaDaVenda({ venda, aoFechar, focoAoFechar }: JanelaDaVendaProps) {
  const consulta = useQuery<Venda>({
    queryKey: chaveDaVenda(venda.id),
    queryFn: () => buscarVenda(venda.id),
    // 404 (venda de outra empresa ou fora do alcance do usuario) nao melhora tentando de novo.
    retry: (tentativas, falha) => !(falha instanceof HttpError && falha.status === 404) && tentativas < 2,
  })

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          const alvo = focoAoFechar?.()
          if (alvo?.isConnected) {
            event.preventDefault()
            alvo.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{`Venda nº ${venda.numero}`}</DialogTitle>
          <DialogDescription>
            {consulta.data ? cabecalhoDaVenda(consulta.data) : 'Itens, pagamentos e situação da venda.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {consulta.isPending ? (
            <CarregandoCaixa rotulo="Carregando a venda" />
          ) : consulta.isError ? (
            consulta.error instanceof HttpError && consulta.error.status === 404 ? (
              <ErroInline mensagem="Esta venda não está mais disponível." />
            ) : (
              <ErroAoCarregar mensagem="Não foi possível carregar a venda." aoTentarDeNovo={() => consulta.refetch()} />
            )
          ) : (
            <ResumoDaVenda venda={consulta.data} />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
