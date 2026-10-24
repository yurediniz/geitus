import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CAIXA_QUERY_KEY } from '@/features/cash-register/caixaQuery'
import {
  ehFalhaSemResposta,
  lerErroDoServidor,
  verificarMudancaDeEstado,
  type MudancaDeEstado,
} from '@/features/cash-register/errosDoCaixa'
import { manterFocoMovidoPelaTela } from '@/features/cash-register/focoDoCaixa'
import { diferencaEntre, formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { TextoDaDiferenca } from '@/features/cash-register/ResumoDoFechamento'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { cn } from '@/lib/utils'
import { contar, fechar } from '@/services/caixaService'
import type { ContagemRequest, SessaoDeCaixa } from '@/types/caixa'

export interface JanelaFecharCaixaProps {
  aberto: boolean
  /** A sessao como esta na tela (recarregada quando o cache do caixa e invalidado). */
  sessao: SessaoDeCaixa
  /** ADMIN fechando o caixa aberto por outra pessoa: aviso no topo (spec §6.4). */
  deOutraPessoa: boolean
  aoFechar: () => void
  /** Sessao FECHADA (direto pela contagem ou depois da justificativa). */
  aoConcluir: (sessao: SessaoDeCaixa) => void
  /** A sessao mudou em outro lugar (fechada, contada, fora da vista): quem abriu fecha a janela e avisa. */
  aoMudarDeEstado: (mudanca: MudancaDeEstado) => void
}

type CampoFechamento = 'valorContado' | 'justificativa'
const CAMPOS: readonly CampoFechamento[] = ['valorContado', 'justificativa']
const ID_CONTADO = 'fechar-caixa-contado'
const ID_JUSTIFICATIVA = 'fechar-caixa-justificativa'
const ID_DIFERENCA = 'fechar-caixa-diferenca'
const ID_RESULTADO = 'fechar-caixa-resultado'
const TAMANHO_MAXIMO_DA_JUSTIFICATIVA = 500
const FALHA_CONTAGEM = 'Não foi possível registrar a contagem. Confira a conexão e tente de novo.'
const FALHA_FECHAMENTO = 'Não foi possível fechar o caixa. Confira a conexão e tente de novo.'
const MENSAGEM_SEM_CONTADO = 'Informe o valor contado na gaveta.'
const MENSAGEM_SEM_JUSTIFICATIVA = 'Explique a diferença para fechar o caixa.'

/** Texto da janela conforme o passo, o modo e se quem fecha ve o esperado (`dinheiroNaGaveta`). */
function descricaoDaJanela(sessao: SessaoDeCaixa, emConferencia: boolean): string {
  if (emConferencia) {
    return 'A contagem foi registrada. Explique a diferença para fechar o caixa.'
  }
  if (!sessao.fechamentoCego) {
    return 'Conte o dinheiro da gaveta e compare com o esperado. A contagem não pode ser alterada depois.'
  }
  return sessao.dinheiroNaGaveta === null
    ? 'Conte o dinheiro da gaveta e informe o total. Se bater, o caixa fecha na hora. Depois de conferir, a contagem não pode ser alterada.'
    : 'Conte o dinheiro da gaveta e informe o total. A diferença aparece depois de conferir. A contagem não pode ser alterada depois.'
}

/** Exemplo de justificativa conforme o sentido da diferenca. */
function exemploDeJustificativa(diferenca: number | null): string {
  return diferenca !== null && diferenca > 0 ? 'Ex.: Troco dado a menos' : 'Ex.: Troco dado a mais'
}

/**
 * Janela "Fechar caixa" (spec §6.4). O modo vem de `sessao.fechamentoCego`:
 * - nao cego: o contado com o esperado e a diferenca ao vivo; com diferenca, a
 *   justificativa obrigatoria vai junto com a contagem;
 * - cego: so o contado e "Conferir"; depois, o resultado e, com diferenca, a
 *   justificativa e "Fechar caixa".
 * Com a sessao em conferencia (retomada, ou a contagem repetida depois de uma
 * falha de rede), a janela ja abre no passo da justificativa. Numa falha sem
 * resposta (rede), a janela e o que foi digitado ficam: a nova tentativa
 * recebe o resultado gravado (idempotente pelo estado no backend).
 */
export function JanelaFecharCaixa({ aberto, aoFechar, ...props }: JanelaFecharCaixaProps) {
  return (
    <Dialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (!abrir) {
          aoFechar()
        }
      }}
    >
      {aberto && <ConteudoFecharCaixa aoFechar={aoFechar} {...props} />}
    </Dialog>
  )
}

