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
import { diferencaEntre, formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { TextoDaDiferenca } from '@/features/cash-register/ResumoDoFechamento'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { cn } from '@/lib/utils'
import { contar, fechar } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { FORMAS_DE_PAGAMENTO, type ContagemRequest, type FormaDePagamento, type SessaoDeCaixa } from '@/types/caixa'

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

/** Os campos com erro: o valor contado de cada forma (`contagens.DEBITO`) e a justificativa. */
type CampoFechamento = `contagens.${FormaDePagamento}` | 'justificativa'
const ID_CONTADO = 'fechar-caixa-contado'
const ID_JUSTIFICATIVA = 'fechar-caixa-justificativa'
const ID_DIFERENCA = 'fechar-caixa-diferenca'
const ID_RESULTADO = 'fechar-caixa-resultado'
const TAMANHO_MAXIMO_DA_JUSTIFICATIVA = 500
const FALHA_CONTAGEM = 'Não foi possível registrar a contagem. Confira a conexão e tente de novo.'
const FALHA_FECHAMENTO = 'Não foi possível fechar o caixa. Confira a conexão e tente de novo.'
const MENSAGEM_SEM_CONTADO = 'Informe o valor contado na gaveta.'
const MENSAGEM_SEM_JUSTIFICATIVA = 'Explique a diferença para fechar o caixa.'

function campoDaForma(forma: FormaDePagamento): CampoFechamento {
  return `contagens.${forma}`
}

/** As formas que a contagem pede, o dinheiro primeiro (sempre presente). */
function formasDaContagem(sessao: SessaoDeCaixa): FormaDePagamento[] {
  const pedidas = new Set<FormaDePagamento>(sessao.formasDaContagem ?? [])
  return FORMAS_DE_PAGAMENTO.filter((forma) => forma === 'DINHEIRO' || pedidas.has(forma))
}

/** Todos os campos conhecidos, na ordem da tela (para o foco no primeiro com erro). */
function camposDaJanela(formas: readonly FormaDePagamento[]): CampoFechamento[] {
  return [...formas.map(campoDaForma), 'justificativa']
}

function idDoContado(forma: FormaDePagamento): string {
  return forma === 'DINHEIRO' ? ID_CONTADO : `${ID_CONTADO}-${forma.toLowerCase()}`
}

function rotuloDoContado(forma: FormaDePagamento): string {
  return forma === 'DINHEIRO' ? 'Dinheiro contado na gaveta' : `${ROTULO_DA_FORMA[forma]} contado`
}

function mensagemSemContado(forma: FormaDePagamento): string {
  return forma === 'DINHEIRO' ? MENSAGEM_SEM_CONTADO : `Informe o valor contado de ${ROTULO_DA_FORMA[forma]}.`
}

/** O esperado de cada forma que quem fecha pode ver (o dinheiro vem de `dinheiroNaGaveta`). */
function esperadoDaForma(sessao: SessaoDeCaixa, forma: FormaDePagamento): number | null {
  if (forma === 'DINHEIRO') {
    return sessao.dinheiroNaGaveta
  }
  return (sessao.porForma ?? []).find((valores) => valores.forma === forma)?.esperado ?? null
}

/** Texto da janela conforme o passo, o modo, as formas e se quem fecha ve o esperado (`dinheiroNaGaveta`). */
function descricaoDaJanela(sessao: SessaoDeCaixa, emConferencia: boolean, variasFormas: boolean): string {
  if (emConferencia) {
    return 'A contagem foi registrada. Explique a diferença para fechar o caixa.'
  }
  const oQueContar = variasFormas ? 'o dinheiro da gaveta e os comprovantes de cada forma' : 'o dinheiro da gaveta'
  if (!sessao.fechamentoCego) {
    return `Conte ${oQueContar} e compare com o esperado. A contagem não pode ser alterada depois.`
  }
  const informe = variasFormas ? 'informe os totais' : 'informe o total'
  return sessao.dinheiroNaGaveta === null
    ? `Conte ${oQueContar} e ${informe}. Se bater, o caixa fecha na hora. Depois de conferir, a contagem não pode ser alterada.`
    : `Conte ${oQueContar} e ${informe}. A diferença aparece depois de conferir. A contagem não pode ser alterada depois.`
}

/** A diferenca que guia o exemplo da justificativa, com a forma em que apareceu. */
interface DiferencaDoExemplo {
  forma: FormaDePagamento
  valor: number
}

/** Exemplo de justificativa: no dinheiro, conforme o sentido da diferenca; fora dele, a forma trocada. */
function exemploDeJustificativa(diferenca: DiferencaDoExemplo | null): string {
  if (diferenca !== null && diferenca.forma !== 'DINHEIRO') {
    return 'Ex.: Venda passada no crédito em vez do débito'
  }
  return diferenca !== null && diferenca.valor > 0 ? 'Ex.: Troco dado a menos' : 'Ex.: Troco dado a mais'
}

/** A primeira diferenca diferente de zero (o exemplo da justificativa segue o sentido e a forma dela). */
function primeiraDiferenca(diferencas: readonly { forma: FormaDePagamento; valor: number | null }[]): DiferencaDoExemplo | null {
  const achada = diferencas.find(({ valor }) => valor !== null && valor !== 0)
  return achada && achada.valor !== null ? { forma: achada.forma, valor: achada.valor } : null
}

/** Erros do servidor: `valorContado` (contrato antigo) vale como o dinheiro. */
function normalizarErroDoServidor(erro: unknown): unknown {
  if (erro instanceof HttpError && erro.campos?.valorContado) {
    const { valorContado, ...demais } = erro.campos
    return new HttpError(erro.status, erro.message, { ...demais, 'contagens.DINHEIRO': valorContado })
  }
  return erro
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
  const formas = formasDaContagem(sessao)
  const campos = camposDaJanela(formas)
  const variasFormas = formas.length > 1
  const [contados, setContados] = useState<Partial<Record<FormaDePagamento, string>>>({})
  const [justificativa, setJustificativa] = useState('')
  const [erros, setErros] = useState<Partial<Record<CampoFechamento, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  /** Resultado da contagem que foi para conferencia (a resposta do servidor). */
  const [resultado, setResultado] = useState<SessaoDeCaixa | null>(null)
  const [focoPendente, setFocoPendente] = useState<CampoFechamento | null>(null)
  const contadosRef = useRef<Partial<Record<FormaDePagamento, HTMLInputElement | null>>>({})
  const justificativaRef = useRef<HTMLTextAreaElement>(null)
  const enviandoRef = useRef(false)

  const cego = sessao.fechamentoCego
  // A conferencia vem da contagem feita aqui ou da sessao recarregada (retomada).
  const conferencia = resultado ?? (sessao.status === 'EM_CONFERENCIA' ? sessao : null)
  const esperadoVisivel = (forma: FormaDePagamento) => (cego ? null : esperadoDaForma(sessao, forma))
  const diferencaAoVivoDa = (forma: FormaDePagamento): number | null => {
    const esperado = esperadoVisivel(forma)
    const contado = contados[forma] ?? ''
    return esperado !== null && contado !== '' ? diferencaEntre(Number(contado), esperado) : null
  }
  const diferencaAoVivo = primeiraDiferenca(formas.map((forma) => ({ forma, valor: diferencaAoVivoDa(forma) })))
  const pedeJustificativaJunto = conferencia === null && diferencaAoVivo !== null
  const mostraJustificativa = conferencia !== null || pedeJustificativaJunto
  const campoVisivel = (campo: CampoFechamento) => (campo === 'justificativa' ? mostraJustificativa : conferencia === null)

  const tratarErro = async (erroOriginal: unknown, falha: string) => {
    const erro = normalizarErroDoServidor(erroOriginal)
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
    const { porCampo, geral } = lerErroDoServidor(erro, campos, falha)
    setErros(porCampo)
    setErroGeral(geral)
    setFocoPendente(campos.find((campo) => porCampo[campo] && campoVisivel(campo)) ?? null)
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
    if (focoPendente === 'justificativa') {
      justificativaRef.current?.focus()
    } else {
      const forma = FORMAS_DE_PAGAMENTO.find((item) => campoDaForma(item) === focoPendente)
      if (forma) {
        contadosRef.current[forma]?.focus()
      }
    }
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
    for (const forma of formas) {
      if ((contados[forma] ?? '') === '') {
        novos[campoDaForma(forma)] = mensagemSemContado(forma)
      }
    }
    if (pedeJustificativaJunto && texto === '') {
      novos.justificativa = MENSAGEM_SEM_JUSTIFICATIVA
    }
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      setFocoPendente(campos.find((campo) => novos[campo]) ?? null)
      return
    }
    enviandoRef.current = true
    setErros({})
    setErroGeral(null)
    const contagens: Partial<Record<FormaDePagamento, number>> = {}
    for (const forma of formas) {
      contagens[forma] = Number(contados[forma])
    }
    // No modo cego a justificativa nunca vai junto (o backend recusa); no nao cego, so com diferenca.
    contagem.mutate({ contagens, justificativa: pedeJustificativaJunto ? texto : null })
  }

  // Erro de um campo que nao esta na tela neste passo (ex.: a justificativa depois que o modo mudou) vai para a mensagem geral.
  const errosOcultos = campos.filter((campo) => !campoVisivel(campo) && erros[campo]).map((campo) => erros[campo])
  const mensagemGeral = [erroGeral, ...errosOcultos].filter(Boolean).join(' ') || null
  const rotuloConfirmar = conferencia || !cego ? 'Fechar caixa' : 'Conferir'
  const descricaoDaJustificativa =
    [conferencia && ID_RESULTADO, erros.justificativa && `${ID_JUSTIFICATIVA}-erro`].filter(Boolean).join(' ') ||
    undefined
  const diferencaDoExemplo = conferencia
    ? primeiraDiferenca([
        { forma: 'DINHEIRO', valor: conferencia.diferenca },
        ...(conferencia.porForma ?? []).map((valores) => ({ forma: valores.forma, valor: valores.diferenca })),
      ])
    : diferencaAoVivo

  return (
    <DialogContent
      showCloseButton={!enviando}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        if (conferencia) {
          justificativaRef.current?.focus()
        } else {
          contadosRef.current.DINHEIRO?.focus()
        }
      }}
      onCloseAutoFocus={manterFocoMovidoPelaTela}
      onEscapeKeyDown={(event) => enviandoRef.current && event.preventDefault()}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{`Fechar o ${sessao.ponto.nome}`}</DialogTitle>
        <DialogDescription>{descricaoDaJanela(sessao, conferencia !== null, variasFormas)}</DialogDescription>
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
          formas.map((forma) => (
            <CampoDaForma
              key={forma}
              forma={forma}
              valor={contados[forma] ?? ''}
              esperado={esperadoVisivel(forma)}
              diferenca={diferencaAoVivoDa(forma)}
              erro={erros[campoDaForma(forma)]}
              desabilitado={enviando}
              registrar={(elemento) => {
                contadosRef.current[forma] = elemento
              }}
              aoMudar={(valor) => {
                setContados((atuais) => ({ ...atuais, [forma]: valor }))
                setErros(({ [campoDaForma(forma)]: _removido, ...demais }) => demais)
              }}
            />
          ))
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
              placeholder={exemploDeJustificativa(diferencaDoExemplo)}
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

