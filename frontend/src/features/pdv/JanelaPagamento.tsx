import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowLeft, Banknote, CreditCard, Loader2, QrCode, Trash2, WalletCards } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { CLASSE_DO_BOTAO_DA_BARRA } from '@/features/pdv/estiloDaBarra'
import { paraRequest, unidadeDaLinha, type Carrinho, type TentativaDeVenda, type TravaDaTentativa } from '@/features/pdv/carrinho'
import { classificarFalhaDaVenda, MENSAGEM_ABRA_O_CAIXA, MENSAGEM_TERMINE_O_FECHAMENTO } from '@/features/pdv/errosDaVenda'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import { JanelaTotalMudou } from '@/features/pdv/JanelaTotalMudou'
import { useCalculo } from '@/features/pdv/useCalculo'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import { gerarUuid } from '@/lib/uuid'
import { cn } from '@/lib/utils'
import { sessaoAtual } from '@/services/caixaService'
import { calcular, finalizar } from '@/services/pdvService'
import { FORMAS_DE_PAGAMENTO, type FormaDePagamento, type SessaoDeCaixa } from '@/types/caixa'
import type { CalculoDaVenda, FinalizarVendaRequest, MensagemDoCalculo, PagamentoInformado, Venda } from '@/types/pdv'

export interface JanelaPagamentoProps {
  aberta: boolean
  carrinho: Carrinho
  /** A tentativa pendente de finalizar (a chave guardada com o carrinho). */
  tentativa: TentativaDeVenda | null
  aoMudarTentativa: (tentativa: TentativaDeVenda | null) => void
  /** A sessao em que a venda e feita (o caixa relido com outro id e outra sessao). */
  sessaoId: string
  /** O calculo da tela (sem pagamentos), mostrado ate o da janela chegar. */
  calculoInicial: CalculoDaVenda | null
  aoFechar: () => void
  aoConcluir: (venda: Venda) => void
  /** 409/404 com `itens[i]` ou `clienteId`: a tela marca as linhas e mantem o carrinho. */
  aoFalharNosDados: (mensagens: MensagemDoCalculo[], carrinhoEnviado: Carrinho) => void
  /**
   * O caixa do usuario mudou (fechado ou em conferencia em outra aba). `sessao`
   * e a relida do servidor; undefined quando a releitura falhou.
   */
  aoCaixaMudou: (mensagem: string, sessao: SessaoDeCaixa | null | undefined) => void
  /** O total mudou e a venda voltou para a tela: ela recalcula. */
  aoTotalMudar: () => void
  /** Os pagamentos informados antes de voltar ao carrinho (a tela os guarda enquanto o carrinho nao muda). */
  pagamentosGuardados: readonly PagamentoInformado[]
  aoMudarPagamentos: (pagamentos: PagamentoInformado[]) => void
}

const ICONE_DA_FORMA: Readonly<Record<FormaDePagamento, LucideIcon>> = {
  DINHEIRO: Banknote,
  DEBITO: CreditCard,
  CREDITO: WalletCards,
  PIX: QrCode,
}
const FALHA_DE_REDE = 'Não foi possível finalizar a venda. Confira a conexão e tente de novo.'
const MENSAGEM_VALOR = 'Informe um valor maior que zero.'
const MENSAGEM_TALVEZ_REGISTRADA =
  'A última tentativa pode ter sido registrada. Tente de novo com os mesmos valores.'
const MENSAGEM_PODE_TER_SIDO_REGISTRADA = 'Esta venda pode já ter sido registrada. Confira em Vendas do caixa (F8).'
const MENSAGEM_JA_CANCELADA =
  'Esta venda já tinha sido registrada e depois cancelada. Confira em Vendas do caixa (F8).'
const MENSAGEM_ANTES_DE_DESCARTAR =
  'Confira em Vendas do caixa (F8) se a venda não foi registrada antes de mudar o pagamento.'

function emCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Pagamento (F10; spec do PDV): 1 Dinheiro, 2 Debito, 3 Credito e
 * 4 PIX escolhem a forma e preenchem o que falta; Enter adiciona. Com o pago
 * cobrindo o total, Enter finaliza. A chave de idempotencia nasce na primeira
 * tentativa e fica com o carrinho; so e trocada depois de sucesso ou de uma
 * recusa definitiva. Sem resposta do servidor, o pagamento trava e so o mesmo
 * corpo e reenviado, ate o operador conferir e descartar a tentativa.
 */
