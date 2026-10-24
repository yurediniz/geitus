import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { acaoDoAtalho, type AcaoDoPdv } from '@/features/pdv/atalhosDoPdv'
import { tocarBipeDeErro } from '@/features/pdv/bipeDeErro'
import { CampoDeLeitura } from '@/features/pdv/CampoDeLeitura'
import { CAIXA_QUERY_KEY, CHAVE_DA_SESSAO_ATUAL } from '@/features/cash-register/caixaQuery'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import type { Carrinho, LinhaDoCarrinho } from '@/features/pdv/carrinho'
import { focarCampoDeLeitura, ID_CAMPO_DE_LEITURA } from '@/features/pdv/focoDoPdv'
import { JanelaBusca } from '@/features/pdv/JanelaBusca'
import { JanelaCliente } from '@/features/pdv/JanelaCliente'
import { JanelaConfirmar, type Confirmacao } from '@/features/pdv/JanelaConfirmar'
import { JanelaDesconto, type AlvoDoDesconto } from '@/features/pdv/JanelaDesconto'
import { JanelaPagamento } from '@/features/pdv/JanelaPagamento'
import { JanelaVendasDoCaixa } from '@/features/pdv/JanelaVendasDoCaixa'
import { JanelaVendasEmEspera } from '@/features/pdv/JanelaVendasEmEspera'
import { ListaDeLinhas } from '@/features/pdv/ListaDeLinhas'
import { ehDoPagamento, separarMensagens } from '@/features/pdv/mensagensDoCalculo'
import { PainelDoTotal, type AcaoDoPainel } from '@/features/pdv/PainelDoTotal'
import { PDV_QUERY_KEY } from '@/features/pdv/pdvQuery'
import { useCalculo } from '@/features/pdv/useCalculo'
import { MENSAGEM_TENTATIVA_PENDENTE, useCarrinho } from '@/features/pdv/useCarrinho'
import { porEmEspera, tirarDaEspera, useVendasEmEspera } from '@/features/pdv/vendasEmEspera'
import type { AvisosDaTela } from '@/hooks/useFeedbackDaTela'
import { gerarUuid } from '@/lib/uuid'
import type { Usuario } from '@/types/auth'
import type { SessaoDeCaixa } from '@/types/caixa'
import type { ConfiguracaoDoPdv, LinhaCalculada, MensagemDoCalculo, Venda } from '@/types/pdv'

type Janela =
  | { tipo: 'BUSCA'; texto: string }
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
}

const MENSAGEM_BLOQUEADO = 'Corrija os erros da venda antes de pagar.'
const MENSAGEM_CALCULANDO = 'Aguarde o cálculo da venda.'
const MENSAGEM_SEM_ITENS = 'Lance um item primeiro.'
const MENSAGEM_AGUARDE_A_LEITURA = 'Aguarde a leitura…'

/** "Venda nº 128 concluída · Troco R$ 5,00" (sem troco, so o numero). */
function mensagemDaVendaConcluida(venda: Venda): string {
  return venda.troco > 0
    ? `Venda nº ${venda.numero} concluída · Troco ${formatarReais(venda.troco)}`
    : `Venda nº ${venda.numero} concluída`
}

/**
 * A venda com o caixa aberto (spec do PDV §6.2): a lista de linhas, o campo
 * "Código ou nome" no rodape (foco permanente) e a coluna do total. O
 * carrinho fica no navegador; o calculo exibido e sempre o do servidor.
 */
