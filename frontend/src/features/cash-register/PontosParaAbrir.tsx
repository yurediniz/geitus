import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, Eye, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { chaveDosPontos } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { abertoEmOutroDia, textoDaSituacaoDoPonto } from '@/features/cash-register/formatacaoCaixa'
import { JanelaAbrirCaixa } from '@/features/cash-register/JanelaAbrirCaixa'
import { cn } from '@/lib/utils'
import { listarPontos } from '@/services/caixaService'
import type { PontoDeCaixa, SessaoDeCaixa } from '@/types/caixa'

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

interface PontosParaAbrirProps {
  ehAdmin: boolean
  aoAbrir: (sessao: SessaoDeCaixa) => void
  /** ADMIN: abre o caixa de outra pessoa pelo id da sessao. */
  aoVerCaixa: (sessaoId: string) => void
}

/**
 * `/caixa` sem caixa aberto (spec §6.2): os pontos ativos com a situacao e
 * "Abrir caixa" nos livres. Com um unico ponto ativo e livre, a escolha e
 * pulada ("Abrir o Caixa 1"). O ADMIN ve e abre os caixas de outras pessoas.
 */
export function PontosParaAbrir({ ehAdmin, aoAbrir, aoVerCaixa }: PontosParaAbrirProps) {
  const [pontoParaAbrir, setPontoParaAbrir] = useState<PontoDeCaixa | null>(null)
  const idTitulo = useId()
  const idSemPontos = useId()
  const consulta = useQuery({ queryKey: chaveDosPontos(true), queryFn: () => listarPontos(true) })
  const hoje = new Date()

  const janela = (
    <JanelaAbrirCaixa
      ponto={pontoParaAbrir}
      aoFechar={() => setPontoParaAbrir(null)}
      aoConcluir={(sessao) => {
        setPontoParaAbrir(null)
        aoAbrir(sessao)
      }}
    />
  )

  // Com dados, uma recarga que falha nao tira a lista (nem a janela aberta) da tela.
  if (consulta.data === undefined) {
    return consulta.isError ? (
      <ErroAoCarregar mensagem="Não foi possível carregar os pontos de caixa." aoTentarDeNovo={() => consulta.refetch()} />
    ) : (
      <CarregandoCaixa rotulo="Carregando os pontos de caixa" />
    )
  }

  // A lista ja vem filtrada (ativos); o filtro aqui protege contra um cache antigo.
  const pontos = consulta.data.filter((ponto) => ponto.ativo)

  if (pontos.length === 0) {
    return (
      <section
        aria-labelledby={idSemPontos}
        className="flex max-w-xl flex-col items-start gap-3 rounded-md bg-muted/50 p-4 sm:flex-row"
      >
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-2">
          <p id={idSemPontos} className="text-sm font-medium">
            Nenhum ponto de caixa ativo
          </p>
          {ehAdmin ? (
            <>
              <p className="text-sm text-muted-foreground">Cadastre ou reative um ponto de caixa para abrir o caixa.</p>
              <Button asChild className={ALTURA_DO_CONTROLE}>
                <Link to="/configuracoes">Ir para Configurações</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Peça ao administrador para ativar um ponto de caixa.</p>
          )}
        </div>
      </section>
    )
  }

  const [unico] = pontos
  if (pontos.length === 1 && unico.situacao === null) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Nenhum caixa aberto</h2>
            <p className="text-sm text-muted-foreground">Abra o caixa com o fundo de troco para começar o dia.</p>
          </div>
          <Button type="button" size="lg" className="h-11" onClick={() => setPontoParaAbrir(unico)}>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            {`Abrir o ${unico.nome}`}
          </Button>
        </CardContent>
        {janela}
      </Card>
    )
  }

  const temPontoLivre = pontos.some((ponto) => ponto.situacao === null)

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <h2 id={idTitulo} className="font-display text-lg font-semibold">
            {temPontoLivre ? 'Escolha o ponto de caixa' : 'Todos os caixas estão em uso'}
          </h2>
          {temPontoLivre ? (
            <p className="text-sm text-muted-foreground">Abra o caixa num ponto livre.</p>
          ) : ehAdmin ? (
            <p className="text-sm text-muted-foreground">
              Você pode ver os caixas abertos ou cadastrar outro ponto em{' '}
              <Link to="/configuracoes" className="font-medium text-primary underline underline-offset-4">
                Configurações
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Peça para fecharem um caixa ou peça ao administrador para cadastrar outro ponto.
            </p>
          )}
        </div>
        <ul aria-labelledby={idTitulo} className="divide-y">
          {pontos.map((ponto) => {
            const { situacao } = ponto
            return (
              <li key={ponto.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <LinhaDoPonto ponto={ponto} hoje={hoje} />
                {situacao === null ? (
                  <Button
                    type="button"
                    className={ALTURA_DO_CONTROLE}
                    aria-label={`Abrir caixa no ${ponto.nome}`}
                    onClick={() => setPontoParaAbrir(ponto)}
                  >
                    Abrir caixa
                  </Button>
                ) : (
                  ehAdmin && <VerCaixa ponto={ponto} aoVerCaixa={() => aoVerCaixa(situacao.sessaoId)} />
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
      {janela}
    </Card>
  )
}

/**
 * "Caixa 1 · livre" / "Caixa 2 · aberto por Ana Souza às 08:02". O caixa
 * esquecido aberto (aberto em outro dia) aparece em ambar, com o relogio.
 */
export function LinhaDoPonto({ ponto, hoje }: { ponto: PontoDeCaixa; hoje: Date }) {
  const esquecido = ponto.situacao !== null && abertoEmOutroDia(ponto.situacao.abertaEm, hoje)
  return (
    <p className="text-sm">
      <span className="font-medium">{ponto.nome}</span>
      {' · '}
      <span
        className={cn(
          esquecido ? 'inline-flex items-center gap-1 font-medium text-warning-soft-foreground' : 'text-muted-foreground',
        )}
      >
        {esquecido && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {textoDaSituacaoDoPonto(ponto.situacao, hoje)}
      </span>
    </p>
  )
}

/** Botao "Ver caixa" de um ponto com caixa aberto por outra pessoa (ADMIN). */
export function VerCaixa({ ponto, aoVerCaixa }: { ponto: PontoDeCaixa; aoVerCaixa: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className={ALTURA_DO_CONTROLE}
      aria-label={`Ver caixa do ${ponto.nome}`}
      onClick={aoVerCaixa}
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
      Ver caixa
    </Button>
  )
}
