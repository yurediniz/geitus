import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Loader2, ScanBarcode, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { acaoDoAtalho, ehCodigo, semDigitos } from '@/features/pdv/atalhosDoPdv'
import type { ItemParaLancar } from '@/features/pdv/carrinho'
import { FilaDeLeituras, LIMITES_DA_LEITURA } from '@/features/pdv/filaDeLeituras'
import { ID_CAMPO_DE_LEITURA } from '@/features/pdv/focoDoPdv'
import { chaveDaBuscaDeProdutos } from '@/features/pdv/pdvQuery'
import { ResultadosDaBusca } from '@/features/pdv/ResultadosDaBusca'
import { CatalogoInicial } from '@/features/pdv/CatalogoInicial'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { HttpError } from '@/services/httpClient'
import { buscarProdutos, resolverCodigo } from '@/services/pdvService'
import type { ProdutoEncontrado } from '@/types/pdv'

const ID_ERRO = `${ID_CAMPO_DE_LEITURA}-erro`
const ID_AVISO = `${ID_CAMPO_DE_LEITURA}-aviso`
const MENSAGEM_SEM_RESPOSTA = 'Sem resposta do servidor. Leia o código de novo.'

/** A busca por nome comeca com 3 caracteres digitados. */
export const MINIMO_DA_BUSCA = 3
/** Espera depois da ultima tecla: o scanner digita e tecla Enter antes disso (nenhuma busca por bipe). */
const ATRASO_DA_BUSCA_MS = 250

/** O codigo do texto lido, sem a quantidade ("542*3" -> "542"). */
function codigoDoTexto(lido: string): string {
  return lido.split('*')[0] || lido
}

/** A mensagem da leitura recusada (spec do PDV §3.1), com o codigo lido e sem detalhe tecnico. */
function mensagemDaLeitura(erro: unknown, lido: string): string {
  if (erro instanceof HttpError) {
    if (erro.status === 0) {
      return 'Sem conexão com o servidor. Leia o código de novo.'
    }
    if (erro.status === 400 || erro.status === 404 || erro.status === 409) {
      const doCampo = Object.values(erro.campos ?? {})
      if (doCampo.length > 0) {
        return doCampo.join(' ')
      }
      if (erro.status === 404 && (ehMensagemGenerica(erro.message) || erro.message === 'Código não encontrado.')) {
        // Com o codigo, o operador ve qual bipe falhou mesmo depois de outras leituras.
        return `Código ${codigoDoTexto(lido)} não encontrado.`
      }
      return ehMensagemGenerica(erro.message) ? 'Não foi possível ler o código.' : erro.message
    }
  }
  return 'Não foi possível ler o código. Tente de novo.'
}

/** Alvo onde a tecla e do proprio elemento (nao vai para o campo de leitura). */
function ehEditavel(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof HTMLElement &&
    (alvo.isContentEditable || alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')
  )
}

/** O produto escolhido na busca entra como 1 unidade de venda, sem codigo lido. */
function itemDoProduto(produto: ProdutoEncontrado): ItemParaLancar {
  return { tipo: 'UNIDADE', quantidade: 1, produto, embalagemId: null, codigoLido: null }
}

export interface CampoDeLeituraProps {
  /** O item lido ou escolhido na busca, na ordem das leituras. */
  aoResolver: (item: ItemParaLancar) => void
  /** A leitura foi recusada: a mensagem fica no campo. */
  aoRecusar: (mensagem: string) => void
  /** Quantas leituras ainda esperam o servidor (a venda nao pode ser paga enquanto houver). */
  aoMudarPendentes: (pendentes: number) => void
  erro: string | null
  /** Aviso discreto sob o campo (ex.: "Aguarde a leitura…"). */
  aviso: string | null
  aoDigitar: () => void
  /** Esc no campo tira o erro da leitura. */
  aoLimparErro: () => void
  /** Sem janela aberta: uma tecla digitada fora do campo vem para ele (o foco e permanente). */
  capturarTeclas: boolean
}

