import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { acaoDoAtalho, type AcaoDoPdv } from '@/features/pdv/atalhosDoPdv'
import { tocarBipeDeErro } from '@/features/pdv/bipeDeErro'
import { CampoDeLeitura } from '@/features/pdv/CampoDeLeitura'
import { ListOrdered, PauseCircle, Undo2, UserRound } from 'lucide-react'

import { MenuDeNavegacao } from '@/components/layout/Navegacao'
import { Button } from '@/components/ui/button'
import { CAIXA_QUERY_KEY, CHAVE_DA_SESSAO_ATUAL } from '@/features/cash-register/caixaQuery'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import type { Carrinho, LinhaDoCarrinho } from '@/features/pdv/carrinho'
import { BarraDoPdv, DadoDaBarra } from '@/features/pdv/BarraDoPdv'
import { CLASSE_DO_BOTAO_DA_BARRA } from '@/features/pdv/estiloDaBarra'
import { focarCampoDeLeitura, ID_CAMPO_DE_LEITURA, selecionarCampoDeLeitura } from '@/features/pdv/focoDoPdv'
import { JanelaCliente } from '@/features/pdv/JanelaCliente'
import { JanelaConfirmar, type Confirmacao } from '@/features/pdv/JanelaConfirmar'
import { JanelaDesconto, type AlvoDoDesconto } from '@/features/pdv/JanelaDesconto'
import { JanelaPagamento } from '@/features/pdv/JanelaPagamento'
import { JanelaVendasDoCaixa } from '@/features/pdv/JanelaVendasDoCaixa'
import { JanelaVendasEmEspera } from '@/features/pdv/JanelaVendasEmEspera'
import { ImpressaoDoComprovante } from '@/features/pdv/ImpressaoDoComprovante'
import { LIMITES_DA_LEITURA } from '@/features/pdv/filaDeLeituras'
import { ListaDeLinhas, type DestaqueDaLinha } from '@/features/pdv/ListaDeLinhas'
import { ehDoPagamento, separarMensagens } from '@/features/pdv/mensagensDoCalculo'
import { PainelDoTotal } from '@/features/pdv/PainelDoTotal'
import { PDV_QUERY_KEY } from '@/features/pdv/pdvQuery'
import { useCalculo } from '@/features/pdv/useCalculo'
import { MENSAGEM_TENTATIVA_PENDENTE, useCarrinho } from '@/features/pdv/useCarrinho'
import {
  mensagemDaVendaPostaEmEspera,
  porEmEspera,
  tirarDaEspera,
  useVendasEmEspera,
} from '@/features/pdv/vendasEmEspera'
import type { AvisosDaTela } from '@/hooks/useFeedbackDaTela'
import { gerarUuid } from '@/lib/uuid'
import type { Usuario } from '@/types/auth'
import type { SessaoDeCaixa } from '@/types/caixa'
import type { ConfiguracaoDoPdv, LinhaCalculada, MensagemDoCalculo, PagamentoInformado, Venda } from '@/types/pdv'

type Janela =
  | { tipo: 'CLIENTE' }
  | { tipo: 'DESCONTO'; desconto: AlvoDoDesconto }
  | { tipo: 'CONFIRMAR'; confirmacao: Confirmacao }
  | { tipo: 'PAGAMENTO' }
  | { tipo: 'ESPERA' }
  | { tipo: 'VENDAS' }

/** Erros da ultima tentativa de finalizar (Review Focus 2): valem enquanto o carrinho nao muda. */
interface ErrosDaVenda {
  carrinho: Carrinho
  mensagens: MensagemDoCalculo[]
}

export interface TelaDeVendaProps {
  sessao: SessaoDeCaixa
  usuario: Usuario
  /** Undefined enquanto carrega (ou se falhar): vale o padrao, e o servidor confere ao finalizar. */
  configuracao: ConfiguracaoDoPdv | undefined
  avisos: AvisosDaTela
  /** Os avisos da tela (sucesso e erro), logo abaixo da barra. */
  feedback?: ReactNode
}

const SEM_PAGAMENTOS: readonly PagamentoInformado[] = []

