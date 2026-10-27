import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CaixaAberto } from '@/features/cash-register/CaixaAberto'
import { CAIXA_QUERY_KEY, CHAVE_DA_SESSAO_ATUAL, chaveDaSessao } from '@/features/cash-register/caixaQuery'
import type { MudancaDeEstado } from '@/features/cash-register/errosDoCaixa'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { ID_AVISO_DO_CAIXA } from '@/features/cash-register/focoDoCaixa'
import { formatarReais, mensagemDoFechamento } from '@/features/cash-register/formatacaoCaixa'
import { PontosParaAbrir } from '@/features/cash-register/PontosParaAbrir'
import { ResumoDoFechamento } from '@/features/cash-register/ResumoDoFechamento'
import { FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { useAuth } from '@/hooks/useAuth'
import { useFeedbackDaTela } from '@/hooks/useFeedbackDaTela'
import { cn } from '@/lib/utils'
import { buscarSessao, sessaoAtual } from '@/services/caixaService'
import type { MovimentoDeCaixaRequest, SessaoDeCaixa } from '@/types/caixa'

/**
 * Tela do caixa (/caixa, spec do Caixa). Mostra, nesta ordem:
 * - o caixa de outra pessoa que o ADMIN escolheu ver ("Ver caixa"), aberto ou
 *   ja fechado por ele (resumo com "Voltar");
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
  // Cada pedido move o foco para o aviso do topo (a tela trocou e a janela que tinha o foco sumiu).
  const [pedidosDeFocoNoAviso, setPedidosDeFocoNoAviso] = useState(0)
  const avisoRef = useRef<HTMLDivElement>(null)

  const atual = useQuery({ queryKey: CHAVE_DA_SESSAO_ATUAL, queryFn: sessaoAtual })
  const vista = useQuery({
    queryKey: chaveDaSessao(sessaoVistaId ?? ''),
    queryFn: () => buscarSessao(sessaoVistaId ?? ''),
    enabled: sessaoVistaId !== null,
  })

  useEffect(() => {
    if (pedidosDeFocoNoAviso > 0) {
      avisoRef.current?.focus()
    }
  }, [pedidosDeFocoNoAviso])

  const atualizar = () => void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
  const focarAviso = () => setPedidosDeFocoNoAviso((pedidos) => pedidos + 1)

  const aoAbrir = (sessao: SessaoDeCaixa) => {
    queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, sessao)
    setResumo(null)
    avisos.sucesso('Caixa aberto')
    focarAviso()
    atualizar()
  }

  // Ponto inativado ou ocupado, ou caixa ja aberto em outra aba: a recarga pode trocar a tela.
  const aoFalharAoAbrir = (mensagem: string) => {
    avisos.erro(mensagem)
    focarAviso()
    atualizar()
  }

  const aoLancado = (lancamento: MovimentoDeCaixaRequest) => {
    const valor = formatarReais(lancamento.valor)
    avisos.sucesso(lancamento.tipo === 'SANGRIA' ? `Sangria de ${valor} registrada` : `Suprimento de ${valor} registrado`)
    atualizar()
  }

  // O resumo recebe o foco ao aparecer (CaixaFechado).
  const aoFechado = (fechada: SessaoDeCaixa) => {
    avisos.sucesso(mensagemDoFechamento(fechada.ponto.nome, fechada.diferenca, fechada.porForma ?? []))
    if (sessaoVistaId !== null) {
      // ADMIN fechou o caixa de outra pessoa: continua nele, agora no resumo, com "Voltar".
      queryClient.setQueryData(chaveDaSessao(fechada.id), fechada)
    } else {
      // O proprio caixa: a sessao atual deixa de existir antes da recarga.
      queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, null)
      setResumo(fechada)
    }
    atualizar()
  }

  /**
   * A sessao mudou em outro lugar. Fechada ou fora da vista: a tela sai dela.
   * Em conferencia: a tela fica nela, recarregada (inclusive o ADMIN no caixa de outra pessoa).
   */
  const aoMudarDeEstado = (mudanca: MudancaDeEstado) => {
    avisos.erro(mudanca.mensagem)
    const vendoOutraPessoa = sessaoVistaId !== null
    if (mudanca.situacao === 'EM_CONFERENCIA') {
      if (mudanca.sessao) {
        queryClient.setQueryData(
          vendoOutraPessoa ? chaveDaSessao(mudanca.sessao.id) : CHAVE_DA_SESSAO_ATUAL,
          mudanca.sessao,
        )
      }
    } else if (vendoOutraPessoa) {
      setSessaoVistaId(null)
    } else {
      queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, null)
    }
    focarAviso()
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
      // Com dados, uma recarga que falha (ex.: rede) nao tira o caixa da tela.
      if (vista.data === undefined) {
        return vista.isError ? (
          <ErroAoCarregar mensagem="Não foi possível carregar este caixa." aoTentarDeNovo={() => vista.refetch()}>
            <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={voltar}>
              Voltar
            </Button>
          </ErroAoCarregar>
        ) : (
          <CarregandoCaixa rotulo="Carregando o caixa" />
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
          aoMudarDeEstado={aoMudarDeEstado}
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
    if (atual.data === undefined) {
      return atual.isError ? (
        <ErroAoCarregar mensagem="Não foi possível carregar o caixa." aoTentarDeNovo={() => atual.refetch()} />
      ) : (
        <CarregandoCaixa rotulo="Carregando o caixa" />
      )
    }
    if (atual.data) {
      return (
        <CaixaAberto
          sessao={atual.data}
          deOutraPessoa={false}
          ehAdmin={ehAdmin}
          aoLancado={aoLancado}
          aoFechado={aoFechado}
          aoMudarDeEstado={aoMudarDeEstado}
          aoVerCaixa={verCaixa}
        />
      )
    }
    return (
      <PontosParaAbrir ehAdmin={ehAdmin} aoAbrir={aoAbrir} aoFalharAoAbrir={aoFalharAoAbrir} aoVerCaixa={verCaixa} />
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caixa</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">O dinheiro da gaveta do seu turno.</p>
        </div>
        <Button asChild variant="outline" className="h-11 md:h-9">
          <Link to="/caixa/historico">
            <History className="h-4 w-4" aria-hidden="true" />
            Histórico
          </Link>
        </Button>
      </div>

      {/* Fixo no topo e focavel: recebe o foco quando a tela troca depois de uma acao. */}
      <div
        ref={avisoRef}
        id={ID_AVISO_DO_CAIXA}
        tabIndex={-1}
        className={cn('sticky top-0 z-10 bg-background outline-none', (sucesso || erro) && 'py-2')}
      >
        <FeedbackCatalogo sucesso={sucesso} erro={erro} fixo={false} />
      </div>

      {conteudo()}
    </div>
  )
}

/** Resumo de um caixa fechado (spec do Caixa), com a acao seguinte. O titulo recebe o foco ao aparecer. */
function CaixaFechado({
  sessao,
  acao,
}: {
  sessao: SessaoDeCaixa
  acao: { rotulo: string; aoClicar: () => void; voltar?: boolean }
}) {
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const Icone = acao.voltar ? ArrowLeft : Wallet

  useEffect(() => {
    tituloRef.current?.focus()
  }, [])

  return (
    <Card>
      <CardHeader>
        <h2 ref={tituloRef} tabIndex={-1} className="font-display text-lg font-semibold leading-none outline-none">
          {`${sessao.ponto.nome} fechado`}
        </h2>
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