/**
 * O campo "Código ou nome" no topo da venda (spec do PDV §3.1 e §6.2), com o
 * foco permanente, e a busca ao vivo logo abaixo. Enter com um codigo limpa o
 * campo na hora e o texto vai para a fila: a resolucao e pedida em seguida
 * (sem esperar as anteriores), com tempo maximo, e o resultado entra no
 * carrinho na ordem das leituras. Com 3 caracteres ou mais, os produtos
 * aparecem enquanto se digita; setas escolhem e Enter lanca o produto. O
 * campo nunca e bloqueado (Review Focus 1). Ao sair da tela, as leituras
 * pendentes sao abortadas.
 */
export function CampoDeLeitura({
  aoResolver,
  aoRecusar,
  aoMudarPendentes,
  erro,
  aviso,
  aoDigitar,
  aoLimparErro,
  capturarTeclas,
}: CampoDeLeituraProps) {
  const [texto, setTexto] = useState('')
  const [pendentes, setPendentes] = useState(0)
  const [ativo, setAtivo] = useState(0)
  /** O operador escolheu um card com as setas: o Enter lanca o card, mesmo com um texto que pareca codigo. */
  const [navegou, setNavegou] = useState(false)
  /** A categoria do catalogo (null = todas), guardada enquanto a busca ocupa a tela. */
  const [categoria, setCategoria] = useState<string | null>(null)
  /** O termo de um Enter dado antes de os cards chegarem. */
  const [enterPendente, setEnterPendente] = useState<string | null>(null)
  const campoRef = useRef<HTMLInputElement>(null)
  const filaRef = useRef<FilaDeLeituras | null>(null)
  const controles = useRef(new Set<AbortController>())
  const montado = useRef(true)
  const retornos = useRef({ aoResolver, aoRecusar, aoMudarPendentes, aoDigitar })
  const idLista = useId()

  const termo = texto.trim()
  // "542*3" e codigo com quantidade, nunca busca.
  const buscavel = termo.length >= MINIMO_DA_BUSCA && !termo.includes('*')
  const atrasado = useBuscaComAtraso(buscavel ? termo : '', ATRASO_DA_BUSCA_MS)
  const consulta = useQuery({
    queryKey: chaveDaBuscaDeProdutos(atrasado),
    queryFn: ({ signal }) => buscarProdutos(atrasado, signal),
    enabled: atrasado !== '',
    placeholderData: keepPreviousData,
  })
  // So depois da espera a area troca para a busca: um bipe rapido nao pisca a tela.
  const mostrandoBusca = buscavel && atrasado !== ''
  const produtos = useMemo(() => (mostrandoBusca ? (consulta.data ?? []) : []), [mostrandoBusca, consulta.data])
  // Enter so escolhe um resultado do termo digitado (e nao o da busca anterior).
  const resultadosDoTermo = atrasado === termo && consulta.isSuccess && !consulta.isFetching && !consulta.isPlaceholderData
  const indiceAtivo = Math.min(ativo, Math.max(0, produtos.length - 1))
  const listaVisivel = mostrandoBusca && produtos.length > 0
  const idDaOpcao = (indice: number) => `${idLista}-${indice}`

  useEffect(() => {
    retornos.current = { aoResolver, aoRecusar, aoMudarPendentes, aoDigitar }
  }, [aoResolver, aoRecusar, aoMudarPendentes, aoDigitar])

  useEffect(() => {
    montado.current = true
    const emAndamento = controles.current
    return () => {
      montado.current = false
      for (const controle of emAndamento) {
        controle.abort()
      }
      emAndamento.clear()
    }
  }, [])

  const mudarTexto = (novo: string) => {
    setTexto(novo)
    setAtivo(0)
    setNavegou(false)
    setEnterPendente(null)
    retornos.current.aoDigitar()
  }

  // Foco permanente: uma tecla digitavel fora de um campo editavel (sem janela aberta) vai para o campo.
  useEffect(() => {
    if (!capturarTeclas) {
      return
    }
    const aoTeclar = (event: KeyboardEvent) => {
      const campo = campoRef.current
      if (
        !campo ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        event.key === ' ' ||
        ehEditavel(event.target) ||
        // + e − com o campo vazio sao atalhos da linha.
        acaoDoAtalho(event, campo.value === '') !== null
      ) {
        return
      }
      event.preventDefault()
      campo.focus()
      setTexto((atual) => atual + event.key)
      setAtivo(0)
      setNavegou(false)
      setEnterPendente(null)
      retornos.current.aoDigitar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [capturarTeclas])

  const fila = () => {
    filaRef.current ??= new FilaDeLeituras((quantas) => {
      if (montado.current) {
        setPendentes(quantas)
        retornos.current.aoMudarPendentes(quantas)
      }
    })
    return filaRef.current
  }

  const resolverComTempoMaximo = (lido: string) => {
    const controle = new AbortController()
    const estado = { estourou: false }
    const temporizador = setTimeout(() => {
      estado.estourou = true
      controle.abort()
    }, LIMITES_DA_LEITURA.tempoMaximoMs)
    controles.current.add(controle)
    const pedido = resolverCodigo(lido, controle.signal).finally(() => {
      clearTimeout(temporizador)
      controles.current.delete(controle)
    })
    return { pedido, estado }
  }

  /** O produto escolhido entra pela fila: fica depois de um bipe que ainda espera o servidor. */
  const escolher = (produto: ProdutoEncontrado) => {
    setTexto('')
    setAtivo(0)
    setNavegou(false)
    campoRef.current?.focus()
    fila().enfileirar(
      Promise.resolve(itemDoProduto(produto)),
      (item) => montado.current && retornos.current.aoResolver(item),
      () => undefined,
    )
  }

  /**
   * Uma palavra sem digito que nao e codigo volta ao campo: os cards mostram o
   * que o operador quis buscar. So com o campo vazio: o 404 pode chegar quando
   * o operador ja esta em outro termo, e a escolha dele nao muda.
   */
  const voltarParaABusca = (lido: string) => {
    if (campoRef.current?.value !== '') {
      return
    }
    setTexto(lido)
    setAtivo(0)
    setNavegou(false)
  }

  const ler = (lido: string) => {
    setTexto('')
    setAtivo(0)
    setNavegou(false)
    const { pedido, estado } = resolverComTempoMaximo(lido)
    fila().enfileirar(
      pedido,
      (item) => montado.current && retornos.current.aoResolver(item),
      (falha) => {
        if (!montado.current) {
          return
        }
        if (!estado.estourou && semDigitos(lido) && falha instanceof HttpError && falha.status === 404) {
          voltarParaABusca(lido)
          return
        }
        retornos.current.aoRecusar(estado.estourou ? MENSAGEM_SEM_RESPOSTA : mensagemDaLeitura(falha, lido))
      },
    )
  }

  /**
   * Enter: o card escolhido com as setas; um nome (com espaco ou sem digito)
   * com os cards ja na tela lanca o card ativo; o resto e codigo (bipe,
   * "542*3", etiqueta). Um nome ainda sem resultado espera os cards.
   */
  const aoEnter = () => {
    const produtoAtivo = resultadosDoTermo ? produtos[indiceAtivo] : undefined
    if (produtoAtivo && (navegou || /\s/.test(termo) || semDigitos(termo))) {
      escolher(produtoAtivo)
      return
    }
    if (termo === '') {
      setTexto('')
      return
    }
    if (ehCodigo(termo)) {
      ler(termo)
    } else if (buscavel && !resultadosDoTermo) {
      // Um nome com espaco antes dos cards: o Enter vale quando os cards deste termo chegarem.
      setEnterPendente(termo)
    }
  }

  const escolherRef = useRef(escolher)
  useEffect(() => {
    escolherRef.current = escolher
  })

  // O Enter pendente lanca o card ativo assim que os cards do mesmo termo chegam (e some se o texto mudar).
  useEffect(() => {
    if (enterPendente === null || enterPendente !== termo || !resultadosDoTermo) {
      return
    }
    setEnterPendente(null)
    const produto = produtos[indiceAtivo]
    if (produto) {
      escolherRef.current(produto)
    }
  }, [enterPendente, termo, resultadosDoTermo, produtos, indiceAtivo])

  const mover = (passo: 1 | -1) => {
    setNavegou(true)
    setAtivo(Math.max(0, Math.min(indiceAtivo + passo, produtos.length - 1)))
  }

  const descricao = [erro && ID_ERRO, aviso && ID_AVISO].filter(Boolean).join(' ') || undefined
  // A busca tem o proprio "Buscando…" e os cards esmaecidos: o indicador do campo e so da leitura.
  const ocupado = pendentes > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-1.5">
        <label htmlFor={ID_CAMPO_DE_LEITURA} className="sr-only">
          Código ou nome
        </label>
        <div className="relative">
          <ScanBarcode
            className="pointer-events-none absolute top-1/2 left-4 h-6 w-6 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={campoRef}
            id={ID_CAMPO_DE_LEITURA}
            value={texto}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Bipe o código ou digite o nome"
            role="combobox"
            aria-expanded={listaVisivel}
            aria-controls={listaVisivel ? idLista : undefined}
            aria-autocomplete="list"
            aria-activedescendant={listaVisivel ? idDaOpcao(indiceAtivo) : undefined}
            onChange={(event) => mudarTexto(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                aoEnter()
              } else if (event.key === 'Escape') {
                // Esc limpa a busca e o erro da leitura.
                if (texto !== '') {
                  mudarTexto('')
                }
                aoLimparErro()
              } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && listaVisivel) {
                // Com os cards na tela, as setas sao da busca (e nao da linha do carrinho).
                event.preventDefault()
                mover(event.key === 'ArrowDown' ? 1 : -1)
              }
            }}
            aria-invalid={erro ? true : undefined}
            aria-describedby={descricao}
            className="h-16 rounded-xl border-2 bg-background pr-24 pl-14 text-xl shadow-none focus-visible:border-primary md:text-xl"
          />
          <span className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center gap-2">
            {ocupado && (
              <span role="status" aria-label="Lendo o código" className="text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </span>
            )}
            <kbd aria-hidden="true" className="rounded-md bg-muted px-2 py-1 font-sans text-xs font-semibold text-muted-foreground">
              F2
            </kbd>
          </span>
        </div>
        {erro && (
          <p id={ID_ERRO} role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        )}
        {aviso && (
          <p id={ID_AVISO} className="text-sm text-muted-foreground">
            {aviso}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {mostrandoBusca ? (
          <AreaDaBusca
            termo={atrasado}
            erro={consulta.isError && !consulta.isFetching}
            carregando={consulta.isPending}
            aoTentarDeNovo={() => void consulta.refetch()}
          >
            {produtos.length > 0 && (
              <ResultadosDaBusca
                idLista={idLista}
                produtos={produtos}
                indiceAtivo={indiceAtivo}
                idDaOpcao={idDaOpcao}
                // Os cards do termo anterior ficam esmaecidos e sem clique ate os do termo atual chegarem.
                desatualizados={!resultadosDoTermo}
                aoEscolher={escolher}
                aoApontar={setAtivo}
              />
            )}
          </AreaDaBusca>
        ) : (
          <CatalogoInicial
            dica={dicaDoCatalogo(buscavel, termo.length > 0 && !termo.includes('*') ? MINIMO_DA_BUSCA - termo.length : 0)}
            categoria={categoria}
            aoMudarCategoria={setCategoria}
            aoEscolher={escolher}
          />
        )}
      </div>
    </div>
  )
}

function AreaDaBusca({
  termo,
  erro,
  carregando,
  aoTentarDeNovo,
  children,
}: {
  termo: string
  erro: boolean
  carregando: boolean
  aoTentarDeNovo: () => void
  children: ReactNode
}) {
  if (carregando) {
    return (
      <p role="status" className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Buscando…
      </p>
    )
  }
  if (erro) {
    return (
      <div className="space-y-2 p-2">
        <ErroInline mensagem="Não foi possível buscar os produtos." />
        <Button type="button" variant="outline" className="h-11" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (!children) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <Search className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-muted-foreground">{`Nenhum produto ativo encontrado para "${termo}".`}</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Produtos</span> · ↑ ↓ escolhe · Enter lança · Esc limpa
      </p>
      {children}
    </div>
  )
}

/** A dica do catalogo: quanto falta para buscar, ou como lancar pelo codigo. */
function dicaDoCatalogo(buscando: boolean, faltam: number): string {
  if (buscando) {
    return 'Buscando…'
  }
  if (faltam > 0) {
    return `Digite mais ${faltam} ${faltam === 1 ? 'letra' : 'letras'} para buscar.`
  }
  return `digite ${MINIMO_DA_BUSCA} letras para buscar · 542*3 lança 3 do código 542`
}