/** O valor contado de uma forma; no modo nao cego, o esperado e a diferenca ao lado. */
function CampoDaForma({
  forma,
  valor,
  esperado,
  diferenca,
  erro,
  desabilitado,
  registrar,
  aoMudar,
}: {
  forma: FormaDePagamento
  valor: string
  esperado: number | null
  diferenca: number | null
  erro: string | undefined
  desabilitado: boolean
  registrar: (elemento: HTMLInputElement | null) => void
  aoMudar: (valor: string) => void
}) {
  const id = idDoContado(forma)
  const idDiferenca = forma === 'DINHEIRO' ? ID_DIFERENCA : `${ID_DIFERENCA}-${forma.toLowerCase()}`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotuloDoContado(forma)}
      </label>
      <div className={cn('gap-4', esperado !== null && 'grid grid-cols-[minmax(0,1fr)_auto] items-center')}>
        <CampoMoeda
          ref={registrar}
          id={id}
          value={valor}
          onChange={aoMudar}
          disabled={desabilitado}
          aria-invalid={erro ? true : undefined}
          aria-describedby={[esperado !== null && idDiferenca, erro && `${id}-erro`].filter(Boolean).join(' ') || undefined}
          className="h-11 text-base"
        />
        {esperado !== null && (
          <div id={idDiferenca} className="space-y-0.5 text-right text-sm">
            <p className="text-muted-foreground tabular-nums">{`Esperado ${formatarReais(esperado)}`}</p>
            {/* So a diferenca e anunciada enquanto se digita. */}
            <p aria-live="polite" className="min-h-5">
              {diferenca !== null && <TextoDaDiferenca valor={diferenca} />}
            </p>
          </div>
        )}
      </div>
      <ErroDoCampo id={`${id}-erro`} mensagem={erro} />
    </div>
  )
}

