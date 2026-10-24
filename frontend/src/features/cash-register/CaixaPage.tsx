import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CaixaAberto } from '@/features/cash-register/CaixaAberto'
import { CAIXA_QUERY_KEY, CHAVE_DA_SESSAO_ATUAL, chaveDaSessao } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { formatarReais, mensagemDoFechamento } from '@/features/cash-register/formatacaoCaixa'
import { PontosParaAbrir } from '@/features/cash-register/PontosParaAbrir'
import { ResumoDoFechamento } from '@/features/cash-register/ResumoDoFechamento'
import { FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { useAuth } from '@/hooks/useAuth'
import { useFeedbackDaTela } from '@/hooks/useFeedbackDaTela'
import { buscarSessao, sessaoAtual } from '@/services/caixaService'
import type { MovimentoDeCaixaRequest, SessaoDeCaixa } from '@/types/caixa'

/**
 * Tela do caixa (/caixa, spec §6.2 a §6.5). Mostra, nesta ordem:
 * - o caixa de outra pessoa que o ADMIN escolheu ver ("Ver caixa");
 * - o resumo do caixa que o usuario acabou de fechar ("Abrir novo caixa");
 * - o caixa aberto pelo usuario (sessao atual);
 * - a escolha do ponto para abrir.
 * Depois de cada mutacao, o prefixo `['caixa']` e invalidado.
 */
export function CaixaPage() {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'ADMIN'
  const queryClient = useQueryClient()
  const { sucesso, erro, avisos } = useFeedbackDaTela()
  const [sessaoVistaId, setSessaoVistaId] = useState<string | null>(null)
  const [resumo, setResumo] = useState<SessaoDeCaixa | null>(null)

  const atual = useQuery({ queryKey: CHAVE_DA_SESSAO_ATUAL, queryFn: sessaoAtual })
  const vista = useQuery({
    queryKey: chaveDaSessao(sessaoVistaId ?? ''),
    queryFn: () => buscarSessao(sessaoVistaId ?? ''),
    enabled: sessaoVistaId !== null,
  })

  const atualizar = () => void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })

  const aoAbrir = (sessao: SessaoDeCaixa) => {
    queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, sessao)
    setResumo(null)
    avisos.sucesso('Caixa aberto')
    atualizar()
  }

  const aoLancado = (lancamento: MovimentoDeCaixaRequest) => {
    const valor = formatarReais(lancamento.valor)
    avisos.sucesso(lancamento.tipo === 'SANGRIA' ? `Sangria de ${valor} registrada` : `Suprimento de ${valor} registrado`)
    atualizar()
  }

  const aoFechado = (fechada: SessaoDeCaixa) => {
    avisos.sucesso(mensagemDoFechamento(fechada.diferenca))
    if (sessaoVistaId !== null) {
      // ADMIN fechou o caixa de outra pessoa: volta ao proprio caixa (ou a escolha de ponto).
      setSessaoVistaId(null)
    } else {
      setResumo(fechada)
    }
    atualizar()
  }

  // A sessao mudou em outro lugar (fechada em outra aba, por exemplo): avisa e recarrega.
  const aoConflitoDeEstado = (mensagem: string) => {
    avisos.erro(mensagem)
    setSessaoVistaId(null)
    atualizar()
  }

  const verCaixa = (sessaoId: string) => {
    avisos.limpar()
    setResumo(null)
    setSessaoVistaId(sessaoId)
  }

  const voltar = () => {
    avisos.limpar()
    setSessaoVistaId(null)
  }

  const conteudo = () => {
    if (sessaoVistaId !== null) {
      if (vista.isPending) {
        return <CarregandoCaixa rotulo="Carregando o caixa" />
      }
      if (vista.isError) {
        return (
          <ErroAoCarregar mensagem="Não foi possível carregar este caixa." aoTentarDeNovo={() => vista.refetch()}>
            <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={voltar}>
              Voltar
            </Button>
          </ErroAoCarregar>
        )
      }
      if (vista.data.status === 'FECHADA') {
        return <CaixaFechado sessao={vista.data} acao={{ rotulo: 'Voltar', aoClicar: voltar, voltar: true }} />
      }
      return (
        <CaixaAberto
          sessao={vista.data}
          deOutraPessoa
          ehAdmin={ehAdmin}
          aoLancado={aoLancado}
          aoFechado={aoFechado}
          aoConflitoDeEstado={aoConflitoDeEstado}
          aoVoltar={voltar}
        />
      )
    }
    if (resumo) {
      return (
        <CaixaFechado
          sessao={resumo}
          acao={{
            rotulo: 'Abrir novo caixa',
            aoClicar: () => {
              avisos.limpar()
              setResumo(null)
            },
          }}
        />
      )
    }
    if (atual.isPending) {
      return <CarregandoCaixa rotulo="Carregando o caixa" />
    }
    if (atual.isError) {
      return <ErroAoCarregar mensagem="Não foi possível carregar o caixa." aoTentarDeNovo={() => atual.refetch()} />
    }
    if (atual.data) {
      return (
        <CaixaAberto
          sessao={atual.data}
          deOutraPessoa={false}
          ehAdmin={ehAdmin}
          aoLancado={aoLancado}
          aoFechado={aoFechado}
          aoConflitoDeEstado={aoConflitoDeEstado}
          aoVerCaixa={verCaixa}
        />
      )
    }
    return <PontosParaAbrir ehAdmin={ehAdmin} aoAbrir={aoAbrir} aoVerCaixa={verCaixa} />
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caixa</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Abertura com fundo de troco, sangria, suprimento e fechamento do dinheiro da gaveta.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link to="/caixa/historico">
            <History className="h-4 w-4" aria-hidden="true" />
            Histórico
          </Link>
        </Button>
      </div>

      <FeedbackCatalogo sucesso={sucesso} erro={erro} />

      {conteudo()}
    </div>
  )
}

/** Resumo de um caixa fechado (spec §6.4), com a acao seguinte. */
function CaixaFechado({
  sessao,
  acao,
}: {
  sessao: SessaoDeCaixa
  acao: { rotulo: string; aoClicar: () => void; voltar?: boolean }
}) {
  const Icone = acao.voltar ? ArrowLeft : Wallet
  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-lg font-semibold leading-none">{`${sessao.ponto.nome} fechado`}</h2>
        <p className="text-sm text-muted-foreground">{`Aberto por ${sessao.abertaPorNome}.`}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResumoDoFechamento sessao={sessao} />
        <Button type="button" className="h-11" variant={acao.voltar ? 'outline' : 'default'} onClick={acao.aoClicar}>
          <Icone className="h-4 w-4" aria-hidden="true" />
          {acao.rotulo}
        </Button>
      </CardContent>
    </Card>
  )
}