function ConteudoFecharCaixa({
  sessao,
  deOutraPessoa,
  aoFechar,
  aoConcluir,
  aoMudarDeEstado,
}: Omit<JanelaFecharCaixaProps, 'aberto'>) {
  const queryClient = useQueryClient()
  const [contado, setContado] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [erros, setErros] = useState<Partial<Record<CampoFechamento, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  /** Resultado da contagem que foi para conferencia (a resposta do servidor). */
  const [resultado, setResultado] = useState<SessaoDeCaixa | null>(null)
  const [focoPendente, setFocoPendente] = useState<CampoFechamento | null>(null)
  const contadoRef = useRef<HTMLInputElement>(null)
  const justificativaRef = useRef<HTMLTextAreaElement>(null)
  const enviandoRef = useRef(false)

  const cego = sessao.fechamentoCego
  // A conferencia vem da contagem feita aqui ou da sessao recarregada (retomada).
  const conferencia = resultado ?? (sessao.status === 'EM_CONFERENCIA' ? sessao : null)
  const esperado = cego ? null : sessao.dinheiroNaGaveta
  const diferencaAoVivo = esperado !== null && contado !== '' ? diferencaEntre(Number(contado), esperado) : null
  const pedeJustificativaJunto = conferencia === null && diferencaAoVivo !== null && diferencaAoVivo !== 0
  const mostraJustificativa = conferencia !== null || pedeJustificativaJunto
  const campoVisivel: Readonly<Record<CampoFechamento, boolean>> = {
    valorContado: conferencia === null,
    justificativa: mostraJustificativa,
  }

  const tratarErro = async (erro: unknown, falha: string) => {
    if (ehFalhaSemResposta(erro)) {
      // O envio pode ter chegado ao servidor: a janela e os valores ficam para a nova tentativa,
      // sem recarregar a sessao (a tela continua como esta).
      setErroGeral(lerErroDoServidor(erro, [], falha).geral)
      return
    }
    const mudanca = await verificarMudancaDeEstado(erro, sessao.id)
    if (mudanca && !(mudanca.situacao === 'EM_CONFERENCIA' && conferencia)) {
      // Quem abriu a janela avisa e recarrega a sessao.
      aoMudarDeEstado(mudanca)
      return
    }
    // A sessao continua neste passo (ex.: modo trocado antes da contagem): recarrega e mostra o erro.
    void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
    const { porCampo, geral } = lerErroDoServidor(erro, CAMPOS, falha)
    setErros(porCampo)
    setErroGeral(geral)
    setFocoPendente(CAMPOS.find((campo) => porCampo[campo] && campoVisivel[campo]) ?? null)
  }

  const contagem = useMutation<SessaoDeCaixa, unknown, ContagemRequest>({
    mutationFn: (dados) => contar(sessao.id, dados),
    onSuccess: (resposta) => {
      void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
      if (resposta.status === 'FECHADA') {
        aoConcluir(resposta)
        return
      }
      // Em conferencia: o resultado aparece e falta a justificativa.
      setResultado(resposta)
      setErroGeral(null)
      setFocoPendente('justificativa')
    },
    onError: (erro) => tratarErro(erro, FALHA_CONTAGEM),
    onSettled: () => {
      enviandoRef.current = false
    },
  })

  const fechamento = useMutation<SessaoDeCaixa, unknown, string>({
    mutationFn: (texto) => fechar(sessao.id, { justificativa: texto }),
    onSuccess: (resposta) => aoConcluir(resposta),
    onError: (erro) => tratarErro(erro, FALHA_FECHAMENTO),
    onSettled: () => {
      enviandoRef.current = false
    },
  })
  const enviando = contagem.isPending || fechamento.isPending

  useEffect(() => {
    if (focoPendente === null || enviando) {
      return
    }
    const alvo = focoPendente === 'valorContado' ? contadoRef : justificativaRef
    alvo.current?.focus()
    setFocoPendente(null)
  }, [focoPendente, enviando])

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (enviandoRef.current || enviando) {
      return
    }
    const texto = justificativa.trim()
    if (conferencia) {
      if (texto === '') {
        setErros({ justificativa: MENSAGEM_SEM_JUSTIFICATIVA })
        setFocoPendente('justificativa')
        return
      }
      enviandoRef.current = true
      setErros({})
      setErroGeral(null)
      fechamento.mutate(texto)
      return
    }
    const novos: Partial<Record<CampoFechamento, string>> = {}
    if (contado === '') {
      novos.valorContado = MENSAGEM_SEM_CONTADO
    }
    if (pedeJustificativaJunto && texto === '') {
      novos.justificativa = MENSAGEM_SEM_JUSTIFICATIVA
    }
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      setFocoPendente(CAMPOS.find((campo) => novos[campo]) ?? null)
      return
    }
    enviandoRef.current = true
    setErros({})
    setErroGeral(null)
    // No modo cego a justificativa nunca vai junto (o backend recusa); no nao cego, so com diferenca.
    contagem.mutate({ valorContado: Number(contado), justificativa: pedeJustificativaJunto ? texto : null })
  }

  // Erro de um campo que nao esta na tela neste passo (ex.: a justificativa depois que o modo mudou) vai para a mensagem geral.
  const errosOcultos = CAMPOS.filter((campo) => !campoVisivel[campo] && erros[campo]).map((campo) => erros[campo])
  const mensagemGeral = [erroGeral, ...errosOcultos].filter(Boolean).join(' ') || null
  const rotuloConfirmar = conferencia || !cego ? 'Fechar caixa' : 'Conferir'
  const descricaoDaJustificativa =
    [conferencia && ID_RESULTADO, erros.justificativa && `${ID_JUSTIFICATIVA}-erro`].filter(Boolean).join(' ') ||
    undefined

  return (
    <DialogContent
      showCloseButton={!enviando}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        const alvo = conferencia ? justificativaRef : contadoRef
        alvo.current?.focus()
      }}
      onCloseAutoFocus={manterFocoMovidoPelaTela}
      onEscapeKeyDown={(event) => enviandoRef.current && event.preventDefault()}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{`Fechar o ${sessao.ponto.nome}`}</DialogTitle>
        <DialogDescription>{descricaoDaJanela(sessao, conferencia !== null)}</DialogDescription>
      </DialogHeader>

      {deOutraPessoa && (
        <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {`Você está fechando o caixa aberto por ${sessao.abertaPorNome}.`}
        </p>
      )}

      <form onSubmit={confirmar} noValidate className="space-y-4">
        {mensagemGeral && <ErroInline mensagem={mensagemGeral} />}

        {conferencia ? (
          <ResultadoDaContagem sessao={conferencia} />
        ) : (
          <div className="space-y-1.5">
            <label htmlFor={ID_CONTADO} className="text-sm font-medium">
              Dinheiro contado na gaveta
            </label>
            <div className={cn('gap-4', esperado !== null && 'grid grid-cols-[minmax(0,1fr)_auto] items-center')}>
              <CampoMoeda
                ref={contadoRef}
                id={ID_CONTADO}
                value={contado}
                onChange={(valor) => {
                  setContado(valor)
                  setErros(({ valorContado: _valorContado, ...demais }) => demais)
                }}
                disabled={enviando}
                aria-invalid={erros.valorContado ? true : undefined}
                aria-describedby={
                  [esperado !== null && ID_DIFERENCA, erros.valorContado && `${ID_CONTADO}-erro`]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                className="h-11 text-base"
              />
              {esperado !== null && (
                <div id={ID_DIFERENCA} className="space-y-0.5 text-right text-sm">
                  <p className="text-muted-foreground tabular-nums">{`Esperado ${formatarReais(esperado)}`}</p>
                  {/* So a diferenca e anunciada enquanto se digita. */}
                  <p aria-live="polite" className="min-h-5">
                    {diferencaAoVivo !== null && <TextoDaDiferenca valor={diferencaAoVivo} />}
                  </p>
                </div>
              )}
            </div>
            <ErroDoCampo id={`${ID_CONTADO}-erro`} mensagem={erros.valorContado} />
          </div>
        )}

        {mostraJustificativa && (
          <div className="space-y-1.5">
            <label htmlFor={ID_JUSTIFICATIVA} className="text-sm font-medium">
              Justificativa
              <MarcaObrigatorio />
            </label>
            <textarea
              ref={justificativaRef}
              id={ID_JUSTIFICATIVA}
              value={justificativa}
              onChange={(event) => {
                setJustificativa(event.target.value)
                setErros(({ justificativa: _justificativa, ...demais }) => demais)
              }}
              // Enter confirma (como nas demais janelas); Shift+Enter quebra a linha.
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              rows={3}
              maxLength={TAMANHO_MAXIMO_DA_JUSTIFICATIVA}
              placeholder={exemploDeJustificativa(conferencia ? conferencia.diferenca : diferencaAoVivo)}
              disabled={enviando}
              aria-invalid={erros.justificativa ? true : undefined}
              aria-describedby={descricaoDaJustificativa}
              className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm"
            />
            <ErroDoCampo id={`${ID_JUSTIFICATIVA}-erro`} mensagem={erros.justificativa} />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar} disabled={enviando}>
            {conferencia ? 'Justificar depois' : 'Cancelar'}
          </Button>
          <Button type="submit" className="min-h-11" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

/** Esperado, contado e diferenca de uma contagem ja registrada. */
function ResultadoDaContagem({ sessao }: { sessao: SessaoDeCaixa }) {
  // O titulo nomeia a regiao; a lista (sem nome proprio) descreve a justificativa pelo conteudo.
  return (
    <section aria-labelledby={`${ID_RESULTADO}-titulo`}>
      <h3 id={`${ID_RESULTADO}-titulo`} className="sr-only">
        Resultado da contagem
      </h3>
      <ResultadoEmLista sessao={sessao} />
    </section>
  )
}

function ResultadoEmLista({ sessao }: { sessao: SessaoDeCaixa }) {
  return (
    <dl id={ID_RESULTADO} className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Esperado</dt>
        <dd className="tabular-nums">{sessao.valorEsperado === null ? '—' : formatarReais(sessao.valorEsperado)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Contado</dt>
        <dd className="tabular-nums">{sessao.valorContado === null ? '—' : formatarReais(sessao.valorContado)}</dd>
      </div>
      {sessao.diferenca !== null && (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Diferença</dt>
          <dd>
            <TextoDaDiferenca valor={sessao.diferenca} />
          </dd>
        </div>
      )}
    </dl>
  )
}
