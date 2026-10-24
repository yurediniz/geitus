import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Clock, EyeOff, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { chaveDosPontos } from '@/features/cash-register/caixaQuery'
import { ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import {
  abertoEmOutroDia,
  formatarHora,
  formatarReais,
  textoAbertoDesde,
  textoDaSituacaoDoPonto,
} from '@/features/cash-register/formatacaoCaixa'
import { JanelaFecharCaixa } from '@/features/cash-register/JanelaFecharCaixa'
import { JanelaMovimento } from '@/features/cash-register/JanelaMovimento'
import { ListaDeMovimentos } from '@/features/cash-register/ListaDeMovimentos'
import { VerCaixa } from '@/features/cash-register/PontosParaAbrir'
import { TextoDaDiferenca } from '@/features/cash-register/ResumoDoFechamento'
import { listarPontos } from '@/services/caixaService'
import type { MovimentoDeCaixaRequest, SessaoDeCaixa, TipoDeLancamento } from '@/types/caixa'

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

const FRASE_DO_MODO_CEGO = 'Fechamento cego: o valor esperado aparece depois da contagem.'

export interface CaixaAbertoProps {
  sessao: SessaoDeCaixa
  /** A sessao foi aberta por outra pessoa (ADMIN vendo o caixa dela). */
  deOutraPessoa: boolean
  ehAdmin: boolean
  aoLancado: (lancamento: MovimentoDeCaixaRequest) => void
  aoFechado: (sessao: SessaoDeCaixa) => void
  aoConflitoDeEstado: (mensagem: string) => void
  /** Volta ao proprio caixa (ou a escolha de ponto) quando vendo o caixa de outra pessoa. */
  aoVoltar?: () => void
  /** ADMIN no proprio caixa: abre o caixa de outra pessoa. */
  aoVerCaixa?: (sessaoId: string) => void
}

type Janela = TipoDeLancamento | 'FECHAR' | null

/**
 * `/caixa` com caixa aberto (spec §6.3 e §6.5): cabecalho, aviso do caixa
 * aberto em outro dia, o dinheiro na gaveta (ou a frase do modo cego), as
 * acoes e os movimentos. Em conferencia, a acao e terminar o fechamento.
 */
export function CaixaAberto({
  sessao,
  deOutraPessoa,
  ehAdmin,
  aoLancado,
  aoFechado,
  aoConflitoDeEstado,
  aoVoltar,
  aoVerCaixa,
}: CaixaAbertoProps) {
  const [janela, setJanela] = useState<Janela>(null)
  const idTitulo = useId()
  const hoje = new Date()
  const emConferencia = sessao.status === 'EM_CONFERENCIA'
  const quem = deOutraPessoa ? sessao.abertaPorNome : 'você'

  return (
    <div className="space-y-6">
      {aoVoltar && (
        <Button type="button" variant="ghost" className={ALTURA_DO_CONTROLE} onClick={aoVoltar}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar
        </Button>
      )}

      <Card>
        <CardHeader className="gap-2">
          <h2 id={idTitulo} className="font-display text-lg font-semibold leading-tight">
            {`${sessao.ponto.nome} · aberto por ${quem} às ${formatarHora(sessao.abertaEm)}`}
          </h2>
          {abertoEmOutroDia(sessao.abertaEm, hoje) && (
            <p className="flex w-fit items-center gap-2 rounded-md bg-warning-soft px-3 py-1.5 text-sm font-medium text-warning-soft-foreground">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              {textoAbertoDesde(sessao.abertaEm)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {emConferencia ? <EmConferencia sessao={sessao} /> : <DinheiroNaGaveta sessao={sessao} />}

          {sessao.podeOperar ? (
            <div className="flex flex-wrap gap-2">
              {emConferencia ? (
                <Button type="button" className="h-11" onClick={() => setJanela('FECHAR')}>
                  Informar justificativa
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setJanela('SUPRIMENTO')}>
                    <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                    Suprimento
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setJanela('SANGRIA')}>
                    <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                    Sangria
                  </Button>
                  <Button type="button" className="h-11 sm:ml-auto" onClick={() => setJanela('FECHAR')}>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    Fechar caixa
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Você pode ver este caixa, mas não pode operá-lo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-display font-semibold leading-none">Movimentos</h3>
        </CardHeader>
        <CardContent>
          <ListaDeMovimentos movimentos={sessao.movimentos} />
        </CardContent>
      </Card>

      {ehAdmin && !deOutraPessoa && aoVerCaixa && (
        <OutrosCaixasAbertos sessaoPropriaId={sessao.id} aoVerCaixa={aoVerCaixa} />
      )}

      <JanelaMovimento
        sessao={sessao}
        tipo={janela === 'SANGRIA' || janela === 'SUPRIMENTO' ? janela : null}
        aoFechar={() => setJanela(null)}
        aoConcluir={(lancamento) => {
          setJanela(null)
          aoLancado(lancamento)
        }}
        aoConflitoDeEstado={(mensagem) => {
          setJanela(null)
          aoConflitoDeEstado(mensagem)
        }}
      />
      <JanelaFecharCaixa
        aberto={janela === 'FECHAR'}
        sessao={sessao}
        deOutraPessoa={deOutraPessoa}
        aoFechar={() => setJanela(null)}
        aoConcluir={(fechada) => {
          setJanela(null)
          aoFechado(fechada)
        }}
        aoConflitoDeEstado={(mensagem) => {
          setJanela(null)
          aoConflitoDeEstado(mensagem)
        }}
      />
    </div>
  )
}

/** Destaque do dinheiro na gaveta; no modo cego, para o OPERADOR, a frase no lugar do valor. */
function DinheiroNaGaveta({ sessao }: { sessao: SessaoDeCaixa }) {
  const idRotulo = useId()
  if (sessao.dinheiroNaGaveta === null) {
    return (
      <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-3 text-sm">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {FRASE_DO_MODO_CEGO}
      </p>
    )
  }
  return (
    <section aria-labelledby={idRotulo} className="space-y-1">
      <p id={idRotulo} className="text-sm text-muted-foreground">
        Dinheiro na gaveta
      </p>
      <p className="font-display text-3xl font-semibold tabular-nums">{formatarReais(sessao.dinheiroNaGaveta)}</p>
    </section>
  )
}

/** Sessao em conferencia: a contagem ja foi registrada e falta a justificativa da diferenca. */
function EmConferencia({ sessao }: { sessao: SessaoDeCaixa }) {
  return (
    <div className="space-y-2 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
      <p className="font-semibold">Contagem registrada · falta a justificativa</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-foreground">
        {sessao.valorEsperado !== null && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Esperado</dt>
            <dd className="tabular-nums">{formatarReais(sessao.valorEsperado)}</dd>
          </div>
        )}
        {sessao.valorContado !== null && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Contado</dt>
            <dd className="tabular-nums">{formatarReais(sessao.valorContado)}</dd>
          </div>
        )}
        {sessao.diferenca !== null && (
          <div className="flex gap-1.5">
            <dt className="sr-only">Diferença</dt>
            <dd>
              <TextoDaDiferenca valor={sessao.diferenca} />
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/** ADMIN no proprio caixa: os caixas abertos por outras pessoas, com "Ver caixa" (spec §6.5). */
function OutrosCaixasAbertos({
  sessaoPropriaId,
  aoVerCaixa,
}: {
  sessaoPropriaId: string
  aoVerCaixa: (sessaoId: string) => void
}) {
  const idTitulo = useId()
  const consulta = useQuery({ queryKey: chaveDosPontos(true), queryFn: () => listarPontos(true) })
  const hoje = new Date()

  if (consulta.isPending) {
    return null
  }
  if (consulta.isError) {
    return (
      <ErroAoCarregar
        mensagem="Não foi possível carregar os outros caixas abertos."
        aoTentarDeNovo={() => consulta.refetch()}
      />
    )
  }
  const outros = consulta.data.filter(
    (ponto) => ponto.situacao !== null && ponto.situacao.sessaoId !== sessaoPropriaId,
  )
  if (outros.length === 0) {
    return null
  }
  return (
    <section aria-labelledby={idTitulo} className="space-y-2">
      <h3 id={idTitulo} className="text-sm font-medium">
        Outros caixas abertos
      </h3>
      <ul className="divide-y rounded-md bg-muted/40 px-3">
        {outros.map((ponto) => {
          const { situacao } = ponto
          if (situacao === null) {
            return null
          }
          return (
            <li key={ponto.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <p className="text-sm">
                <span className="font-medium">{ponto.nome}</span>
                <span className="text-muted-foreground">{` · ${textoDaSituacaoDoPonto(situacao, hoje)}`}</span>
              </p>
              <VerCaixa ponto={ponto} aoVerCaixa={() => aoVerCaixa(situacao.sessaoId)} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
