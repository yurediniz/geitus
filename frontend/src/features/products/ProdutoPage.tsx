import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PRODUTOS_QUERY_KEY,
  TODAS_CATEGORIAS_QUERY_KEY,
  TODAS_UNIDADES_QUERY_KEY,
  ehMensagemGenerica,
} from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { AvisoSomenteLeitura, ErroInline, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { AbaCodigos } from '@/features/products/abas/AbaCodigos'
import { AbaEstoque } from '@/features/products/abas/AbaEstoque'
import { AbaGeral } from '@/features/products/abas/AbaGeral'
import { AbaHistorico } from '@/features/products/abas/AbaHistorico'
import { AbaPrecos } from '@/features/products/abas/AbaPrecos'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { destinoDaLista, type EstadoParaLista } from '@/features/products/navegacaoProdutos'
import {
  ABAS_PRODUTO,
  CAMPOS_POR_ABA,
  ROTULO_ABA,
  avaliarNovoCodigo,
  campoDaChaveDoServidor,
  erroFracaoAtacado,
  erroFracaoEstoqueInicial,
  formatosDoProduto,
  idDoCampo,
  interruptorDoCampo,
  idUnidadePadrao,
  montarRequest,
  primeiroCampoComErro,
  produtoSchema,
  valoresDoProduto,
  valoresIniciais,
  valoresParaCadastrarOutro,
  type AbaProduto,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { SeloStatus } from '@/features/products/SeloStatus'
import { useAvisoAlteracoesNaoSalvas } from '@/features/products/useAvisoAlteracoesNaoSalvas'
import { useAuth } from '@/hooks/useAuth'
import { listarCategorias } from '@/services/categoriaService'
import { HttpError } from '@/services/httpClient'
import {
  atualizarProduto,
  buscarProduto,
  cadastrarProduto,
  excluirProduto,
  inativarProduto,
  reativarProduto,
} from '@/services/produtoService'
import { listarUnidades } from '@/services/unidadeService'
import type { Categoria, UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

/** Chave do produto aberto; sob o prefixo de produtos (invalidado junto com as listas). */
function chaveDoProduto(id: string) {
  return [...PRODUTOS_QUERY_KEY, 'detalhe', id] as const
}

/** O que fazer depois de salvar com sucesso. */
type AcaoAposSalvar = 'voltar' | 'cadastrarOutro'

/** Mensagem amigavel (pt-BR) para falhas ao salvar, sem vazar detalhe interno. */
function mensagemErroSalvar(erro: unknown): string {
  if (erro instanceof HttpError) {
    if (erro.status === 409) {
      // Duplicidade de SKU ou codigo de barras: usa a mensagem curada do
      // backend; sem ela, um texto fixo (nunca o generico tecnico do httpClient).
      if (!ehMensagemGenerica(erro.message)) {
        return erro.message
      }
      return 'Já existe um produto com este SKU ou código de barras nesta empresa.'
    }
    if (erro.status === 400) {
      const mensagensCampos = erro.campos ? Object.values(erro.campos).filter(Boolean) : []
      if (mensagensCampos.length > 0) {
        return mensagensCampos.join(' ')
      }
      if (!ehMensagemGenerica(erro.message)) {
        return erro.message
      }
      return 'Revise os dados do produto e tente novamente.'
    }
    if (erro.status === 403) {
      return 'Somente administradores podem cadastrar ou alterar produtos.'
    }
    if (erro.status === 404) {
      return 'O produto, a unidade ou a categoria escolhida não existe mais. Atualize a tela e tente novamente.'
    }
  }
  return 'Não foi possível salvar o produto. Tente novamente.'
}

/** Orientacao somada ao 409 de SKU: a sugestao nao reserva o SKU (spec 4.2). */
const ORIENTACAO_SKU_DUPLICADO = 'Gere outro SKU ou informe um diferente.'

/** Resumo no topo quando o erro foi levado ao campo (que pode estar numa aba fechada). */
function mensagemErroNaAba(aba: AbaProduto): string {
  return `O produto não foi salvo. Confira o erro na aba ${ROTULO_ABA[aba]}.`
}

/** Falha ao salvar mostrada no topo; mudar um dos `campos` a retira (o erro ja esta sendo corrigido). */
interface ErroAoSalvar {
  mensagem: string
  campos: readonly (keyof ProdutoFormValues)[]
}

/** Id do titulo da pagina (destino do foco quando a origem some). */
const ID_TITULO_PRODUTO = 'produto-titulo'

/** Ao fechar o dialogo, volta o foco a origem; se ela sumiu (ex.: Excluir apos o 409), ao titulo. */
function focoAoFecharDialogo(origem: HTMLElement | null): HTMLElement | null {
  return origem?.isConnected ? origem : document.getElementById(ID_TITULO_PRODUTO)
}

/** Tecla do atalho de salvar mostrada na barra de acoes (Cmd no Mac, Ctrl nos demais). */
const TECLA_ATALHO = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'

/** Erro do backend levado a um campo do formulario. */
interface ErroDeCampoDoServidor {
  campo: keyof ProdutoFormValues
  mensagem: string
}

/** Campos do formulario que podem receber erro do backend (o texto pendente nunca vai no request). */
const CAMPOS_COM_ERRO_DO_SERVIDOR: ReadonlySet<string> = new Set(
  Object.keys(valoresIniciais()).filter((campo) => campo !== 'codigoPendente'),
)

function ehCampoComErroDoServidor(campo: string): campo is keyof ProdutoFormValues {
  return CAMPOS_COM_ERRO_DO_SERVIDOR.has(campo)
}

/** Campos com a regra de fracao pela unidade de venda (checada no envio). */
const CAMPOS_COM_ERRO_DE_FRACAO = ['quantidadeMinimaAtacado', 'estoqueInicial'] as const

/** Inicio fixo das mensagens do backend sobre um codigo de barras (409 de outro produto, 400 de digito). */
const INICIO_MENSAGEM_CODIGO_DE_BARRAS = 'O código de barras '
/** Mensagem fixa do backend para SKU repetido (409). */
const MENSAGEM_SKU_DUPLICADO = 'Já existe um produto com este SKU nesta empresa.'

/**
 * Erros do backend que pertencem a campos do formulario, para marcar cada
 * campo (e a aba dele). Usa `campos` da resposta (400 e 409): a chave sem o
 * indice (`codigosBarras[2]` -> `codigosBarras`) ou, na promocao e no atacado,
 * o campo correspondente (`promocao.preco` -> `precoPromocional`). Sem `campos`, o texto e so o
 * fallback: codigo de barras primeiro, pelo inicio fixo da mensagem (o nome de
 * outro produto citado nela pode conter "SKU"), depois a mensagem exata de SKU.
 * `restantes` sao mensagens de chaves que nao sao campos do formulario.
 */
function errosDeCampoDoServidor(erro: unknown): { erros: ErroDeCampoDoServidor[]; restantes: string[] } {
  const vazio = { erros: [], restantes: [] }
  if (!(erro instanceof HttpError) || (erro.status !== 400 && erro.status !== 409)) {
    return vazio
  }
  const comOrientacao = (campo: keyof ProdutoFormValues, mensagem: string) =>
    erro.status === 409 && campo === 'sku' ? `${mensagem} ${ORIENTACAO_SKU_DUPLICADO}` : mensagem

  if (erro.campos) {
    const porCampo = new Map<keyof ProdutoFormValues, string[]>()
    const restantes: string[] = []
    for (const [chave, mensagem] of Object.entries(erro.campos)) {
      const campo = campoDaChaveDoServidor(chave)
      if (ehCampoComErroDoServidor(campo)) {
        const mensagens = porCampo.get(campo) ?? []
        if (!mensagens.includes(mensagem)) {
          mensagens.push(mensagem)
        }
        porCampo.set(campo, mensagens)
      } else {
        restantes.push(mensagem)
      }
    }
    const erros = [...porCampo].map(([campo, mensagens]) => ({
      campo,
      mensagem: comOrientacao(campo, mensagens.join(' ')),
    }))
    return { erros, restantes }
  }

  if (ehMensagemGenerica(erro.message)) {
    return vazio
  }
  if (erro.message.startsWith(INICIO_MENSAGEM_CODIGO_DE_BARRAS)) {
    return { erros: [{ campo: 'codigosBarras', mensagem: erro.message }], restantes: [] }
  }
  if (erro.status === 409 && erro.message === MENSAGEM_SKU_DUPLICADO) {
    return { erros: [{ campo: 'sku', mensagem: comOrientacao('sku', erro.message) }], restantes: [] }
  }
  return vazio
}

/**
 * Resumo no topo quando os erros foram levados aos campos: diz em que aba(s)
 * olhar. `abaAtual` conta para um campo que ela tambem mostra.
 */
function mensagemErrosNosCampos(campos: readonly (keyof ProdutoFormValues)[], abaAtual: AbaProduto): string {
  const abas = ABAS_PRODUTO.filter((aba) =>
    campos.some((campo) => primeiroCampoComErro((alvo) => alvo === campo, abaAtual)?.aba === aba),
  )
  if (abas.length <= 1) {
    const aba = abas[0] ?? abaAtual
    return campos.length > 1
      ? `O produto não foi salvo. Confira os erros na aba ${ROTULO_ABA[aba]}.`
      : mensagemErroNaAba(aba)
  }
  const nomes = abas.map((aba) => ROTULO_ABA[aba])
  return `O produto não foi salvo. Confira os erros nas abas ${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}.`
}

/** Mensagem do dialogo quando a exclusao falha (409 traz o motivo curado do backend). */
function mensagemErroExcluir(erro: unknown): string {
  if (erro instanceof HttpError) {
    if (erro.status === 409 && !ehMensagemGenerica(erro.message)) {
      return erro.message
    }
    if (erro.status === 409) {
      return 'Este produto não pode ser excluído. Inative-o para que não apareça na venda.'
    }
    if (erro.status === 403) {
      return 'Somente administradores podem excluir produtos.'
    }
    if (erro.status === 404) {
      return 'Este produto não existe mais ou já foi excluído.'
    }
  }
  return 'Não foi possível excluir o produto. Tente novamente.'
}

function ehAba(valor: string): valor is AbaProduto {
  return (ABAS_PRODUTO as readonly string[]).includes(valor)
}

/**
 * Pagina do produto (`/produtos/novo` e `/produtos/:id`): formulario em abas.
 * A `key` remonta tudo ao trocar de produto, sem estado herdado do anterior.
 */
export function ProdutoPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const voltarPara = destinoDaLista(location.state)

  if (id === undefined) {
    if (somenteLeitura) {
      return (
        <EstruturaPagina titulo="Novo produto" voltarPara={voltarPara}>
          <AvisoSomenteLeitura texto="Somente administradores podem cadastrar produtos." />
        </EstruturaPagina>
      )
    }
    return <FormularioProduto key="novo" produto={null} voltarPara={voltarPara} somenteLeitura={false} />
  }
  return <CarregamentoProduto key={id} id={id} voltarPara={voltarPara} somenteLeitura={somenteLeitura} />
}

interface EstruturaPaginaProps {
  titulo: string
  voltarPara: string
  ativo?: boolean
  /** Acao junto do selo de status (Inativar/Reativar, so ADMIN). */
  acaoStatus?: ReactNode
  /** Acoes do cabecalho (ex.: "Excluir"), alinhadas a direita. */
  acoes?: ReactNode
  children: ReactNode
}

/** Sub-navegacao do catalogo, "Voltar para produtos", titulo e selo de status. */
function EstruturaPagina({ titulo, voltarPara, ativo, acaoStatus, acoes, children }: EstruturaPaginaProps) {
  return (
    <div className="space-y-6">
      <CatalogoNav />
      <header className="space-y-2">
        <Link
          to={voltarPara}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para produtos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {/* Nome longo ocupa ate duas linhas (palavra longa quebra em vez de vazar); o nome completo fica no title. */}
          {/* tabIndex -1: recebe o foco quando o elemento de origem sai da tela (ex.: Excluir apos o 409). */}
          <h1
            id={ID_TITULO_PRODUTO}
            tabIndex={-1}
            title={titulo}
            className="line-clamp-2 min-w-0 text-2xl font-semibold tracking-tight break-words outline-none"
          >
            {titulo}
          </h1>
          {ativo !== undefined && <SeloStatus ativo={ativo} />}
          {acaoStatus}
          {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
        </div>
        {ativo === false && (
          <p className="text-xs text-muted-foreground">Produto inativo não aparece para venda no PDV.</p>
        )}
      </header>
      {children}
    </div>
  )
}

interface CarregamentoProdutoProps {
  id: string
  voltarPara: string
  somenteLeitura: boolean
}

/**
 * Busca o produto e trata carregando / nao encontrado / falha antes do formulario.
 * - So a falha da primeira carga troca a pagina pela tela de erro: um refetch
 *   que falha depois (ex.: apos o 409 da exclusao) nao derruba o formulario.
 * - O formulario so monta com dados buscados nesta abertura: os valores
 *   iniciais sao lidos uma vez, e o cache pode ter uma versao antiga.
 */
function CarregamentoProduto({ id, voltarPara, somenteLeitura }: CarregamentoProdutoProps) {
  const produtoQuery = useQuery<Produto>({
    queryKey: chaveDoProduto(id),
    queryFn: () => buscarProduto(id),
  })

  if (!produtoQuery.isLoadingError && (produtoQuery.data === undefined || !produtoQuery.isFetchedAfterMount)) {
    return (
      <EstruturaPagina titulo="Produto" voltarPara={voltarPara}>
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando produto...
        </p>
      </EstruturaPagina>
    )
  }

  if (produtoQuery.data === undefined) {
    const erro = produtoQuery.error
    // 400 = id malformado na URL; para o usuario, e o mesmo que nao encontrado.
    const naoEncontrado = erro instanceof HttpError && (erro.status === 404 || erro.status === 400)
    return (
      <EstruturaPagina titulo="Produto" voltarPara={voltarPara}>
        <div className="max-w-2xl space-y-3">
          <ErroInline
            mensagem={
              naoEncontrado
                ? 'Este produto não existe ou foi excluído.'
                : 'Não foi possível carregar o produto.'
            }
          />
          {!naoEncontrado && (
            <Button variant="outline" size="sm" onClick={() => produtoQuery.refetch()}>
              Tentar novamente
            </Button>
          )}
        </div>
      </EstruturaPagina>
    )
  }

  return <FormularioProduto produto={produtoQuery.data} voltarPara={voltarPara} somenteLeitura={somenteLeitura} />
}

interface FormularioProdutoProps {
  /** Produto em edicao; null no cadastro. Os valores iniciais sao lidos so na montagem. */
  produto: Produto | null
  voltarPara: string
  somenteLeitura: boolean
}

function FormularioProduto({ produto, voltarPara, somenteLeitura }: FormularioProdutoProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const modoNovo = produto === null

  const [aba, setAba] = useState<AbaProduto>('geral')
  // O cadastro novo comeca pelo Nome.
  const [campoParaFocar, setCampoParaFocar] = useState<keyof ProdutoFormValues | null>(modoNovo ? 'nome' : null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<ErroAoSalvar | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  /** Saida apos salvar/excluir: navega no render seguinte, com o aviso de alteracoes ja desligado. */
  const [saida, setSaida] = useState<{ para: string; estado: EstadoParaLista } | null>(null)

  const unidadesQuery = useQuery<UnidadeMedida[]>({
    queryKey: TODAS_UNIDADES_QUERY_KEY,
    queryFn: () => listarUnidades(),
  })
  const categoriasQuery = useQuery<Categoria[]>({
    queryKey: TODAS_CATEGORIAS_QUERY_KEY,
    queryFn: () => listarCategorias(),
  })

  const form = useForm<ProdutoFormValues>({
    resolver: zodResolver(produtoSchema),
    defaultValues: produto ? valoresDoProduto(produto) : valoresIniciais(),
    // O foco do erro e da pagina: o campo pode estar numa aba fechada (ver aoInvalidar).
    shouldFocusError: false,
  })
  const {
    handleSubmit,
    reset,
    resetField,
    setError,
    setValue,
    getValues,
    getFieldState,
    watch,
    trigger,
    clearErrors,
    formState: { errors, isDirty, isSubmitted },
  } = form

  const { dialogo } = useAvisoAlteracoesNaoSalvas(isDirty && saida === null && !somenteLeitura)

  useEffect(() => {
    if (saida) {
      // replace: o "Voltar" do navegador nao reabre o produto recem-salvo ou ja excluido.
      navigate(saida.para, { state: saida.estado, replace: true })
    }
  }, [saida, navigate])

  // Depois do primeiro envio, os erros que comparam campos acompanham o campo
  // de que dependem (o RHF so revalida o campo alterado): preco de venda ou
  // minimo mudou -> revalida minimo, promocional e atacado. Trocar a unidade
  // apaga o erro de fracao (atacado e estoque inicial), checado de novo no proximo envio.
  useEffect(() => {
    if (!isSubmitted) {
      return
    }
    const assinatura = watch((_, { name }) => {
      if (name === 'precoVenda' || name === 'precoMinimo') {
        void trigger(['precoMinimo', 'precoPromocional', 'precoAtacado'])
      } else if (name === 'unidadeId') {
        for (const campo of CAMPOS_COM_ERRO_DE_FRACAO) {
          if (getFieldState(campo).error?.type === 'manual') {
            clearErrors(campo)
          }
        }
      }
    })
    return () => assinatura.unsubscribe()
  }, [isSubmitted, watch, trigger, getFieldState, clearErrors])

  // O resumo de erro do topo sai quando o campo a que ele se refere e alterado.
  const camposDoErroSalvar = erroSalvar?.campos
  useEffect(() => {
    if (!camposDoErroSalvar || camposDoErroSalvar.length === 0) {
      return
    }
    const assinatura = watch((_, { name }) => {
      if (name && camposDoErroSalvar.some((campo) => name === campo || name.startsWith(`${campo}.`))) {
        setErroSalvar(null)
      }
    })
    return () => assinatura.unsubscribe()
  }, [camposDoErroSalvar, watch])

  // Produto novo ja vem com UN (a unidade mais comum), se existir e estiver ativa.
  // Vira o valor padrao do campo: escolher a UN sozinha nao conta como alteracao.
  const unidades = unidadesQuery.data
  const padraoAplicadoRef = useRef(false)
  useEffect(() => {
    if (!modoNovo || !unidades || padraoAplicadoRef.current) {
      return
    }
    padraoAplicadoRef.current = true
    if (getValues('unidadeId') !== '' || getFieldState('unidadeId').isDirty) {
      return
    }
    const padrao = idUnidadePadrao(unidades)
    if (padrao) {
      resetField('unidadeId', { defaultValue: padrao })
    }
  }, [modoNovo, unidades, getValues, getFieldState, resetField])

  // Foco pedido ao abrir o cadastro, ao salvar com erro ou ao cadastrar outro.
  // O conteudo da aba recem-ativada monta num render seguinte (Presence do
  // Radix): por isso o foco vai para a fila, depois desse render. Sem o campo, foca a aba.
  useEffect(() => {
    if (!campoParaFocar) {
      return
    }
    const timer = window.setTimeout(() => {
      const alvo =
        document.getElementById(idDoCampo(campoParaFocar)) ??
        document.querySelector<HTMLElement>(`[role="tab"][data-aba="${aba}"]`)
      alvo?.focus()
      setCampoParaFocar(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [campoParaFocar, aba])

  // Siglas conhecidas (lista + unidades do produto) para "1 CX = 12 UN" e "por UN".
  const siglaPorId = useMemo(() => {
    const mapa = new Map((unidades ?? []).map((unidade) => [unidade.id, unidade.sigla]))
    for (const resumo of [produto?.unidade, produto?.unidadeCompra]) {
      if (resumo && !mapa.has(resumo.id)) {
        mapa.set(resumo.id, resumo.sigla)
      }
    }
    return mapa
  }, [unidades, produto])
  const formatosGravados = useMemo(() => formatosDoProduto(produto), [produto])
  // Unidades com o `fracionada` (lista + unidade do produto), para a regra de fracao do atacado.
  const unidadesConhecidas = useMemo<UnidadeResumo[]>(() => {
    const lista: UnidadeResumo[] = unidades ?? []
    const atual = produto?.unidade
    return atual && !lista.some((unidade) => unidade.id === atual.id) ? [...lista, atual] : lista
  }, [unidades, produto])

  const aoAlterarCampo = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
  }

  /**
   * Guarda sincrona contra envio duplo: `salvando` vem do ultimo render, e a
   * mutacao so comeca depois da validacao assincrona do `handleSubmit` — dois
   * cliques (ou Ctrl+Enter) seguidos passariam pelos dois. Marcada no inicio do
   * envio; liberada no erro de validacao ou quando a mutacao termina.
   */
  const enviandoRef = useRef(false)

  const salvarMutation = useMutation<Produto, unknown, { valores: ProdutoFormValues; acao: AcaoAposSalvar }>({
    mutationFn: ({ valores }) => {
      const request = montarRequest(valores, { novo: !produto })
      return produto ? atualizarProduto(produto.id, request) : cadastrarProduto(request)
    },
    onSuccess: (salvo, { valores, acao }) => {
      queryClient.setQueryData(chaveDoProduto(salvo.id), salvo)
      // Listas ficam desatualizadas e recarregam ao montar; nada a refazer nesta pagina.
      // O prefixo cobre tambem o historico de precos do produto (o save pode ter gravado linhas novas).
      void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY, refetchType: 'none' })
      setErroSalvar(null)
      if (acao === 'cadastrarOutro') {
        reset(valoresParaCadastrarOutro(valores))
        setMensagemSucesso(`Produto "${salvo.nome}" cadastrado com sucesso.`)
        setAba('geral')
        // No cadastro em sequencia com leitor, o proximo produto comeca pelo codigo.
        setCampoParaFocar('codigosBarras')
        return
      }
      setSaida({
        para: voltarPara,
        estado: { sucesso: `Produto "${salvo.nome}" ${produto ? 'atualizado' : 'cadastrado'} com sucesso.` },
      })
    },
    onError: async (erro) => {
      setMensagemSucesso(null)
      const { erros: errosDeCampo, restantes } = errosDeCampoDoServidor(erro)
      if (errosDeCampo.length > 0) {
        // Cada erro vai para o seu campo (com o indicador da aba); a pagina vai
        // para a primeira aba com erro (ou fica, se a atual mostra o campo).
        for (const { campo, mensagem } of errosDeCampo) {
          // Erro num campo de promocao/atacado: o bloco abre para o erro aparecer.
          const interruptor = interruptorDoCampo(campo)
          if (interruptor && !getValues(interruptor)) {
            setValue(interruptor, true)
          }
          setError(campo, { type: 'server', message: mensagem })
        }
        const campos = errosDeCampo.map(({ campo }) => campo)
        const destino = primeiroCampoComErro((campo) => campos.includes(campo), aba)
        const resumo = mensagemErrosNosCampos(campos, aba)
        setErroSalvar({ mensagem: [...restantes, resumo].join(' '), campos: restantes.length > 0 ? [] : campos })
        if (destino) {
          setAba(destino.aba)
          setCampoParaFocar(destino.campo)
        }
      } else {
        setErroSalvar({ mensagem: mensagemErroSalvar(erro), campos: [] })
      }
      // 400/404: a unidade ou a categoria escolhida pode ter sido inativada ou
      // removida; recarrega as listas para o select e o seletor sairem dela.
      if (erro instanceof HttpError && (erro.status === 400 || erro.status === 404)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: TODAS_UNIDADES_QUERY_KEY }),
          queryClient.invalidateQueries({ queryKey: TODAS_CATEGORIAS_QUERY_KEY }),
        ])
      }
    },
    onSettled: () => {
      enviandoRef.current = false
    },
  })

  const statusMutation = useMutation<Produto, unknown, { produto: Produto; proximoAtivo: boolean }>({
    mutationFn: ({ produto: alvo, proximoAtivo }) =>
      proximoAtivo ? reativarProduto(alvo.id) : inativarProduto(alvo.id),
    onSuccess: (atualizado, { proximoAtivo }) => {
      // Atualiza o selo sem tocar no formulario (alteracoes em andamento ficam).
      queryClient.setQueryData(chaveDoProduto(atualizado.id), atualizado)
      void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY, refetchType: 'none' })
      setErroGeral(null)
      setMensagemSucesso(proximoAtivo ? 'Produto reativado com sucesso.' : 'Produto inativado com sucesso.')
    },
    onError: () => {
      setMensagemSucesso(null)
      setErroGeral('Não foi possível alterar o status do produto. Tente novamente.')
    },
  })

  const excluirMutation = useMutation<void, unknown, Produto>({
    mutationFn: (alvo) => excluirProduto(alvo.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY, refetchType: 'none' })
      setConfirmandoExclusao(false)
      setSaida({ para: voltarPara, estado: { sucesso: 'Produto excluído.' } })
    },
    onError: (erro, alvo) => {
      setErroExcluir(mensagemErroExcluir(erro))
      // 409: o `podeExcluir` em tela estava desatualizado; recarrega o produto
      // (o formulario fica como esta: os valores iniciais so sao lidos na montagem).
      if (erro instanceof HttpError && erro.status === 409) {
        void queryClient.invalidateQueries({ queryKey: chaveDoProduto(alvo.id) })
      }
    },
  })

  const abrirExclusao = () => {
    excluirMutation.reset()
    setErroExcluir(null)
    setConfirmandoExclusao(true)
  }

  const fecharExclusao = () => {
    setConfirmandoExclusao(false)
    setErroExcluir(null)
  }

  /** Erro de validacao: vai para a primeira aba com erro (ou fica, se a atual mostra o campo) e foca o campo. */
  const aoInvalidar = (erros: FieldErrors<ProdutoFormValues>) => {
    const destino = primeiroCampoComErro((campo) => erros[campo] !== undefined, aba)
    if (destino) {
      setAba(destino.aba)
      setCampoParaFocar(destino.campo)
    }
  }

  /**
   * Codigo digitado e nao adicionado: ao salvar, entra na lista com as mesmas
   * regras do "Adicionar". Se for barrado, nada e salvo e o erro aparece no
   * campo (na aba atual, se ela o mostra; senao na Geral).
   */
  const incorporarCodigoPendente = (): boolean => {
    const pendente = getValues('codigoPendente')
    const resultado = avaliarNovoCodigo(pendente, getValues('codigosBarras'), formatosGravados)
    if (resultado.tipo === 'vazio') {
      if (pendente !== '') {
        setValue('codigoPendente', '')
      }
      return true
    }
    if (resultado.tipo === 'bloqueado') {
      setError('codigoPendente', { type: 'manual', message: resultado.motivo })
      const abaDestino: AbaProduto = aba === 'codigos' ? 'codigos' : 'geral'
      setMensagemSucesso(null)
      setErroSalvar({ mensagem: mensagemErroNaAba(abaDestino), campos: ['codigoPendente', 'codigosBarras'] })
      setAba(abaDestino)
      setCampoParaFocar('codigoPendente')
      return false
    }
    setValue('codigosBarras', resultado.lista, { shouldDirty: true })
    setValue('codigoPendente', '')
    return true
  }

  const salvando = salvarMutation.isPending || saida !== null

  const enviar = (acao: AcaoAposSalvar) => {
    if (enviandoRef.current || salvando || somenteLeitura || !incorporarCodigoPendente()) {
      return
    }
    enviandoRef.current = true
    void handleSubmit(
      (valores) => {
        // Fracao no atacado e no estoque inicial depende da unidade escolhida: checada aqui, com a lista carregada.
        const errosFracao: FieldErrors<ProdutoFormValues> = {}
        const fracaoAtacado = erroFracaoAtacado(valores, unidadesConhecidas)
        const fracaoInicial = erroFracaoEstoqueInicial(valores, unidadesConhecidas)
        if (fracaoAtacado) {
          errosFracao.quantidadeMinimaAtacado = { type: 'manual', message: fracaoAtacado }
        }
        if (fracaoInicial) {
          errosFracao.estoqueInicial = { type: 'manual', message: fracaoInicial }
        }
        if (fracaoAtacado || fracaoInicial) {
          enviandoRef.current = false
          for (const campo of CAMPOS_COM_ERRO_DE_FRACAO) {
            const erro = errosFracao[campo]
            if (erro?.message) {
              setError(campo, { type: 'manual', message: erro.message })
            }
          }
          aoInvalidar(errosFracao)
          return
        }
        setErroSalvar(null)
        setMensagemSucesso(null)
        salvarMutation.mutate({ valores, acao })
      },
      (erros) => {
        enviandoRef.current = false
        aoInvalidar(erros)
      },
    )()
  }

  /**
   * Ctrl+Enter (Cmd+Enter no Mac) salva de qualquer campo. No cadastro novo,
   * Enter sozinho num campo de texto nao envia (so o botao): o leitor de
   * codigo de barras termina com Enter e o cadastro em sequencia nao pode
   * sair antes da hora. Na edicao, Enter segue o padrao do navegador.
   */
  const aoTeclarNoFormulario = (event: KeyboardEvent<HTMLFormElement>) => {
    const alvo = event.target
    // So o que esta no DOM do formulario: paineis em portal (ex.: o de categoria) ficam de fora.
    if (event.key !== 'Enter' || !(alvo instanceof Node) || !event.currentTarget.contains(alvo)) {
      return
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      enviar('voltar')
      return
    }
    if (modoNovo && alvo instanceof HTMLInputElement) {
      event.preventDefault()
    }
  }

  const acaoEmAndamento = salvarMutation.isPending ? salvarMutation.variables?.acao : undefined
  const desabilitado = salvando || somenteLeitura

  const errosPorAba = (alvo: AbaProduto) => CAMPOS_POR_ABA[alvo].filter((campo) => errors[campo] !== undefined).length
  // Historico so existe para um produto ja gravado.
  const abasVisiveis = modoNovo ? ABAS_PRODUTO.filter((alvo) => alvo !== 'historico') : ABAS_PRODUTO

  const podeExcluir = produto !== null && !somenteLeitura && produto.podeExcluir
  // 409: o produto teve movimentacao; inativar e a saida que a mensagem indica.
  const exclusaoBloqueada =
    erroExcluir !== null && excluirMutation.error instanceof HttpError && excluirMutation.error.status === 409

  return (
    <EstruturaPagina
      titulo={produto ? produto.nome : 'Novo produto'}
      voltarPara={voltarPara}
      ativo={produto?.ativo}
      acaoStatus={
        produto &&
        !somenteLeitura && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => statusMutation.mutate({ produto, proximoAtivo: !produto.ativo })}
            disabled={statusMutation.isPending || salvando}
          >
            {statusMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : produto.ativo ? (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            {produto.ativo ? 'Inativar' : 'Reativar'}
          </Button>
        )
      }
      acoes={
        podeExcluir && (
          <Button
            type="button"
            variant="outline"
            onClick={abrirExclusao}
            disabled={salvando}
            className="min-h-11 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Excluir
          </Button>
        )
      }
    >
      {somenteLeitura && (
        <AvisoSomenteLeitura texto="Somente administradores podem alterar produtos. Você está no modo leitura." />
      )}
      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} />

      <FormProvider {...form}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            enviar('voltar')
          }}
          onKeyDown={aoTeclarNoFormulario}
          noValidate
          aria-label={produto ? `Editar ${produto.nome}` : 'Novo produto'}
          className="max-w-4xl space-y-4"
        >
          {erroSalvar && <ErroInline mensagem={erroSalvar.mensagem} />}
          {!somenteLeitura && (
            <p className="text-sm text-muted-foreground">
              Campos com <span aria-hidden="true">*</span>
              <span className="sr-only">asterisco</span> são obrigatórios; os demais são opcionais.
            </p>
          )}

          <Tabs value={aba} onValueChange={(valor) => ehAba(valor) && setAba(valor)}>
            <TabsList aria-label="Seções do produto">
              {abasVisiveis.map((alvo) => {
                const quantidadeErros = errosPorAba(alvo)
                return (
                  <TabsTrigger key={alvo} value={alvo} data-aba={alvo}>
                    {ROTULO_ABA[alvo]}
                    {quantidadeErros > 0 && (
                      <>
                        <span aria-hidden="true" className="size-2 rounded-full bg-destructive" />{' '}
                        <span className="sr-only">
                          {quantidadeErros === 1 ? '(1 erro)' : `(${quantidadeErros} erros)`}
                        </span>
                      </>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <Card>
              <CardContent>
                <TabsContent value="geral">
                  <AbaGeral
                    produto={produto}
                    unidadesQuery={unidadesQuery}
                    categoriasQuery={categoriasQuery}
                    siglaPorId={siglaPorId}
                    desabilitado={desabilitado}
                    somenteLeitura={somenteLeitura}
                    aoAlterarCampo={aoAlterarCampo}
                  />
                </TabsContent>
                <TabsContent value="precos">
                  <AbaPrecos siglaPorId={siglaPorId} desabilitado={desabilitado} aoAlterarCampo={aoAlterarCampo} />
                </TabsContent>
                <TabsContent value="estoque">
                  <AbaEstoque
                    produto={produto}
                    siglaPorId={siglaPorId}
                    desabilitado={desabilitado}
                    somenteLeitura={somenteLeitura}
                    aoAlterarCampo={aoAlterarCampo}
                    aoAjustarEstoque={(mensagem) => {
                      setErroGeral(null)
                      setMensagemSucesso(mensagem)
                    }}
                  />
                </TabsContent>
                <TabsContent value="codigos">
                  <AbaCodigos
                    produto={produto}
                    desabilitado={desabilitado}
                    somenteLeitura={somenteLeitura}
                    aoAlterarCampo={aoAlterarCampo}
                  />
                </TabsContent>
                {produto && (
                  <TabsContent value="historico">
                    <AbaHistorico produtoId={produto.id} />
                  </TabsContent>
                )}
              </CardContent>
            </Card>
          </Tabs>

          {!somenteLeitura && (
            <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-background py-3 sm:flex-row sm:items-center sm:justify-end">
              <p className="hidden text-xs text-muted-foreground sm:mr-auto sm:block">
                <kbd className="rounded border bg-muted px-1 font-sans">{TECLA_ATALHO}</kbd>
                {' + '}
                <kbd className="rounded border bg-muted px-1 font-sans">Enter</kbd> salva
              </p>
              <Button asChild variant="outline">
                <Link to={voltarPara}>Cancelar</Link>
              </Button>
              {modoNovo && (
                <Button type="button" variant="outline" onClick={() => enviar('cadastrarOutro')} disabled={salvando}>
                  {acaoEmAndamento === 'cadastrarOutro' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Salvar e cadastrar outro
                </Button>
              )}
              <Button type="submit" disabled={salvando} aria-keyshortcuts="Control+Enter Meta+Enter">
                {acaoEmAndamento === 'voltar' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {acaoEmAndamento === 'voltar' ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </form>
      </FormProvider>

      {produto && (
        <ConfirmarExclusaoDialog
          aberto={confirmandoExclusao}
          titulo={`Excluir ${produto.nome}?`}
          descricao={
            <>
              <p>Esta ação não pode ser desfeita. Os códigos de barras do produto também serão excluídos.</p>
              {produto.ativo && <p>Se quiser apenas tirar o produto da venda, inative-o; dá para reativar depois.</p>}
              {erroExcluir && <ErroInline mensagem={erroExcluir} />}
            </>
          }
          excluindo={excluirMutation.isPending}
          onConfirmar={() => excluirMutation.mutate(produto)}
          onCancelar={fecharExclusao}
          destinoFoco={focoAoFecharDialogo}
          podeExcluir={!exclusaoBloqueada}
          // Inativar e oferecido desde a abertura; vira a acao principal se o 409 barrar a exclusao.
          alternativa={
            produto.ativo
              ? {
                  rotulo: 'Inativar',
                  icone: XCircle,
                  executando: statusMutation.isPending,
                  onExecutar: () =>
                    statusMutation.mutate({ produto, proximoAtivo: false }, { onSuccess: fecharExclusao }),
                }
              : undefined
          }
        />
      )}

      {dialogo}
    </EstruturaPagina>
  )
}