const MENSAGEM_BLOQUEADO ='Corrija os erros da venda antes de pagar.'
const MENSAGEM_CALCULANDO = 'Aguarde o cálculo da venda.'
const MENSAGEM_SEM_ITENS = 'Lance um item primeiro.'
const MENSAGEM_AGUARDE_A_LEITURA = 'Aguarde a leitura…'
const MENSAGEM_NADA_PARA_IMPRIMIR = 'Finalize a venda para imprimir o comprovante. Para reimprimir, use Vendas do caixa (F8).'

/** Quanto tempo o aviso "removido da venda" oferece o Desfazer. */
const TEMPO_DO_DESFAZER_MS = 6_000

interface LinhaRemovida {
  nome: string
  /** O carrinho de antes da remocao (o Desfazer o devolve inteiro, na mesma ordem). */
  anterior: Carrinho
}

/**
 * A venda com o caixa aberto (spec do PDV): a barra com o caixa e o
 * operador; a esquerda, o campo "Código ou nome" no topo (foco permanente)
 * com a busca ao vivo; a direita, o cliente, os itens e o total. O carrinho
 * fica no navegador; o calculo exibido e sempre o do servidor.
 */
export function TelaDeVenda({ sessao, usuario, configuracao, avisos, feedback }: TelaDeVendaProps) {
  const queryClient = useQueryClient()
  const venderSemEstoque = configuracao?.venderSemEstoque ?? true
  const opcoes = useMemo(() => ({ venderSemEstoque }), [venderSemEstoque])
  const carrinho = useCarrinho(usuario.empresa.id, usuario.id, opcoes)
  const calculo = useCalculo(carrinho.carrinho)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [destaque, setDestaque] = useState<DestaqueDaLinha | null>(null)
  /** O erro da leitura fica ate a proxima recusa, ate Esc ou por alguns segundos (UX 1). */
  const [erroDaLeitura, setErroDaLeitura] = useState<{ mensagem: string; vez: number } | null>(null)
  const [removida, setRemovida] = useState<LinhaRemovida | null>(null)
  const [ultimaVenda, setUltimaVenda] = useState<Venda | null>(null)
  const [vendaParaImprimir, setVendaParaImprimir] = useState<Venda | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)
  const [errosDaVenda, setErrosDaVenda] = useState<ErrosDaVenda | null>(null)
  const [leiturasPendentes, setLeiturasPendentes] = useState(0)
  const [avisoDaLeitura, setAvisoDaLeitura] = useState<string | null>(null)
  const espera = useVendasEmEspera(usuario.empresa.id, usuario.id)
  const idCliente = useId()
  /** Os pagamentos informados e o carrinho em que valem: mudou o carrinho, recomeca do zero. */
  const [rascunho, setRascunho] = useState<{ carrinho: Carrinho; pagamentos: PagamentoInformado[] } | null>(null)

  const { linhas } = carrinho
  const selecionada: LinhaDoCarrinho | undefined =
    linhas.find((linha) => linha.id === selecionadaId) ?? linhas[linhas.length - 1]

  const calculoPorLinha = useMemo(() => {
    const porLinha: Record<string, LinhaCalculada | undefined> = {}
    calculo.idsDoCalculo.forEach((id, indice) => {
      porLinha[id] = calculo.calculo?.linhas[indice]
    })
    return porLinha
  }, [calculo.calculo, calculo.idsDoCalculo])

  const mensagens = useMemo(() => {
    const doCalculo = separarMensagens(calculo.calculo?.erros ?? [], calculo.idsDoCalculo)
    const dosDados = separarMensagens(calculo.errosDosDados, calculo.idsDosErros)
    const avisosDasLinhas = separarMensagens(calculo.calculo?.avisos ?? [], calculo.idsDoCalculo)
    const daVenda =
      errosDaVenda && errosDaVenda.carrinho === carrinho.carrinho
        ? separarMensagens(
            errosDaVenda.mensagens,
            errosDaVenda.carrinho.linhas.map((linha) => linha.id),
          )
        : { porLinha: {}, outras: [] }
    return {
      errosPorLinha: { ...doCalculo.porLinha, ...dosDados.porLinha, ...daVenda.porLinha },
      avisosPorLinha: avisosDasLinhas.porLinha,
      gerais: [...doCalculo.outras, ...dosDados.outras, ...daVenda.outras]
        .filter((mensagem) => !ehDoPagamento(mensagem))
        .map((mensagem) => mensagem.mensagem),
    }
  }, [calculo.calculo, calculo.idsDoCalculo, calculo.errosDosDados, calculo.idsDosErros, errosDaVenda, carrinho.carrinho])

  const temErro = mensagens.gerais.length > 0 || Object.keys(mensagens.errosPorLinha).length > 0
  /** Sem resposta numa tentativa anterior: o pagamento abre direto na trava (o reenvio e do mesmo corpo). */
  const tentativaTravada = carrinho.tentativa?.trava != null
  const podePagar =
    linhas.length > 0 &&
    leiturasPendentes === 0 &&
    (tentativaTravada || (calculo.atualizado && calculo.falhaDoCalculo === null && !temErro))

  const recusar = useCallback((mensagem: string) => {
    setErroDaLeitura((atual) => ({ mensagem, vez: (atual?.vez ?? 0) + 1 }))
    tocarBipeDeErro()
  }, [])

  useEffect(() => {
    if (!erroDaLeitura) {
      return
    }
    const temporizador = setTimeout(() => setErroDaLeitura(null), LIMITES_DA_LEITURA.tempoDoErroMs)
    return () => clearTimeout(temporizador)
  }, [erroDaLeitura])

  useEffect(() => {
    if (!removida) {
      return
    }
    const temporizador = setTimeout(() => setRemovida(null), TEMPO_DO_DESFAZER_MS)
    return () => clearTimeout(temporizador)
  }, [removida])

  // A ultima venda fica no painel ate o primeiro item da proxima (UX 6).
  useEffect(() => {
    if (linhas.length > 0) {
      setUltimaVenda(null)
    }
  }, [linhas.length])

  // Os avisos do topo sao do momento: somem quando o carrinho muda (salvo o aviso da propria mudanca).
  const carrinhoDoAviso = useRef(carrinho.carrinho)
  const manterAviso = useRef(false)
  useEffect(() => {
    if (carrinhoDoAviso.current === carrinho.carrinho) {
      return
    }
    carrinhoDoAviso.current = carrinho.carrinho
    if (manterAviso.current) {
      manterAviso.current = false
      return
    }
    avisos.limpar()
  }, [carrinho.carrinho, avisos])

  /** Remove a linha e oferece o Desfazer por alguns segundos (UX 2). */
  const removerComDesfazer = (linha: LinhaDoCarrinho) => {
    const anterior = carrinho.carrinho
    const resultado = carrinho.remover(linha.id)
    if (resultado.ok) {
      setRemovida({ nome: linha.produto.nome, anterior })
    } else {
      recusar(resultado.erro)
    }
  }

  /** Com a tentativa travada, nada muda o carrinho (o reenvio precisa do mesmo corpo). */
  const livreParaMudar = (): boolean => {
    if (tentativaTravada) {
      recusar(MENSAGEM_TENTATIVA_PENDENTE)
      return false
    }
    return true
  }

  const mudarPendentes = useCallback((quantas: number) => {
    setLeiturasPendentes(quantas)
    if (quantas === 0) {
      setAvisoDaLeitura(null)
    }
  }, [])

  const fecharJanela = useCallback(() => setJanela(null), [])
  const terminarImpressao = useCallback(() => {
    setVendaParaImprimir(null)
    focarCampoDeLeitura()
  }, [])

  const carrinhoAtual = carrinho.atual
  const guardarPagamentos = useCallback(
    (pagamentos: PagamentoInformado[]) => setRascunho({ carrinho: carrinhoAtual(), pagamentos }),
    [carrinhoAtual],
  )

  /** F4 ou o botao % da linha. */
  const descontarLinha = (linha: LinhaDoCarrinho | undefined) => {
    if (!livreParaMudar()) {
      return
    }
    if (!linha) {
      recusar(MENSAGEM_SEM_ITENS)
      return
    }
    setSelecionadaId(linha.id)
    setJanela({
      tipo: 'DESCONTO',
      desconto: {
        alvo: linha.id,
        titulo: 'Desconto do item',
        descricao: linha.produto.nome,
        atual: linha.desconto,
      },
    })
  }

  /** + / − (teclado ou botoes da linha). */
  const mudarQuantidade = (linha: LinhaDoCarrinho | undefined, delta: 1 | -1) => {
    if (!linha) {
      return
    }
    const resultado = carrinho.alterarQuantidade(linha.id, delta)
    if (!resultado.ok) {
      recusar(resultado.erro)
    }
  }

  /** Del ou o botao × da linha: com desconto, confirma antes. */
  const pedirRemocao = (linha: LinhaDoCarrinho | undefined) => {
    if (!linha || !livreParaMudar()) {
      return
    }
    if (linha.desconto) {
      setJanela({
        tipo: 'CONFIRMAR',
        confirmacao: {
          titulo: `Remover ${linha.produto.nome}?`,
          descricao: 'A linha tem desconto. O desconto também sai.',
          confirmar: 'Remover',
          aoConfirmar: () => {
            setJanela(null)
            removerComDesfazer(linha)
          },
        },
      })
      return
    }
    removerComDesfazer(linha)
    focarCampoDeLeitura()
  }

  const executar = (acao: AcaoDoPdv) => {
    switch (acao) {
      case 'BUSCA':
        // A busca e o proprio campo do topo: o F2 o seleciona.
        selecionarCampoDeLeitura()
        return
      case 'CLIENTE':
        if (livreParaMudar()) {
          setJanela({ tipo: 'CLIENTE' })
        }
        return
      case 'DESCONTO_ITEM':
        descontarLinha(selecionada)
        return
      case 'DESCONTO_TOTAL':
        if (!livreParaMudar()) {
          return
        }
        if (linhas.length === 0) {
          recusar(MENSAGEM_SEM_ITENS)
          return
        }
        setJanela({
          tipo: 'DESCONTO',
          desconto: {
            alvo: 'TOTAL',
            titulo: 'Desconto da venda',
            descricao: 'Sobre o subtotal, depois dos descontos dos itens.',
            atual: carrinho.desconto,
          },
        })
        return
      case 'ANTERIOR':
      case 'PROXIMA': {
        if (!selecionada) {
          return
        }
        const indice = linhas.indexOf(selecionada) + (acao === 'ANTERIOR' ? -1 : 1)
        const proxima = linhas[Math.min(Math.max(indice, 0), linhas.length - 1)]
        setSelecionadaId(proxima.id)
        return
      }
      case 'MAIS':
      case 'MENOS':
        mudarQuantidade(selecionada, acao === 'MAIS' ? 1 : -1)
        return
      case 'REMOVER':
        pedirRemocao(selecionada)
        return
      case 'PAGAMENTO':
        if (linhas.length === 0) {
          recusar(MENSAGEM_SEM_ITENS)
        } else if (leiturasPendentes > 0) {
          // Um bipe ainda nao entrou no carrinho: pagar agora deixaria o item de fora.
          setAvisoDaLeitura(MENSAGEM_AGUARDE_A_LEITURA)
        } else if (tentativaTravada) {
          setJanela({ tipo: 'PAGAMENTO' })
        } else if (temErro) {
          recusar(MENSAGEM_BLOQUEADO)
        } else if (!podePagar) {
          recusar(calculo.falhaDoCalculo ?? MENSAGEM_CALCULANDO)
        } else {
          setJanela({ tipo: 'PAGAMENTO' })
        }
        return
      case 'POR_EM_ESPERA': {
        if (linhas.length === 0) {
          recusar(MENSAGEM_SEM_ITENS)
          return
        }
        if (!livreParaMudar()) {
          return
        }
        const resultado = porEmEspera(
          espera.vendas,
          carrinho.carrinho,
          // So o total do calculo desta venda; sem ele, a lista mostra "—".
          calculo.atualizado ? (calculo.calculo?.total ?? null) : null,
          new Date().toISOString(),
          gerarUuid(),
        )
        if (!resultado.ok) {
          recusar(resultado.erro)
          return
        }
        espera.substituir(resultado.vendas)
        manterAviso.current = true
        carrinho.limpar()
        setRemovida(null)
        avisos.sucesso(mensagemDaVendaPostaEmEspera(resultado.vendas.length))
        focarCampoDeLeitura()
        return
      }
      case 'VENDAS_EM_ESPERA':
        setJanela({ tipo: 'ESPERA' })
        return
      case 'VENDAS_DO_CAIXA':
        setJanela({ tipo: 'VENDAS' })
        return
      case 'IMPRIMIR':
        // So a venda que acabou de sair (ainda no painel); as anteriores, pelo F8.
        if (ultimaVenda) {
          setVendaParaImprimir(ultimaVenda)
        } else {
          recusar(MENSAGEM_NADA_PARA_IMPRIMIR)
        }
        return
    }
  }

  // Os atalhos valem na tela toda (o foco fica no campo); com uma janela aberta, a janela cuida das teclas.
  const executarRef = useRef(executar)
  useEffect(() => {
    executarRef.current = executar
  })
  const janelaAbertaRef = useRef(false)
  useEffect(() => {
    janelaAbertaRef.current = janela !== null
  }, [janela])

  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      if (janelaAbertaRef.current || event.defaultPrevented) {
        return
      }
      const alvo = event.target instanceof HTMLElement ? event.target : null
      const noCampo = alvo?.id === ID_CAMPO_DE_LEITURA
      const campo = document.getElementById(ID_CAMPO_DE_LEITURA)
      const campoVazio = campo instanceof HTMLInputElement && campo.value === ''
      const acao = acaoDoAtalho(event, campoVazio)
      // Num seletor da linha, as setas e o Del sao do proprio seletor.
      if (!acao || (!noCampo && alvo?.tagName === 'SELECT' && !event.key.startsWith('F'))) {
        return
      }
      event.preventDefault()
      executarRef.current(acao)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  /** A linha lancada fica selecionada e o destaque toca de novo (mesmo quando soma na mesma linha). */
  const lancou = (linhaId: string | undefined) => {
    if (linhaId) {
      setSelecionadaId(linhaId)
      setDestaque((atual) => ({ linhaId, vez: (atual?.vez ?? 0) + 1 }))
    }
  }

  const retomar = (id: string, porAtualEmEspera: boolean) => {
    const escolhida = espera.vendas.find((venda) => venda.id === id)
    if (!escolhida) {
      return
    }
    if (tentativaTravada) {
      setJanela(null)
      recusar(MENSAGEM_TENTATIVA_PENDENTE)
      return
    }
    let restantes = tirarDaEspera(espera.vendas, id)
    if (porAtualEmEspera && linhas.length > 0) {
      const resultado = porEmEspera(
        restantes,
        carrinho.carrinho,
        calculo.atualizado ? (calculo.calculo?.total ?? null) : null,
        new Date().toISOString(),
        gerarUuid(),
      )
      if (resultado.ok) {
        restantes = resultado.vendas
      }
    }
    espera.substituir(restantes)
    manterAviso.current = true
    carrinho.substituir(escolhida.carrinho)
    setSelecionadaId(null)
    setDestaque(null)
    setRemovida(null)
    setJanela(null)
    avisos.sucesso('Venda retomada.')
  }

  const atalhoDaBarra = (tecla: string) => (
    <kbd aria-hidden="true" className="rounded bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
      {tecla}
    </kbd>
  )

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <BarraDoPdv
        acoes={
          <>
            <Button
              type="button"
              variant="ghost"
              className={CLASSE_DO_BOTAO_DA_BARRA}
              onClick={() => executar('VENDAS_EM_ESPERA')}
              aria-keyshortcuts="F7"
            >
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
              {`Em espera (${espera.vendas.length})`}
              {atalhoDaBarra('F7')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={CLASSE_DO_BOTAO_DA_BARRA}
              onClick={() => executar('VENDAS_DO_CAIXA')}
              aria-keyshortcuts="F8"
            >
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
              Vendas do caixa
              {atalhoDaBarra('F8')}
            </Button>
            <MenuDeNavegacao comRotulo className={CLASSE_DO_BOTAO_DA_BARRA} />
          </>
        }
      >
        <DadoDaBarra rotulo="Caixa">
          <span className="flex items-center gap-2">
            {sessao.ponto.nome}
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <span aria-hidden="true" className="size-2 rounded-full bg-success" />
              Aberto
            </span>
          </span>
        </DadoDaBarra>
        <DadoDaBarra rotulo="Operador">{usuario.nome}</DadoDaBarra>
      </BarraDoPdv>

      {feedback && <div className="px-4 pt-3 empty:hidden">{feedback}</div>}

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(23rem,28rem)]">
        <section aria-label="Produtos" className="flex min-h-[28rem] flex-col rounded-2xl bg-card p-4 shadow-sm lg:min-h-0">
          <CampoDeLeitura
            erro={erroDaLeitura?.mensagem ?? null}
            aoLimparErro={() => setErroDaLeitura(null)}
            aviso={avisoDaLeitura}
            capturarTeclas={janela === null}
            aoMudarPendentes={mudarPendentes}
            aoDigitar={() => undefined}
            aoResolver={(item) => {
              const resultado = carrinho.adicionar(item)
              if (resultado.ok) {
                lancou(resultado.linhaId)
              } else {
                recusar(resultado.erro)
              }
            }}
            aoRecusar={recusar}
          />
        </section>

        <aside aria-label="Venda" className="flex min-h-0 flex-col gap-3">
          <section aria-label="Atendimento" className="flex items-center gap-3 rounded-2xl bg-card px-4 py-2.5 shadow-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p id={idCliente} className="text-xs text-muted-foreground">
                Cliente
              </p>
              <p role="note" aria-labelledby={idCliente} className="truncate font-medium">
                {carrinho.cliente?.nome ?? 'Sem cliente'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2"
              onClick={() => executar('CLIENTE')}
              aria-keyshortcuts="F3"
            >
              {carrinho.cliente ? 'Trocar' : 'Informar'}
              <kbd aria-hidden="true" className="rounded bg-foreground/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
                F3
              </kbd>
            </Button>
          </section>

          <section aria-labelledby="pdv-itens-titulo" className="flex min-h-48 flex-1 flex-col rounded-2xl bg-card shadow-sm">
            <div className="flex items-baseline justify-between gap-3 border-b px-4 pt-3 pb-2">
              <h2 id="pdv-itens-titulo" className="font-display text-base font-semibold">
                Itens do carrinho
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">
                {`${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'}`}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              <ListaDeLinhas
                linhas={linhas}
                calculoPorLinha={calculoPorLinha}
                errosPorLinha={mensagens.errosPorLinha}
                avisosPorLinha={mensagens.avisosPorLinha}
                selecionadaId={selecionada?.id ?? null}
                destaque={destaque}
                aoSelecionar={(linhaId) => {
                  setSelecionadaId(linhaId)
                  focarCampoDeLeitura()
                }}
                aoTrocarEmbalagem={(linhaId, embalagemId) => {
                  const resultado = carrinho.trocarEmbalagem(linhaId, embalagemId)
                  if (!resultado.ok) {
                    recusar(resultado.erro)
                  }
                  focarCampoDeLeitura()
                }}
                aoMudarQuantidade={(linhaId, delta) => {
                  setSelecionadaId(linhaId)
                  mudarQuantidade(
                    linhas.find((linha) => linha.id === linhaId),
                    delta,
                  )
                  focarCampoDeLeitura()
                }}
                aoDescontar={(linhaId) => descontarLinha(linhas.find((linha) => linha.id === linhaId))}
                aoRemover={(linhaId) => pedirRemocao(linhas.find((linha) => linha.id === linhaId))}
              />
            </div>
            {removida && (
              <div role="status" className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg bg-muted/70 px-3 py-1.5 text-sm">
                <span>{`${removida.nome} removido da venda.`}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 md:h-9"
                  onClick={() => {
                    const resultado = carrinho.restaurar(removida.anterior)
                    setRemovida(null)
                    if (!resultado.ok) {
                      recusar(resultado.erro)
                    }
                    focarCampoDeLeitura()
                  }}
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Desfazer
                </Button>
              </div>
            )}
            {linhas.length > 0 && (
              <p className="hidden border-t px-4 py-2 text-xs text-muted-foreground [@media(min-height:760px)]:block">
                ↑ ↓ escolhe a linha · + − quantidade · F4 desconto · Del remove
              </p>
            )}
            {Object.keys(mensagens.errosPorLinha).length > 0 && (
              <div role="alert" aria-label="Erros dos itens" className="sr-only">
                {linhas
                  .map((linha, indice) => ({ numero: indice + 1, erro: mensagens.errosPorLinha[linha.id] }))
                  .filter(({ erro }) => erro)
                  .map(({ numero, erro }) => (
                    <p key={numero}>{`Item ${numero}: ${erro}`}</p>
                  ))}
              </div>
            )}
          </section>

          <PainelDoTotal
            calculo={calculo.calculo}
            vazio={linhas.length === 0}
            ultimaVenda={ultimaVenda}
            calculando={calculo.calculando}
            erros={mensagens.gerais}
            falhaDoCalculo={calculo.falhaDoCalculo}
            aoTentarDeNovo={calculo.recalcular}
            pagamento={{ aoClicar: () => executar('PAGAMENTO'), desabilitado: !podePagar }}
            descontoDaVenda={{ aoClicar: () => executar('DESCONTO_TOTAL'), desabilitado: linhas.length === 0 }}
            porEmEspera={{ aoClicar: () => executar('POR_EM_ESPERA'), desabilitado: linhas.length === 0 }}
            imprimir={{ aoClicar: () => executar('IMPRIMIR'), desabilitado: vendaParaImprimir !== null }}
          />
        </aside>
      </div>

      <JanelaCliente
        aberta={janela?.tipo === 'CLIENTE'}
        clienteAtual={carrinho.cliente}
        aoFechar={fecharJanela}
        aoEscolher={(cliente) => {
          const resultado = carrinho.definirCliente(cliente)
          setJanela(null)
          if (!resultado.ok) {
            recusar(resultado.erro)
          }
        }}
      />
      <JanelaDesconto
        desconto={janela?.tipo === 'DESCONTO' ? janela.desconto : null}
        limiteDoOperador={usuario.perfil === 'ADMIN' ? null : (configuracao?.descontoMaximoOperador ?? null)}
        aoFechar={fecharJanela}
        aoAplicar={(alvo, desconto) => {
          const resultado = carrinho.aplicarDesconto(alvo, desconto)
          setJanela(null)
          if (!resultado.ok) {
            recusar(resultado.erro)
          }
        }}
      />
      <JanelaConfirmar confirmacao={janela?.tipo === 'CONFIRMAR' ? janela.confirmacao : null} aoFechar={fecharJanela} />
      <JanelaPagamento
        aberta={janela?.tipo === 'PAGAMENTO'}
        carrinho={carrinho.carrinho}
        tentativa={carrinho.tentativa}
        aoMudarTentativa={carrinho.definirTentativa}
        sessaoId={sessao.id}
        calculoInicial={calculo.calculo}
        aoTotalMudar={calculo.recalcular}
        pagamentosGuardados={rascunho && rascunho.carrinho === carrinho.carrinho ? rascunho.pagamentos : SEM_PAGAMENTOS}
        aoMudarPagamentos={guardarPagamentos}
        aoFechar={fecharJanela}
        aoConcluir={(venda) => {
          carrinho.limpar()
          setErrosDaVenda(null)
          setSelecionadaId(null)
          setDestaque(null)
          setRemovida(null)
          setJanela(null)
          // A venda e o troco ficam no painel, logo abaixo do TOTAL (UX 6), e nao no topo.
          setUltimaVenda(venda)
          void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'vendas'] })
          // A venda baixou o estoque: a busca e os produtos mostram o saldo novo.
          void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'busca'] })
          // O catalogo mostra o saldo novo e reordena os mais vendidos.
          void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'catalogo'] })
          void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
          void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
        }}
        aoFalharNosDados={(mensagensDaVenda, carrinhoEnviado) => {
          setErrosDaVenda({ carrinho: carrinhoEnviado, mensagens: mensagensDaVenda })
          setJanela(null)
          avisos.erro('Confira os itens marcados em vermelho.')
          tocarBipeDeErro()
        }}
        aoCaixaMudou={(mensagem, relida) => {
          setJanela(null)
          avisos.erro(mensagem)
          if (relida !== undefined) {
            queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, relida)
          }
          // O carrinho continua no navegador; a tela mostra o estado do caixa.
          void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
        }}
      />
      <JanelaVendasEmEspera
        aberta={janela?.tipo === 'ESPERA'}
        vendas={espera.vendas}
        temVendaAberta={linhas.length > 0}
        aoFechar={fecharJanela}
        aoRetomar={retomar}
        aoDescartar={(id) => espera.substituir(tirarDaEspera(espera.vendas, id))}
      />
      <JanelaVendasDoCaixa
        aberta={janela?.tipo === 'VENDAS'}
        sessaoId={sessao.id}
        ehAdmin={usuario.perfil === 'ADMIN'}
        aoFechar={fecharJanela}
        aoImprimir={setVendaParaImprimir}
        aoCancelarVenda={(cancelada) =>
          // A ultima venda cancelada no F8: o painel e o F9 passam a mostrar e imprimir a cancelada.
          setUltimaVenda((atual) => (atual?.id === cancelada.id ? cancelada : atual))
        }
      />
      <ImpressaoDoComprovante
        venda={vendaParaImprimir}
        nomeDaEmpresa={usuario.empresa.nome}
        aoTerminar={terminarImpressao}
      />
    </div>
  )
}