export function TelaDeVenda({ sessao, usuario, configuracao, avisos }: TelaDeVendaProps) {
  const queryClient = useQueryClient()
  const venderSemEstoque = configuracao?.venderSemEstoque ?? true
  const opcoes = useMemo(() => ({ venderSemEstoque }), [venderSemEstoque])
  const carrinho = useCarrinho(usuario.empresa.id, usuario.id, opcoes)
  const calculo = useCalculo(carrinho.carrinho)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [ultimaId, setUltimaId] = useState<string | null>(null)
  const [erroDaLeitura, setErroDaLeitura] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)
  const [errosDaVenda, setErrosDaVenda] = useState<ErrosDaVenda | null>(null)
  const [leiturasPendentes, setLeiturasPendentes] = useState(0)
  const [avisoDaLeitura, setAvisoDaLeitura] = useState<string | null>(null)
  const espera = useVendasEmEspera(usuario.empresa.id, usuario.id)

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
    (tentativaTravada || (calculo.atualizado && calculo.falhaDeRede === null && !temErro))

  const recusar = useCallback((mensagem: string) => {
    setErroDaLeitura(mensagem)
    tocarBipeDeErro()
  }, [])

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

  const executar = (acao: AcaoDoPdv) => {
    switch (acao) {
      case 'BUSCA':
        setJanela({ tipo: 'BUSCA', texto: '' })
        return
      case 'CLIENTE':
        if (livreParaMudar()) {
          setJanela({ tipo: 'CLIENTE' })
        }
        return
      case 'DESCONTO_ITEM':
        if (!livreParaMudar()) {
          return
        }
        if (!selecionada) {
          recusar(MENSAGEM_SEM_ITENS)
          return
        }
        setJanela({
          tipo: 'DESCONTO',
          desconto: {
            alvo: selecionada.id,
            titulo: 'Desconto do item',
            descricao: selecionada.produto.nome,
            atual: selecionada.desconto,
          },
        })
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
      case 'MENOS': {
        if (!selecionada) {
          return
        }
        const resultado = carrinho.alterarQuantidade(selecionada.id, acao === 'MAIS' ? 1 : -1)
        if (!resultado.ok) {
          recusar(resultado.erro)
        }
        return
      }
      case 'REMOVER':
        if (!selecionada || !livreParaMudar()) {
          return
        }
        if (selecionada.desconto) {
          const linha = selecionada
          setJanela({
            tipo: 'CONFIRMAR',
            confirmacao: {
              titulo: `Remover ${linha.produto.nome}?`,
              descricao: 'A linha tem desconto. O desconto também sai.',
              confirmar: 'Remover',
              aoConfirmar: () => {
                carrinho.remover(linha.id)
                setJanela(null)
              },
            },
          })
          return
        }
        carrinho.remover(selecionada.id)
        focarCampoDeLeitura()
        return
      case 'PAGAMENTO':
        if (linhas.length === 0) {
          recusar(MENSAGEM_SEM_ITENS)
        } else if (leiturasPendentes > 0) {
          // Um bipe ainda nao entrou no carrinho: pagar agora deixaria o item de fora.
          setAvisoDaLeitura(MENSAGEM_AGUARDE_A_LEITURA)
        } else if (tentativaTravada) {
          setErroDaLeitura(null)
          setJanela({ tipo: 'PAGAMENTO' })
        } else if (temErro) {
          recusar(MENSAGEM_BLOQUEADO)
        } else if (!podePagar) {
          recusar(calculo.falhaDeRede ?? MENSAGEM_CALCULANDO)
        } else {
          setErroDaLeitura(null)
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
        carrinho.limpar()
        setErroDaLeitura(null)
        avisos.sucesso('Venda em espera.')
        focarCampoDeLeitura()
        return
      }
      case 'VENDAS_EM_ESPERA':
        setJanela({ tipo: 'ESPERA' })
        return
      case 'VENDAS_DO_CAIXA':
        setJanela({ tipo: 'VENDAS' })
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

  const lancou = (linhaId: string | undefined) => {
    setErroDaLeitura(null)
    if (linhaId) {
      setSelecionadaId(linhaId)
      setUltimaId(linhaId)
    }
  }

  const acoes: AcaoDoPainel[] = [
    { atalho: 'F2', rotulo: 'Buscar', aoClicar: () => executar('BUSCA') },
    { atalho: 'F3', rotulo: 'Cliente', aoClicar: () => executar('CLIENTE') },
    { atalho: 'F4', rotulo: 'Desconto do item', aoClicar: () => executar('DESCONTO_ITEM'), desabilitado: !selecionada },
    {
      atalho: 'Shift+F4',
      rotulo: 'Desconto da venda',
      aoClicar: () => executar('DESCONTO_TOTAL'),
      desabilitado: linhas.length === 0,
    },
    { atalho: 'F6', rotulo: 'Pôr em espera', aoClicar: () => executar('POR_EM_ESPERA'), desabilitado: linhas.length === 0 },
    { atalho: 'F7', rotulo: `Em espera (${espera.vendas.length})`, aoClicar: () => executar('VENDAS_EM_ESPERA') },
    { atalho: 'F8', rotulo: 'Vendas do caixa', aoClicar: () => executar('VENDAS_DO_CAIXA') },
    {
      atalho: 'F10',
      rotulo: 'Pagamento',
      aoClicar: () => executar('PAGAMENTO'),
      desabilitado: !podePagar,
      principal: true,
    },
  ]

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
    carrinho.substituir(escolhida.carrinho)
    setSelecionadaId(null)
    setUltimaId(null)
    setErroDaLeitura(null)
    setJanela(null)
    avisos.sucesso('Venda retomada.')
  }

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-cols-[minmax(0,1fr)_22rem] gap-6">
      <section aria-label="Venda" className="flex min-h-0 flex-col rounded-xl bg-card shadow-sm">
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ListaDeLinhas
            linhas={linhas}
            calculoPorLinha={calculoPorLinha}
            errosPorLinha={mensagens.errosPorLinha}
            avisosPorLinha={mensagens.avisosPorLinha}
            selecionadaId={selecionada?.id ?? null}
            ultimaId={ultimaId}
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
          />
        </div>
        <div className="border-t p-4">
          <CampoDeLeitura
            erro={erroDaLeitura}
            aviso={avisoDaLeitura}
            capturarTeclas={janela === null}
            aoMudarPendentes={mudarPendentes}
            aoDigitar={() => setErroDaLeitura(null)}
            aoResolver={(item) => {
              const resultado = carrinho.adicionar(item)
              if (resultado.ok) {
                lancou(resultado.linhaId)
              } else {
                recusar(resultado.erro)
              }
            }}
            aoRecusar={recusar}
            aoBuscar={(texto) => setJanela({ tipo: 'BUSCA', texto })}
          />
        </div>
      </section>

      <PainelDoTotal
        calculo={calculo.calculo}
        vazio={linhas.length === 0}
        calculando={calculo.calculando}
        erros={mensagens.gerais}
        falhaDeRede={calculo.falhaDeRede}
        aoTentarDeNovo={calculo.recalcular}
        clienteNome={carrinho.cliente?.nome ?? null}
        pontoEOperador={`${sessao.ponto.nome} · ${usuario.nome}`}
        acoes={acoes}
      />

      <JanelaBusca
        textoInicial={janela?.tipo === 'BUSCA' ? janela.texto : null}
        aoFechar={fecharJanela}
        aoEscolher={(produto) => {
          setJanela(null)
          const resultado = carrinho.adicionar({
            tipo: 'UNIDADE',
            quantidade: 1,
            produto,
            embalagemId: null,
            codigoLido: null,
          })
          if (resultado.ok) {
            lancou(resultado.linhaId)
          } else {
            recusar(resultado.erro)
          }
        }}
      />
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
        aoFechar={fecharJanela}
        aoConcluir={(venda) => {
          carrinho.limpar()
          setErrosDaVenda(null)
          setSelecionadaId(null)
          setUltimaId(null)
          setJanela(null)
          avisos.sucesso(mensagemDaVendaConcluida(venda))
          void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'vendas'] })
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
      />
    </div>
  )
}
