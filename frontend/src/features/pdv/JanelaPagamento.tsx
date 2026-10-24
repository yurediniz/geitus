import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Banknote, CreditCard, Loader2, QrCode, Trash2, WalletCards } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { paraRequest, type Carrinho } from '@/features/pdv/carrinho'
import { classificarFalhaDaVenda, MENSAGEM_ABRA_O_CAIXA, MENSAGEM_TERMINE_O_FECHAMENTO } from '@/features/pdv/errosDaVenda'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
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
}

const ICONE_DA_FORMA: Readonly<Record<FormaDePagamento, LucideIcon>> = {
  DINHEIRO: Banknote,
  DEBITO: CreditCard,
  CREDITO: WalletCards,
  PIX: QrCode,
}
const FALHA_DE_REDE = 'Não foi possível finalizar a venda. Confira a conexão e tente de novo.'
const MENSAGEM_VALOR = 'Informe um valor maior que zero.'

function emCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Pagamento (F10; spec do PDV §3.4 e §6.3): 1 Dinheiro, 2 Debito, 3 Credito e
 * 4 PIX escolhem a forma e preenchem o que falta; Enter adiciona. Com o pago
 * cobrindo o total, Enter finaliza. A chave de idempotencia nasce ao abrir a
 * janela e e reenviada igual em cada nova tentativa (rede, total mudou).
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
  calculoInicial,
  aoFechar,
  aoConcluir,
  aoFalharNosDados,
  aoCaixaMudou,
  aoMudarEnvio,
}: Omit<JanelaPagamentoProps, 'aberta'> & { aoMudarEnvio: (enviando: boolean) => void }) {
  const [chave] = useState(gerarUuid)
  const [pagamentos, setPagamentos] = useState<PagamentoInformado[]>([])
  const [forma, setForma] = useState<FormaDePagamento | null>(null)
  const [valor, setValor] = useState('')
  const [erroDoValor, setErroDoValor] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [focarFinalizar, setFocarFinalizar] = useState(false)
  const [totalMudou, setTotalMudou] = useState<{ anterior: number; novo: CalculoDaVenda | null } | null>(null)
  const enviandoRef = useRef(false)
  const formasRef = useRef<HTMLDivElement>(null)
  const valorRef = useRef<HTMLInputElement>(null)
  const finalizarRef = useRef<HTMLButtonElement>(null)

  const calculo = useCalculo(carrinho, pagamentos)
  const exibido = calculo.calculo ?? calculoInicial
  const errosDoCalculo = useMemo(
    () =>
      [...(exibido?.erros ?? []), ...calculo.errosDosDados]
        // "Falta pagar" ja aparece em destaque; nao e erro enquanto se paga.
        .filter((mensagem) => !mensagem.mensagem.startsWith('Falta pagar'))
        .map((mensagem) => mensagem.mensagem),
    [exibido, calculo.errosDosDados],
  )
  const podeFinalizar =
    exibido !== null &&
    calculo.atualizado &&
    calculo.falhaDeRede === null &&
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
    setForma(escolhida)
    setErroDoValor(null)
    setValor(faltaLocal > 0 ? (faltaLocal / 100).toFixed(2) : '')
  }

  const adicionar = () => {
    if (forma === null) {
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

  const tratarFalha = async (falha: unknown, dados: FinalizarVendaRequest) => {
    const classificada = classificarFalhaDaVenda(falha)
    switch (classificada.tipo) {
      case 'REDE':
        setErro(FALHA_DE_REDE)
        return
      case 'INVALIDO':
        setErro(classificada.mensagem)
        return
      case 'DADOS':
        aoFalharNosDados(classificada.mensagens, carrinho)
        return
      case 'TOTAL_MUDOU': {
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
        if (relida === null || relida.status !== 'ABERTA') {
          aoCaixaMudou(classificada.mensagem, relida)
        } else {
          setErro(classificada.mensagem)
        }
      }
    }
  }

  const enviar = (totalEsperado: number) => {
    if (enviandoRef.current) {
      return
    }
    mudarEnvio(true)
    setErro(null)
    const dados: FinalizarVendaRequest = { ...paraRequest(carrinho, pagamentos), chave, totalEsperado }
    finalizar(dados)
      .then((venda) => {
        mudarEnvio(false)
        aoConcluir(venda)
      })
      .catch(async (falha: unknown) => {
        mudarEnvio(false)
        if (totalMudou !== null) {
          setTotalMudou(null)
        }
        await tratarFalha(falha, dados)
      })
  }

  const aoTeclarNasFormas = (event: KeyboardEvent<HTMLDivElement>) => {
    const indice = Number(event.key) - 1
    if (event.target !== valorRef.current && Number.isInteger(indice) && indice >= 0 && indice < FORMAS_DE_PAGAMENTO.length) {
      event.preventDefault()
      escolher(FORMAS_DE_PAGAMENTO[indice])
    }
  }

  return (
    <DialogContent
      showCloseButton={!enviando}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        formasRef.current?.focus()
      }}
      onCloseAutoFocus={devolverFocoAoCampo}
      onEscapeKeyDown={(event) => enviandoRef.current && event.preventDefault()}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
      onKeyDown={(event) => {
        // Enter fora do campo e dos botoes finaliza quando o pago cobre o total.
        const alvo = event.target as HTMLElement
        if (event.key === 'Enter' && alvo.tagName !== 'BUTTON' && alvo.tagName !== 'INPUT' && podeFinalizar) {
          event.preventDefault()
          enviar(exibido.total)
        }
      }}
      className="sm:max-w-xl"
    >
      <DialogHeader>
        <DialogTitle>Pagamento</DialogTitle>
        <DialogDescription>Escolha a forma com as teclas 1 a 4 e confirme o valor com Enter.</DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-4">
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase">Total</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums">{formatarReais(exibido?.total ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase">Falta pagar</dt>
          <dd
            aria-live="polite"
            className={cn(
              'font-display text-2xl font-semibold tabular-nums',
              (exibido?.faltaPagar ?? 0) > 0 && 'text-warning-soft-foreground',
            )}
          >
            {formatarReais(exibido?.faltaPagar ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground uppercase">Troco</dt>
          <dd aria-live="polite" className="font-display text-2xl font-semibold tabular-nums text-success-soft-foreground">
            {formatarReais(exibido?.troco ?? 0)}
          </dd>
        </div>
      </dl>

      <div
        ref={formasRef}
        role="group"
        aria-label="Formas de pagamento"
        tabIndex={-1}
        onKeyDown={aoTeclarNasFormas}
        className="grid grid-cols-4 gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {FORMAS_DE_PAGAMENTO.map((opcao, indice) => {
          const Icone = ICONE_DA_FORMA[opcao]
          return (
            <Button
              key={opcao}
              type="button"
              variant={forma === opcao ? 'default' : 'outline'}
              aria-pressed={forma === opcao}
              aria-keyshortcuts={String(indice + 1)}
              onClick={() => escolher(opcao)}
              disabled={enviando}
              className="h-14 flex-col gap-0.5"
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs">
                <kbd className="font-sans font-semibold">{indice + 1}</kbd> {ROTULO_DA_FORMA[opcao]}
              </span>
            </Button>
          )
        })}
      </div>

      {forma !== null && (
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
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  setForma(null)
                  formasRef.current?.focus()
                }
              }}
              onFocus={(event) => event.currentTarget.select()}
              disabled={enviando}
              aria-invalid={erroDoValor ? true : undefined}
              aria-describedby={erroDoValor ? 'pdv-pagamento-valor-erro' : undefined}
              className="h-11 text-base"
            />
            <Button type="button" variant="outline" className="h-11" onClick={adicionar} disabled={enviando}>
              Adicionar
            </Button>
          </div>
          <ErroDoCampo id="pdv-pagamento-valor-erro" mensagem={erroDoValor ?? undefined} />
        </div>
      )}

      {pagamentos.length > 0 && (
        <ul aria-label="Formas usadas" className="divide-y rounded-md bg-muted/40 px-3">
          {pagamentos.map((pagamento) => (
            <li key={pagamento.forma} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-medium">{ROTULO_DA_FORMA[pagamento.forma]}</span>
              <span className="ml-auto tabular-nums">{formatarReais(pagamento.valor)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 md:size-9"
                aria-label={`Remover ${ROTULO_DA_FORMA[pagamento.forma]}`}
                onClick={() => remover(pagamento.forma)}
                disabled={enviando}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {errosDoCalculo.map((mensagem) => (
        <p key={mensagem} className="text-sm font-medium text-destructive">
          {mensagem}
        </p>
      ))}
      {calculo.falhaDeRede && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-warning-soft-foreground">{calculo.falhaDeRede}</p>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={calculo.recalcular}>
            Tentar de novo
          </Button>
        </div>
      )}
      {erro && <ErroInline mensagem={erro} />}

      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar} disabled={enviando}>
          Voltar à venda
        </Button>
        <Button
          ref={finalizarRef}
          type="button"
          className="min-h-11"
          disabled={!podeFinalizar}
          onClick={() => exibido && enviar(exibido.total)}
        >
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Finalizar venda
        </Button>
      </DialogFooter>

      <JanelaTotalMudou
        anterior={totalMudou?.anterior ?? null}
        novo={totalMudou?.novo ?? null}
        enviando={enviando}
        aoConfirmar={(novoTotal) => enviar(novoTotal)}
        aoVoltar={() => {
          setTotalMudou(null)
          aoFechar()
        }}
      />
    </DialogContent>
  )
}
