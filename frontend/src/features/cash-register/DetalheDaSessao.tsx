import { useQuery } from '@tanstack/react-query'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { chaveDaSessao } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { formatarDataHoraCaixa, ROTULO_DO_STATUS } from '@/features/cash-register/formatacaoCaixa'
import { ListaDeMovimentos } from '@/features/cash-register/ListaDeMovimentos'
import { ResumoDoFechamento } from '@/features/cash-register/ResumoDoFechamento'
import { buscarSessao } from '@/services/caixaService'
import type { SessaoDeCaixaResumo } from '@/types/caixa'

interface DetalheDaSessaoProps {
  /** A sessao escolhida na lista (titulo imediato); null com o painel fechado. */
  sessao: SessaoDeCaixaResumo | null
  aoFechar: () => void
}

/**
 * Painel lateral do historico (spec §6.6): os movimentos e a fotografia do
 * fechamento de uma sessao, buscados pelo id (a lista vem sem movimentos).
 */
export function DetalheDaSessao({ sessao, aoFechar }: DetalheDaSessaoProps) {
  return (
    <Sheet
      open={sessao !== null}
      onOpenChange={(abrir) => {
        if (!abrir) {
          aoFechar()
        }
      }}
    >
      {sessao && (
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="pr-12">
            <SheetTitle className="font-display text-lg">{sessao.ponto.nome}</SheetTitle>
            <SheetDescription>
              {sessao.status === 'ABERTA'
                ? `Aberto por ${sessao.abertaPorNome} em ${formatarDataHoraCaixa(sessao.abertaEm)}`
                : `${ROTULO_DO_STATUS[sessao.status]} · aberto por ${sessao.abertaPorNome} em ${formatarDataHoraCaixa(sessao.abertaEm)}`}
            </SheetDescription>
          </SheetHeader>
          <ConteudoDoDetalhe sessaoId={sessao.id} />
        </SheetContent>
      )}
    </Sheet>
  )
}

function ConteudoDoDetalhe({ sessaoId }: { sessaoId: string }) {
  const consulta = useQuery({ queryKey: chaveDaSessao(sessaoId), queryFn: () => buscarSessao(sessaoId) })

  if (consulta.isPending) {
    return (
      <div className="px-4">
        <CarregandoCaixa rotulo="Carregando o caixa" />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="px-4">
        <ErroAoCarregar mensagem="Não foi possível carregar este caixa." aoTentarDeNovo={() => consulta.refetch()} />
      </div>
    )
  }
  return (
    <div className="space-y-6 px-4 pb-6">
      <ResumoDoFechamento sessao={consulta.data} />
      <section aria-labelledby="detalhe-movimentos" className="space-y-2">
        <h3 id="detalhe-movimentos" className="text-sm font-medium">
          Movimentos
        </h3>
        <ListaDeMovimentos movimentos={consulta.data.movimentos} />
      </section>
    </div>
  )
}