export function JanelaPagamento({ aberta, aoFechar, ...props }: JanelaPagamentoProps) {
  const [enviando, setEnviando] = useState(false)
  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && !enviando && aoFechar()}>
      {aberta && <ConteudoDoPagamento aoFechar={aoFechar} aoMudarEnvio={setEnviando} {...props} />}
    </Dialog>
  )
}

function ConteudoDoPagamento({
  carrinho,
  tentativa,
  aoMudarTentativa,
  sessaoId,
  calculoInicial,
  aoFechar,
  aoConcluir,
  aoFalharNosDados,
  aoCaixaMudou,
  aoTotalMudar,
  pagamentosGuardados,
  aoMudarPagamentos,
  aoMudarEnvio,
}: Omit<JanelaPagamentoProps, 'aberta'> & { aoMudarEnvio: (enviando: boolean) => void }) {
  const trava = tentativa?.trava ?? null
  const [pagamentos, setPagamentos] = useState<PagamentoInformado[]>(() =>
    tentativa?.trava && tentativa.corpo ? tentativa.corpo.pagamentos : [...pagamentosGuardados],
  )

  // A tela guarda o que foi informado: voltar ao carrinho (Esc) e reabrir nao perde os pagamentos.
  useEffect(() => {
    aoMudarPagamentos(pagamentos)
  }, [pagamentos, aoMudarPagamentos])
  const [forma, setForma] = useState<FormaDePagamento | null>(null)
  const [valor, setValor] = useState('')
  const [erroDoValor, setErroDoValor] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [focarFinalizar, setFocarFinalizar] = useState(false)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  const [totalMudou, setTotalMudou] = useState<{ anterior: number; novo: CalculoDaVenda | null } | null>(null)
  const enviandoRef = useRef(false)
  const formasRef = useRef<HTMLDivElement>(null)
  const valorRef = useRef<HTMLInputElement>(null)
  const finalizarRef = useRef<HTMLButtonElement>(null)

  // Sem pagamento ainda, o calculo e o mesmo da tela: nada de pedido repetido (S10).
  const calculo = useCalculo(carrinho, pagamentos, { ativo: pagamentos.length > 0 })
  const exibido = calculo.calculo ?? calculoInicial
  const faltaDoServidor = exibido?.faltaPagar ?? 0
  const errosDoCalculo = useMemo(
    () =>
      [...(exibido?.erros ?? []), ...calculo.errosDosDados]
        // O "Falta pagar" do servidor (campo `pagamentos`, com falta) ja aparece em destaque: nao e erro enquanto se paga.
        .filter((mensagem) => !(mensagem.campo === 'pagamentos' && faltaDoServidor > 0))
        .map((mensagem) => mensagem.mensagem),
    [exibido, calculo.errosDosDados, faltaDoServidor],
  )
  const pagamentoCompleto =
    exibido !== null && calculo.atualizado && pagamentos.length > 0 && exibido.faltaPagar === 0 && errosDoCalculo.length === 0
  const podeFinalizar =
    trava === null &&
    exibido !== null &&
    calculo.atualizado &&
    calculo.falhaDoCalculo === null &&
    pagamentos.length > 0 &&
    exibido.faltaPagar === 0 &&
    errosDoCalculo.length === 0 &&
    !enviando
  const faltaLocal = Math.max(
    0,
    emCentavos(exibido?.total ?? 0) - pagamentos.reduce((soma, pagamento) => soma + emCentavos(pagamento.valor), 0),
  )

  useEffect(() => {
    if (forma !== null) {
      valorRef.current?.focus()
    }
  }, [forma])

  useEffect(() => {
    if (focarFinalizar && podeFinalizar) {
      finalizarRef.current?.focus()
      setFocarFinalizar(false)
    }
  }, [focarFinalizar, podeFinalizar])

  const mudarEnvio = (valorDoEnvio: boolean) => {
    enviandoRef.current = valorDoEnvio
    setEnviando(valorDoEnvio)
    aoMudarEnvio(valorDoEnvio)
  }

  const escolher = (escolhida: FormaDePagamento) => {
    if (trava !== null) {
      return
    }
    setForma(escolhida)
    setErroDoValor(null)
    setValor(faltaLocal > 0 ? (faltaLocal / 100).toFixed(2) : '')
  }

  const desfazerForma = () => {
    setForma(null)
    setErroDoValor(null)
    formasRef.current?.focus()
  }

  const tratarFalha = async (falha: unknown, dados: FinalizarVendaRequest, travaDoEnvio: TravaDaTentativa | null) => {
    const classificada = classificarFalhaDaVenda(falha)
    switch (classificada.tipo) {
      case 'REDE':
        // A venda pode ter sido gravada: o corpo fica travado para o reenvio com a mesma chave.
        aoMudarTentativa({ chave: dados.chave, corpo: dados, trava: 'REDE' })
        return
      case 'JA_REGISTRADA':
        aoMudarTentativa({ chave: dados.chave, corpo: dados, trava: 'OUTROS_DADOS' })
        return
      case 'INVALIDO':
        aoMudarTentativa(null)
        setErro(classificada.mensagem)
        return
      case 'DADOS':
        aoMudarTentativa(null)
        aoFalharNosDados(classificada.mensagens, carrinho)
        return
      case 'TOTAL_MUDOU': {
        // A mesma chave vai no "Confirmar e finalizar"; recusar troca a chave.
        setTotalMudou({ anterior: dados.totalEsperado, novo: null })
        calculo.recalcular()
        try {
          const novo = await calcular(paraRequest(carrinho, pagamentos), new AbortController().signal)
          setTotalMudou((atual) => (atual ? { ...atual, novo } : atual))
        } catch {
          setTotalMudou(null)
          setErro(FALHA_DE_REDE)
        }
        return
      }
      case 'CAIXA': {
        // Decide pela situacao real do caixa, relida do servidor (e nao pelo texto do erro).
        let relida: SessaoDeCaixa | null
        try {
          relida = await sessaoAtual()
        } catch {
          if (classificada.mensagem === MENSAGEM_ABRA_O_CAIXA || classificada.mensagem === MENSAGEM_TERMINE_O_FECHAMENTO) {
            aoCaixaMudou(classificada.mensagem, undefined)
          } else {
            setErro(classificada.mensagem)
          }
          return
        }
        if (relida === null || relida.status !== 'ABERTA' || relida.id !== sessaoId) {
          if (travaDoEnvio === null) {
            aoMudarTentativa(null)
          } else {
            // A venda pode ter sido gravada antes (REDE) ou ja existe (OUTROS_DADOS): a chave e a trava ficam.
            // Com o caixa reaberto, o "Tentar de novo" manda a mesma chave e o servidor devolve a venda original.
            aoMudarTentativa({ chave: dados.chave, corpo: dados, trava: travaDoEnvio })
          }
          aoCaixaMudou(classificada.mensagem, relida)
        } else {
          setErro(classificada.mensagem)
        }
      }
    }
  }

  /** Envia o corpo; a chave fica guardada com o carrinho antes do envio (pode haver recarga no meio). */
  const enviarCorpo = (dados: FinalizarVendaRequest) => {
    if (enviandoRef.current) {
      return
    }
    mudarEnvio(true)
    setErro(null)
    aoMudarTentativa({ chave: dados.chave, corpo: dados, trava })
    finalizar(dados)
      .then((venda) => {
        mudarEnvio(false)
        // A chave ja era de uma venda gravada e depois cancelada: nada foi vendido agora.
        // O carrinho fica, e a proxima tentativa nasce com outra chave.
        aoMudarTentativa(null)
        if (venda.status === 'CANCELADA') {
          setErro(MENSAGEM_JA_CANCELADA)
          return
        }
        aoConcluir(venda)
      })
      .catch(async (falha: unknown) => {
        mudarEnvio(false)
        setTotalMudou(null)
        await tratarFalha(falha, dados, trava)
      })
  }

  const enviar = (totalEsperado: number) => {
    const chave = tentativa?.chave ?? gerarUuid()
    enviarCorpo({ ...paraRequest(carrinho, pagamentos), chave, totalEsperado })
  }

  const tentarDeNovo = () => {
    if (tentativa?.corpo) {
      enviarCorpo(tentativa.corpo)
    }
  }

  const adicionar = () => {
    if (forma === null || trava !== null) {
      return
    }
    const numero = Number(valor)
    if (valor === '' || !(numero > 0)) {
      if (podeFinalizar) {
        enviar(exibido.total)
        return
      }
      setErroDoValor(MENSAGEM_VALOR)
      return
    }
    if (forma !== 'DINHEIRO' && emCentavos(numero) > faltaLocal) {
      // Recusa na hora, sem esperar o servidor: cartao e PIX nao dao troco.
      setErroDoValor(
        `${ROTULO_DA_FORMA[forma]} não pode passar do que falta pagar (${formatarReais(faltaLocal / 100)}). O troco só sai do dinheiro.`,
      )
      return
    }
    const existente = pagamentos.find((pagamento) => pagamento.forma === forma)
    const novos = existente
      ? pagamentos.map((pagamento) =>
          pagamento.forma === forma ? { forma, valor: (emCentavos(pagamento.valor) + emCentavos(numero)) / 100 } : pagamento,
        )
      : [...pagamentos, { forma, valor: numero }]
    setPagamentos(novos)
    setForma(null)
    setValor('')
    setErro(null)
    const cobre = novos.reduce((soma, pagamento) => soma + emCentavos(pagamento.valor), 0) >= emCentavos(exibido?.total ?? 0)
    if (cobre) {
      setFocarFinalizar(true)
    } else {
      formasRef.current?.focus()
    }
  }

  const remover = (removida: FormaDePagamento) => {
    setPagamentos((atuais) => atuais.filter((pagamento) => pagamento.forma !== removida))
    formasRef.current?.focus()
  }

  const aoTeclarNasFormas = (event: KeyboardEvent<HTMLDivElement>) => {
    const indice = Number(event.key) - 1
    if (event.target !== valorRef.current && Number.isInteger(indice) && indice >= 0 && indice < FORMAS_DE_PAGAMENTO.length) {
      event.preventDefault()
      escolher(FORMAS_DE_PAGAMENTO[indice])
    }
  }

  const travado = trava !== null || enviando
  const descontos = exibido ? exibido.descontoItens + exibido.descontoTotal : 0
  const informado = pagamentos.reduce((soma, pagamento) => soma + emCentavos(pagamento.valor), 0) / 100

  return (
    <DialogContent
      showCloseButton={false}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        formasRef.current?.focus()
      }}
      onCloseAutoFocus={devolverFocoAoCampo}
      onEscapeKeyDown={(event) => {
        if (enviandoRef.current) {
          event.preventDefault()
        } else if (valorRef.current !== null && document.activeElement === valorRef.current) {
          // Esc no valor desfaz so a forma escolhida; a janela continua. (O campo so existe com uma forma escolhida;
          // o Radix guarda este callback, entao a decisao e pelo elemento, e nao pelo estado.)
          event.preventDefault()
          desfazerForma()
        }
      }}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
      onKeyDown={(event) => {
        // Enter fora do campo e dos botoes finaliza quando o pago cobre o total.
        const alvo = event.target as HTMLElement
        if (event.key === 'Enter' && alvo.tagName !== 'BUTTON' && alvo.tagName !== 'INPUT' && podeFinalizar) {
          event.preventDefault()
          enviar(exibido.total)
        }
      }}
      className="top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none"
    >
      <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 bg-barra-pdv px-4 py-3 text-barra-pdv-foreground md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
            G
          </span>
          <div className="min-w-0 leading-tight">
            <DialogTitle className="font-display text-xl font-semibold">Pagamento</DialogTitle>
            <DialogDescription className="text-sm text-barra-pdv-muted">
              {pagamentoCompleto && trava === null
                ? 'Pagamento completo. Enter finaliza a venda.'
                : 'Escolha a forma com as teclas 1 a 4 e confirme o valor com Enter.'}
            </DialogDescription>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          className={cn(CLASSE_DO_BOTAO_DA_BARRA, 'ml-auto')}
          onClick={aoFechar}
          disabled={enviando}
          aria-keyshortcuts="Escape"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao carrinho
          <kbd aria-hidden="true" className="rounded bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
            Esc
          </kbd>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]">
        <div className="min-w-0 space-y-4">
          {trava !== null && (
            <div role="alert" className="space-y-3 rounded-2xl bg-warning-soft px-5 py-4 text-sm text-warning-soft-foreground">
              <p className="flex items-start gap-2 font-medium">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {trava === 'REDE' ? MENSAGEM_TALVEZ_REGISTRADA : MENSAGEM_PODE_TER_SIDO_REGISTRADA}
              </p>
              {confirmandoDescarte ? (
                <div className="space-y-2">
                  <p className="text-foreground">{MENSAGEM_ANTES_DE_DESCARTAR}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmandoDescarte(false)}>
                      Voltar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="min-h-11"
                      onClick={() => {
                        setConfirmandoDescarte(false)
                        // A edicao volta; a proxima tentativa nasce com outra chave.
                        aoMudarTentativa(null)
                        formasRef.current?.focus()
                      }}
                    >
                      Descartar tentativa
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {trava === 'REDE' && (
                    <Button type="button" className="min-h-11" onClick={tentarDeNovo} disabled={enviando}>
                      {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Tentar de novo
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setConfirmandoDescarte(true)}
                    disabled={enviando}
                  >
                    Descartar tentativa
                  </Button>
                </div>
              )}
            </div>
          )}

          <section className="space-y-4 rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="font-display text-lg font-semibold">1. Forma de pagamento</h3>
            <div
              ref={formasRef}
              role="group"
              aria-label="Formas de pagamento"
              tabIndex={-1}
              onKeyDown={aoTeclarNasFormas}
              className="grid grid-cols-2 gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid-cols-4"
            >
              {FORMAS_DE_PAGAMENTO.map((opcao, indice) => {
                const Icone = ICONE_DA_FORMA[opcao]
                const escolhida = forma === opcao
                return (
                  <Button
                    key={opcao}
                    type="button"
                    variant="outline"
                    aria-pressed={escolhida}
                    aria-keyshortcuts={String(indice + 1)}
                    onClick={() => escolher(opcao)}
                    disabled={travado}
                    className={cn(
                      'relative h-24 flex-col gap-2 rounded-xl text-base font-medium',
                      escolhida && 'border-2 border-primary bg-accent text-accent-foreground hover:bg-accent',
                    )}
                  >
                    <kbd className="absolute top-2 left-2 rounded bg-foreground/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
                      {indice + 1}
                    </kbd>
                    <Icone className="size-6" aria-hidden="true" />
                    {ROTULO_DA_FORMA[opcao]}
                  </Button>
                )
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="font-display text-lg font-semibold">2. Valor</h3>
            {forma !== null && trava === null ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="pdv-pagamento-valor" className="text-sm font-medium">
                    {`Valor em ${ROTULO_DA_FORMA[forma]}`}
                  </label>
                  <div className="flex gap-2">
                    <CampoMoeda
                      ref={valorRef}
                      id="pdv-pagamento-valor"
                      value={valor}
                      onChange={(novo) => {
                        setValor(novo)
                        setErroDoValor(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          adicionar()
                        }
                      }}
                      onFocus={(event) => event.currentTarget.select()}
                      disabled={enviando}
                      aria-invalid={erroDoValor ? true : undefined}
                      aria-describedby={erroDoValor ? 'pdv-pagamento-valor-erro' : undefined}
                      className="h-14 rounded-xl text-2xl font-semibold md:text-2xl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 rounded-xl"
                      onClick={() => {
                        setValor(faltaLocal > 0 ? (faltaLocal / 100).toFixed(2) : '')
                        setErroDoValor(null)
                        valorRef.current?.focus()
                      }}
                      disabled={enviando || faltaLocal === 0}
                    >
                      Usar o que falta
                    </Button>
                  </div>
                  <ErroDoCampo id="pdv-pagamento-valor-erro" mensagem={erroDoValor ?? undefined} />
                </div>
                <Button type="button" className="h-14 w-full rounded-xl text-lg font-semibold" onClick={adicionar} disabled={enviando}>
                  Adicionar pagamento
                  <kbd aria-hidden="true" className="rounded bg-primary-foreground/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
                    Enter
                  </kbd>
                </Button>
                <p className="text-xs text-muted-foreground">Adicionar não conclui a venda. Esc desfaz a forma escolhida.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {trava === null ? 'Escolha a forma acima ou tecle 1 a 4.' : 'O pagamento está travado até conferir a tentativa.'}
              </p>
            )}
          </section>

          {errosDoCalculo.map((mensagem) => (
            <p key={mensagem} className="text-sm font-medium text-destructive">
              {mensagem}
            </p>
          ))}
          {calculo.falhaDoCalculo && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-warning-soft-foreground">{calculo.falhaDoCalculo}</p>
              <Button type="button" variant="outline" className="h-11" onClick={calculo.recalcular}>
                Calcular de novo
              </Button>
            </div>
          )}
          {erro && <ErroInline mensagem={erro} />}
        </div>

        <div className="min-w-0 space-y-4">
          <section className="space-y-4 rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="font-display text-lg font-semibold">3. Resumo e pagamentos</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatarReais(exibido?.subtotal ?? 0)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Descontos</dt>
                <dd className={cn('tabular-nums', descontos > 0 && 'text-success-soft-foreground')}>
                  {descontos > 0 ? `− ${formatarReais(descontos)}` : formatarReais(0)}
                </dd>
              </div>
            </dl>
            <dl className="flex items-end justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
              <dt className="font-display text-lg font-semibold">Total</dt>
              <dd className="font-display text-3xl font-bold tabular-nums">{formatarReais(exibido?.total ?? 0)}</dd>
            </dl>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Pagamentos informados</h4>
              {pagamentos.length > 0 ? (
                <ul aria-label="Formas usadas" className="divide-y rounded-xl border px-3">
                  {pagamentos.map((pagamento) => {
                    const Icone = ICONE_DA_FORMA[pagamento.forma]
                    return (
                      <li key={pagamento.forma} className="flex items-center gap-3 py-1.5 text-sm">
                        <Icone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="font-medium">{ROTULO_DA_FORMA[pagamento.forma]}</span>
                        <span className="ml-auto font-semibold tabular-nums">{formatarReais(pagamento.valor)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10 text-destructive hover:text-destructive"
                          aria-label={`Remover ${ROTULO_DA_FORMA[pagamento.forma]}`}
                          onClick={() => remover(pagamento.forma)}
                          disabled={travado}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
              )}
            </div>

            <dl className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">Total informado</dt>
                <dd className="font-semibold tabular-nums">{formatarReais(informado)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-medium">Falta pagar</dt>
                <dd
                  aria-live="polite"
                  className={cn(
                    'font-display font-semibold tabular-nums',
                    // Enquanto falta, o que falta e o numero que manda.
                    faltaDoServidor > 0 ? 'text-4xl text-warning-soft-foreground' : 'text-2xl',
                  )}
                >
                  {formatarReais(faltaDoServidor)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-medium">Troco</dt>
                <dd
                  aria-live="polite"
                  className={cn(
                    'font-display font-semibold tabular-nums',
                    faltaDoServidor === 0 && (exibido?.troco ?? 0) > 0
                      ? 'text-4xl text-success-soft-foreground'
                      : 'text-2xl text-muted-foreground',
                  )}
                >
                  {formatarReais(exibido?.troco ?? 0)}
                </dd>
              </div>
            </dl>

            {trava === null && (
              <Button
                ref={finalizarRef}
                type="button"
                className="h-14 w-full rounded-xl text-lg font-semibold"
                disabled={!podeFinalizar}
                aria-keyshortcuts="Enter"
                onClick={() => exibido && enviar(exibido.total)}
              >
                {enviando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                Finalizar venda
                <kbd aria-hidden="true" className="rounded bg-primary-foreground/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold">
                  Enter
                </kbd>
              </Button>
            )}
          </section>

          <section className="space-y-3 rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="font-display text-lg font-semibold">4. Conferência dos itens</h3>
            <ul aria-label="Itens da venda no pagamento" className="divide-y text-sm">
              {carrinho.linhas.map((linha, indice) => (
                <li key={linha.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{linha.produto.nome}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {`${formatarQuantidade(linha.quantidade, linha.produto.fracionada && linha.embalagemId === null)} ${unidadeDaLinha(linha)}`}
                  </span>
                  <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                    {exibido?.linhas[indice] ? formatarReais(exibido.linhas[indice].valorLiquido) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <JanelaTotalMudou
        anterior={totalMudou?.anterior ?? null}
        novo={totalMudou?.novo ?? null}
        enviando={enviando}
        aoConfirmar={(novoTotal) => enviar(novoTotal)}
        aoVoltar={() => {
          setTotalMudou(null)
          // Recusar o novo total troca a chave; a tela recalcula para mostrar o total certo.
          aoMudarTentativa(null)
          aoTotalMudar()
          aoFechar()
        }}
        aoAjustar={() => {
          // So a janela interna fecha: as formas lancadas ficam para o ajuste (com chave nova).
          setTotalMudou(null)
          aoMudarTentativa(null)
          aoTotalMudar()
          formasRef.current?.focus()
        }}
      />
    </DialogContent>
  )
}