/** Esperado, contado e diferenca de uma contagem ja registrada (por forma quando ha mais de uma). */
function ResultadoDaContagem({ sessao }: { sessao: SessaoDeCaixa }) {
  // O titulo nomeia a regiao; a lista (sem nome proprio) descreve a justificativa pelo conteudo.
  return (
    <section aria-labelledby={`${ID_RESULTADO}-titulo`}>
      <h3 id={`${ID_RESULTADO}-titulo`} className="sr-only">
        Resultado da contagem
      </h3>
      {(sessao.porForma ?? []).length > 1 ? (
        <div id={ID_RESULTADO} className="space-y-2">
          {(sessao.porForma ?? []).map((valores) => (
            <div key={valores.forma} role="group" aria-label={ROTULO_DA_FORMA[valores.forma]}>
              <ValoresDaForma
                titulo={ROTULO_DA_FORMA[valores.forma]}
                esperado={valores.esperado}
                contado={valores.contado}
                diferenca={valores.diferenca}
              />
            </div>
          ))}
        </div>
      ) : (
        <ValoresDaForma
          id={ID_RESULTADO}
          esperado={sessao.valorEsperado}
          contado={sessao.valorContado}
          diferenca={sessao.diferenca}
        />
      )}
    </section>
  )
}

function ValoresDaForma({
  id,
  titulo,
  esperado,
  contado,
  diferenca,
}: {
  id?: string
  titulo?: string
  esperado: number | null
  contado: number | null
  diferenca: number | null
}) {
  return (
    <dl id={id} className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
      {titulo && (
        <p aria-hidden="true" className="font-medium">
          {titulo}
        </p>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Esperado</dt>
        <dd className="tabular-nums">{esperado === null ? '—' : formatarReais(esperado)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Contado</dt>
        <dd className="tabular-nums">{contado === null ? '—' : formatarReais(contado)}</dd>
      </div>
      {diferenca !== null && (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Diferença</dt>
          <dd>
            <TextoDaDiferenca valor={diferenca} />
          </dd>
        </div>
      )}
    </dl>
  )
}
