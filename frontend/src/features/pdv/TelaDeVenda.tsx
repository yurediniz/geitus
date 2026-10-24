import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { acaoDoAtalho, type AcaoDoPdv } from '@/features/pdv/atalhosDoPdv'
import { tocarBipeDeErro } from '@/features/pdv/bipeDeErro'
import { CampoDeLeitura } from '@/features/pdv/CampoDeLeitura'
import type { LinhaDoCarrinho } from '@/features/pdv/carrinho'
import { focarCampoDeLeitura, ID_CAMPO_DE_LEITURA } from '@/features/pdv/focoDoPdv'
import { JanelaBusca } from '@/features/pdv/JanelaBusca'
import { JanelaCliente } from '@/features/pdv/JanelaCliente'
import { JanelaConfirmar, type Confirmacao } from '@/features/pdv/JanelaConfirmar'
import { JanelaDesconto, type AlvoDoDesconto } from '@/features/pdv/JanelaDesconto'
import { ListaDeLinhas } from '@/features/pdv/ListaDeLinhas'
import { ehDoPagamento, separarMensagens } from '@/features/pdv/mensagensDoCalculo'
import { PainelDoTotal, type AcaoDoPainel } from '@/features/pdv/PainelDoTotal'
import { useCalculo } from '@/features/pdv/useCalculo'
import { useCarrinho } from '@/features/pdv/useCarrinho'
import type { AvisosDaTela } from '@/hooks/useFeedbackDaTela'
import type { Usuario } from '@/types/auth'
import type { SessaoDeCaixa } from '@/types/caixa'
import type { ConfiguracaoDoPdv, LinhaCalculada } from '@/types/pdv'

type Janela =
  | { tipo: 'BUSCA'; texto: string }
  | { tipo: 'CLIENTE' }
  | { tipo: 'DESCONTO'; desconto: AlvoDoDesconto }
  | { tipo: 'CONFIRMAR'; confirmacao: Confirmacao }

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

/**
 * A venda com o caixa aberto (spec do PDV §6.2): a lista de linhas, o campo
 * "Código ou nome" no rodape (foco permanente) e a coluna do total. O
 * carrinho fica no navegador; o calculo exibido e sempre o do servidor.
 */
export function TelaDeVenda({ sessao, usuario, configuracao }: TelaDeVendaProps) {
  const venderSemEstoque = configuracao?.venderSemEstoque ?? true
  const opcoes = useMemo(() => ({ venderSemEstoque }), [venderSemEstoque])
  const carrinho = useCarrinho(usuario.empresa.id, usuario.id, opcoes)
  const calculo = useCalculo(carrinho.carrinho)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [ultimaId, setUltimaId] = useState<string | null>(null)
  const [erroDaLeitura, setErroDaLeitura] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)

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
    return {
      errosPorLinha: { ...doCalculo.porLinha, ...dosDados.porLinha },
      avisosPorLinha: avisosDasLinhas.porLinha,
      gerais: [...doCalculo.outras, ...dosDados.outras]
        .filter((mensagem) => !ehDoPagamento(mensagem))
        .map((mensagem) => mensagem.mensagem),
    }
  }, [calculo.calculo, calculo.idsDoCalculo, calculo.errosDosDados, calculo.idsDosErros])

  const temErro = mensagens.gerais.length > 0 || Object.keys(mensagens.errosPorLinha).length > 0
  const podePagar = linhas.length > 0 && calculo.atualizado && calculo.falhaDeRede === null && !temErro

  const recusar = useCallback((mensagem: string) => {
    setErroDaLeitura(mensagem)
    tocarBipeDeErro()
  }, [])

  const fecharJanela = useCallback(() => setJanela(null), [])

  const executar = (acao: AcaoDoPdv) => {
    switch (acao) {
      case 'BUSCA':
        setJanela({ tipo: 'BUSCA', texto: '' })
        return
      case 'CLIENTE':
        setJanela({ tipo: 'CLIENTE' })
        return
      case 'DESCONTO_ITEM':
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
        if (!selecionada) {
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
        return
      case 'PAGAMENTO':
        if (linhas.length === 0) {
          recusar(MENSAGEM_SEM_ITENS)
        } else if (temErro) {
          recusar(MENSAGEM_BLOQUEADO)
        } else if (!podePagar) {
          recusar(calculo.falhaDeRede ?? MENSAGEM_CALCULANDO)
        }
        return
      case 'POR_EM_ESPERA':
      case 'VENDAS_EM_ESPERA':
      case 'VENDAS_DO_CAIXA':
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
    { atalho: 'F10', rotulo: 'Pagamento', aoClicar: () => executar('PAGAMENTO'), desabilitado: !podePagar, principal: true },
  ]

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
          carrinho.definirCliente(cliente)
          setJanela(null)
        }}
      />
      <JanelaDesconto
        desconto={janela?.tipo === 'DESCONTO' ? janela.desconto : null}
        aoFechar={fecharJanela}
        aoAplicar={(alvo, desconto) => {
          carrinho.aplicarDesconto(alvo, desconto)
          setJanela(null)
        }}
      />
      <JanelaConfirmar confirmacao={janela?.tipo === 'CONFIRMAR' ? janela.confirmacao : null} aoFechar={fecharJanela} />
    </div>
  )
}
