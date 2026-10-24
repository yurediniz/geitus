import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FormProvider, useForm, type FieldErrors, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  FORNECEDORES_QUERY_KEY,
  PRODUTOS_QUERY_KEY,
  TODAS_CATEGORIAS_QUERY_KEY,
  TODAS_MARCAS_QUERY_KEY,
  TODAS_UNIDADES_QUERY_KEY,
  ehMensagemGenerica,
} from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { AvisoSomenteLeitura, ErroInline, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import { useFornecedoresGravados } from '@/features/products/fornecedoresGravados'
import { destinoDaLista, type EstadoParaLista } from '@/features/products/navegacaoProdutos'
import {
  CAMPOS_DA_EMBALAGEM,
  CAMPOS_POR_SECAO,
  MAXIMO_CODIGOS_POR_EMBALAGEM,
  ROTULO_SECAO,
  SECOES_PRODUTO,
  avaliarNovoCodigo,
  caminhosComErroNasEmbalagens,
  localizarCodigoForaDaLista,
  campoDaChaveDoServidor,
  erroCodigoNaEtiqueta,
  erroFracaoAtacado,
  erroFracaoEstoqueInicial,
  formatosDoProduto,
  idDoCampo,
  interruptorDoCampo,
  idUnidadePadrao,
  montarRequest,
  numeroParaTexto,
  primeiroCampoComErro,
  produtoSchemaCom,
  secaoDoCampo,
  valoresDoProduto,
  valoresIniciais,
  valoresParaCadastrarOutro,
  type ProdutoFormValues,
  type SecaoProduto,
} from '@/features/products/produtoFormulario'
import { SeloStatus } from '@/features/products/SeloStatus'
import { AtalhosDasSecoes, SecaoDaPagina } from '@/features/products/secoes/AtalhosDasSecoes'
import { ID_BARRA_FIXA, rolarAteASecao, rolarEFocarCampo } from '@/features/products/secoes/rolagem'
import { SecaoCodigos } from '@/features/products/secoes/SecaoCodigos'
import { SecaoEmbalagens } from '@/features/products/secoes/SecaoEmbalagens'
import { SecaoEstoque } from '@/features/products/secoes/SecaoEstoque'
import { SecaoGeral } from '@/features/products/secoes/SecaoGeral'
import { SecaoHistorico } from '@/features/products/secoes/SecaoHistorico'
import { SecaoPrecos } from '@/features/products/secoes/SecaoPrecos'
import { useSecaoAtiva } from '@/features/products/secoes/useSecaoVisivel'
import { useConfiguracaoEtiqueta } from '@/features/catalog/useConfiguracaoEtiqueta'
import { useAuth } from '@/hooks/useAuth'
import { useAvisoAlteracoesNaoSalvas } from '@/hooks/useAvisoAlteracoesNaoSalvas'
import { listarCategorias } from '@/services/categoriaService'
import { HttpError } from '@/services/httpClient'
import { listarMarcas } from '@/services/marcaService'
import {
  atualizarProduto,
  buscarProduto,
  cadastrarProduto,
  excluirProduto,
  inativarProduto,
  reativarProduto,
} from '@/services/produtoService'
import { listarUnidades } from '@/services/unidadeService'
import type { Categoria, Marca, UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
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
      // Duplicidade de codigo, SKU ou codigo de barras: usa a mensagem curada do
      // backend; sem ela, um texto fixo (nunca o generico tecnico do httpClient).
      if (!ehMensagemGenerica(erro.message)) {
        return erro.message
      }
      return 'Já existe um produto com este código, SKU ou código de barras nesta empresa.'
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
      return 'O produto, a unidade, a categoria, a marca, um fornecedor ou uma embalagem escolhida não existe mais. Atualize a tela e tente novamente.'
    }
  }
  return 'Não foi possível salvar o produto. Tente novamente.'
}

/** Orientacao somada ao 409 de SKU: a sugestao nao reserva o SKU (spec 4.2). */
const ORIENTACAO_SKU_DUPLICADO = 'Gere outro SKU ou informe um diferente.'

/** Resumo no topo quando o erro foi levado ao campo (que pode estar numa secao mais abaixo). */
function mensagemErroNaSecao(secao: SecaoProduto): string {
  return `O produto não foi salvo. Confira o erro na seção ${ROTULO_SECAO[secao]}.`
}

/** Para onde levar o foco: o campo (o caminho, ex.: "embalagens.0.quantidade") e a secao dele. */
interface DestinoDoErro {
  secao: SecaoProduto
  campo: string
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

/** Tecla na dica de atalhos do rodape. */
function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-sans">{children}</kbd>
}

/**
 * Erro do backend levado a um campo do formulario: `campo` e o campo de
 * primeiro nivel (contagem e resumo por secao) e `caminho`, onde o erro fica
 * (igual ao campo, ou "embalagens.1.quantidade").
 */
interface ErroDeCampoDoServidor {
  campo: keyof ProdutoFormValues
  caminho: string
  mensagem: string
}

/** Campos do formulario que podem receber erro do backend (o texto pendente nunca vai no request). */
const CAMPOS_COM_ERRO_DO_SERVIDOR: ReadonlySet<string> = new Set(
  Object.keys(valoresIniciais()).filter((campo) => campo !== 'codigoPendente'),
)

function ehCampoComErroDoServidor(campo: string): campo is keyof ProdutoFormValues {
  return CAMPOS_COM_ERRO_DO_SERVIDOR.has(campo)
}

/**
 * Caminho do erro do backend no formulario: o de uma embalagem que existe na
 * tela fica nela; o de um indice que nao existe vai para a lista.
 */
function caminhoNoFormulario(caminho: string, quantidadeDeEmbalagens: number): string {
  const [campo, indice] = caminho.split('.')
  if (campo !== 'embalagens' || indice === undefined) {
    return caminho
  }
  return Number(indice) < quantidadeDeEmbalagens ? caminho : 'embalagens'
}

/** O primeiro caminho de embalagem na ordem da tela (a lista inteira, depois embalagem a embalagem e campo a campo). */
function primeiroCaminhoDeEmbalagem(caminhos: readonly string[]): string {
  const ordem = (caminho: string): [number, number] => {
    const [, indice, campo] = caminho.split('.')
    if (indice === undefined) {
      return [-1, -1]
    }
    return [Number(indice), (CAMPOS_DA_EMBALAGEM as readonly string[]).indexOf(campo)]
  }
  return (
    [...caminhos].sort((a, b) => {
      const [indiceA, campoA] = ordem(a)
      const [indiceB, campoB] = ordem(b)
      return indiceA - indiceB || campoA - campoB
    })[0] ?? 'embalagens'
  )
}

/** Campos com regras checadas no envio: fracao pela unidade de venda e o tamanho do codigo na etiqueta. */
const CAMPOS_COM_ERRO_NO_ENVIO = ['quantidadeMinimaAtacado', 'estoqueInicial', 'codigo'] as const

/** Campos que trocar a unidade de venda reavalia (o erro de fracao sai e e checado de novo no envio). */
const CAMPOS_COM_ERRO_DE_FRACAO = ['quantidadeMinimaAtacado', 'estoqueInicial'] as const

/** "Produto "Acucar" cadastrado (Nº 16 · Cód. 542)." (o codigo so se houver). */
function mensagemCadastradoOutro(salvo: Produto): string {
  const codigo = salvo.codigo !== null ? ` · Cód. ${salvo.codigo}` : ''
  return `Produto "${salvo.nome}" cadastrado (Nº ${salvo.numero}${codigo}).`
}

/** Inicio fixo das mensagens do backend sobre um codigo de barras (409 de outro produto, 400 de digito). */
const INICIO_MENSAGEM_CODIGO_DE_BARRAS = 'O código de barras '
/** Inicio fixo da mensagem do backend para codigo do produto repetido (409). */
const INICIO_MENSAGEM_CODIGO_DO_PRODUTO = 'Este código já está em uso no produto '
/** Mensagem fixa do backend para SKU repetido (409). */
const MENSAGEM_SKU_DUPLICADO = 'Já existe um produto com este SKU nesta empresa.'

/**
 * Erros do backend que pertencem a campos do formulario, para marcar cada
 * campo (e o atalho da secao dele). Usa `campos` da resposta (400 e 409): a chave sem o
 * indice (`codigosBarras[2]` -> `codigosBarras`) ou, na promocao e no atacado,
 * o campo correspondente (`promocao.preco` -> `precoPromocional`). Sem `campos`, o texto e so o
 * fallback: codigo de barras e codigo do produto primeiro, pelo inicio fixo da
 * mensagem (o nome de outro produto citado nela pode conter "SKU"), depois a
 * mensagem exata de SKU.
 * `restantes` sao mensagens de chaves que nao sao campos do formulario.
 */
function errosDeCampoDoServidor(
  erro: unknown,
  quantidadeDeEmbalagens: number,
): { erros: ErroDeCampoDoServidor[]; restantes: string[] } {
  const vazio = { erros: [], restantes: [] }
  if (!(erro instanceof HttpError) || (erro.status !== 400 && erro.status !== 409)) {
    return vazio
  }
  const comOrientacao = (campo: keyof ProdutoFormValues, mensagem: string) =>
    erro.status === 409 && campo === 'sku' ? `${mensagem} ${ORIENTACAO_SKU_DUPLICADO}` : mensagem

  if (erro.campos) {
    const porCaminho = new Map<string, { campo: keyof ProdutoFormValues; mensagens: string[] }>()
    const restantes: string[] = []
    for (const [chave, mensagem] of Object.entries(erro.campos)) {
      const caminho = caminhoNoFormulario(campoDaChaveDoServidor(chave), quantidadeDeEmbalagens)
      const campo = caminho.split('.')[0]
      if (ehCampoComErroDoServidor(campo)) {
        const doCaminho = porCaminho.get(caminho) ?? { campo, mensagens: [] }
        if (!doCaminho.mensagens.includes(mensagem)) {
          doCaminho.mensagens.push(mensagem)
        }
        porCaminho.set(caminho, doCaminho)
      } else {
        restantes.push(mensagem)
      }
    }
    const erros = [...porCaminho].map(([caminho, { campo, mensagens }]) => ({
      campo,
      caminho,
      mensagem: comOrientacao(campo, mensagens.join(' ')),
    }))
    return { erros, restantes }
  }

  if (ehMensagemGenerica(erro.message)) {
    return vazio
  }
  if (erro.message.startsWith(INICIO_MENSAGEM_CODIGO_DE_BARRAS)) {
    return { erros: [{ campo: 'codigosBarras', caminho: 'codigosBarras', mensagem: erro.message }], restantes: [] }
  }
  if (erro.status === 409 && erro.message.startsWith(INICIO_MENSAGEM_CODIGO_DO_PRODUTO)) {
    return { erros: [{ campo: 'codigo', caminho: 'codigo', mensagem: erro.message }], restantes: [] }
  }
  if (erro.status === 409 && erro.message === MENSAGEM_SKU_DUPLICADO) {
    return { erros: [{ campo: 'sku', caminho: 'sku', mensagem: comOrientacao('sku', erro.message) }], restantes: [] }
  }
  return vazio
}

/** Resumo no topo quando os erros foram levados aos campos: diz em que secao(oes) olhar. */
function mensagemErrosNosCampos(campos: readonly (keyof ProdutoFormValues)[], quantidadeDeErros: number): string {
  const secoes = SECOES_PRODUTO.filter((secao) => campos.some((campo) => secaoDoCampo(campo) === secao))
  if (secoes.length <= 1) {
    const secao = secoes[0] ?? 'geral'
    return quantidadeDeErros > 1
      ? `O produto não foi salvo. Confira os erros na seção ${ROTULO_SECAO[secao]}.`
      : mensagemErroNaSecao(secao)
  }
  const nomes = secoes.map((secao) => ROTULO_SECAO[secao])
  return `O produto não foi salvo. Confira os erros nas seções ${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}.`
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

/** Secoes do cadastro novo: o Historico so existe para um produto ja gravado. */
const SECOES_DO_CADASTRO = SECOES_PRODUTO.filter((secao) => secao !== 'historico')

/**
 * Pagina do produto (`/produtos/novo` e `/produtos/:id`): formulario em tela
 * unica, com as secoes empilhadas e a barra de atalhos (spec B2 §4).
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

  const secoesVisiveis = modoNovo ? SECOES_DO_CADASTRO : SECOES_PRODUTO
  const [secaoAtiva, marcarSecao] = useSecaoAtiva(secoesVisiveis)
  const digitosCodigoNaEtiqueta = useConfiguracaoEtiqueta().data?.digitosCodigo ?? null
  // O cadastro novo comeca pelo Nome.
  const [campoParaFocar, setCampoParaFocar] = useState<string | null>(modoNovo ? 'nome' : null)
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
  const marcasQuery = useQuery<Marca[]>({
    queryKey: TODAS_MARCAS_QUERY_KEY,
    queryFn: () => listarMarcas(),
  })

  // Unidades com o `fracionada` (lista + unidade do produto e das embalagens): as regras de fracao
  // (atacado, estoque inicial e embalagens) e as siglas das mensagens das embalagens.
  const unidades = unidadesQuery.data
  const unidadesConhecidas = useMemo<UnidadeResumo[]>(() => {
    const lista: UnidadeResumo[] = [...(unidades ?? [])]
    for (const resumo of [produto?.unidade, ...(produto?.embalagens ?? []).map((embalagem) => embalagem.unidade)]) {
      if (resumo && !lista.some((unidade) => unidade.id === resumo.id)) {
        lista.push(resumo)
      }
    }
    return lista
  }, [unidades, produto])
  // O schema muda quando a lista de unidades carrega (o RHF le o resolver a cada render).
  const resolver = useMemo(() => zodResolver(produtoSchemaCom(unidadesConhecidas)), [unidadesConhecidas])

  const form = useForm<ProdutoFormValues>({
    resolver,
    defaultValues: produto ? valoresDoProduto(produto) : valoresIniciais(),
    // O foco do erro e da pagina: rola ate o campo antes de focar (ver aoInvalidar).
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

  const { dialogo } = useAvisoAlteracoesNaoSalvas(
    isDirty && saida === null && !somenteLeitura,
    'Você alterou este produto e ainda não salvou. Se sair agora, as alterações serão perdidas.',
  )

  // Uma entrada por compra com fornecedor (modal de estoque) muda os fornecedores gravados com a pagina aberta.
  const { registrarCompra } = useFornecedoresGravados(produto, form)

  useEffect(() => {
    if (saida) {
      // replace: o "Voltar" do navegador nao reabre o produto recem-salvo ou ja excluido.
      navigate(saida.para, { state: saida.estado, replace: true })
    }
  }, [saida, navigate])

  // Depois do primeiro envio, os erros que comparam campos acompanham o campo
  // de que dependem (o RHF so revalida o campo alterado): preco de venda ou
  // minimo mudou -> revalida minimo, promocional e atacado; um nivel de estoque
  // mudou -> revalida ponto e maximo. Trocar a unidade
  // apaga o erro de fracao (atacado e estoque inicial), checado de novo no proximo envio.
  useEffect(() => {
    if (!isSubmitted) {
      return
    }
    const assinatura = watch((_, { name }) => {
      if (name === 'precoVenda' || name === 'precoMinimo') {
        void trigger(['precoMinimo', 'precoPromocional', 'precoAtacado'])
      } else if (name === 'estoqueMinimo' || name === 'pontoReposicao' || name === 'estoqueMaximo') {
        // minimo <= ponto <= maximo: o erro fica no ponto ou no maximo, e muda com qualquer um dos tres.
        void trigger(['pontoReposicao', 'estoqueMaximo'])
      } else if (name === 'unidadeId') {
        for (const campo of CAMPOS_COM_ERRO_DE_FRACAO) {
          if (getFieldState(campo).error?.type === 'manual') {
            clearErrors(campo)
          }
        }
      }
      // Os erros das embalagens comparam embalagens entre si e com a unidade de venda e o preco
      // minimo: com algum na tela, a lista inteira e revalidada quando um desses muda ou quando
      // uma embalagem entra ou sai (o erro de um indice nao fica na embalagem que passa para ele).
      const afetaEmbalagens =
        name === 'embalagens' ||
        name === 'unidadeId' ||
        name === 'precoMinimo' ||
        (name !== undefined && /^embalagens\.\d+\.(unidadeId|quantidade|deCompra)$/.test(name))
      if (afetaEmbalagens && getFieldState('embalagens').invalid) {
        void trigger('embalagens')
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

  // O custo gravado mudou com a pagina aberta (entrada por compra pelo modal de estoque, spec B4):
  // com o campo intocado, ele passa a mostrar o custo novo (salvar nao o desfaz como "editado");
  // alterado pelo usuario, o valor digitado fica, e a secao Precos avisa a diferenca.
  const custoGravado = produto?.custo ?? null
  const custoGravadoEm = produto?.custoOrigem?.em ?? null
  const custoDaCompra = produto?.custoOrigem?.tipo === 'ENTRADA_COMPRA' ? custoGravado : null
  const custoSincronizadoRef = useRef({ custo: custoGravado, em: custoGravadoEm })
  const [custoDaCompraNaoAplicado, setCustoDaCompraNaoAplicado] = useState<number | null>(null)
  useEffect(() => {
    const sincronizado = custoSincronizadoRef.current
    if (sincronizado.custo === custoGravado && sincronizado.em === custoGravadoEm) {
      return
    }
    custoSincronizadoRef.current = { custo: custoGravado, em: custoGravadoEm }
    if (getFieldState('custo').isDirty) {
      // "A entrada de compra mudou o custo" so quando o valor mudou; a compra ao mesmo custo so
      // muda a origem, e o aviso continua o de "editado manualmente".
      if (custoGravado !== sincronizado.custo) {
        setCustoDaCompraNaoAplicado(custoDaCompra)
      }
    } else {
      resetField('custo', { defaultValue: numeroParaTexto(custoGravado) })
      setCustoDaCompraNaoAplicado(null)
    }
  }, [custoGravado, custoGravadoEm, custoDaCompra, getFieldState, resetField])

  // Produto novo ja vem com UN (a unidade mais comum), se existir e estiver ativa.
  // Vira o valor padrao do campo: escolher a UN sozinha nao conta como alteracao.
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

  // Foco pedido ao abrir o cadastro, ao salvar com erro ou ao cadastrar outro:
  // rola ate o campo e foca nele. Campos que aparecem com o erro (ex.: niveis
  // com o controle desligado, bloco de promocao) montam num render seguinte:
  // por isso o foco vai para a fila. Sem o campo, foca o titulo da secao.
  useEffect(() => {
    if (!campoParaFocar) {
      return
    }
    const timer = window.setTimeout(() => {
      const campo = document.getElementById(idDoCampo(campoParaFocar))
      if (campo) {
        // O codigo de barras barrado fica selecionado: o proximo bip o substitui.
        rolarEFocarCampo(campo, { selecionar: /(^|\.)codigoPendente$/.test(campoParaFocar) })
      } else {
        rolarAteASecao(secaoDoCampo(campoParaFocar))
      }
      setCampoParaFocar(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [campoParaFocar])

  /** Atalho: rola ate a secao e foca o titulo dela (o spy fica travado ate a rolagem terminar). */
  const irParaSecao = (secao: SecaoProduto) => {
    marcarSecao(secao)
    rolarAteASecao(secao)
  }

  /** Leva ao campo com erro: marca a secao dele no atalho e pede o foco. */
  const irParaCampo = (destino: DestinoDoErro) => {
    marcarSecao(destino.secao)
    setCampoParaFocar(destino.campo)
  }

  // Siglas conhecidas (lista + unidades do produto e das embalagens) para "por UN" e os rotulos.
  const siglaPorId = useMemo(() => {
    const mapa = new Map((unidades ?? []).map((unidade) => [unidade.id, unidade.sigla]))
    for (const resumo of [produto?.unidade, ...(produto?.embalagens ?? []).map((embalagem) => embalagem.unidade)]) {
      if (resumo && !mapa.has(resumo.id)) {
        mapa.set(resumo.id, resumo.sigla)
      }
    }
    return mapa
  }, [unidades, produto])
  const formatosGravados = useMemo(() => formatosDoProduto(produto), [produto])

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
      // Na edicao, os fornecedores so vao se mudaram na tela: ausentes, o backend mantem os gravados
      // (uma compra registrada em outra aba nao e desfeita por um salvamento que nao mexeu neles).
      const fornecedoresAlterados =
        getFieldState('fornecedores').isDirty || getFieldState('fornecedorUltimaCompraId').isDirty
      const request = montarRequest(valores, { novo: !produto, incluirFornecedores: !produto || fornecedoresAlterados })
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
        setMensagemSucesso(mensagemCadastradoOutro(salvo))
        // O proximo produto comeca pelo Nome, no topo da tela (spec B2 §4).
        irParaCampo({ secao: 'geral', campo: 'nome' })
        return
      }
      setSaida({
        para: voltarPara,
        estado: { sucesso: `Produto "${salvo.nome}" ${produto ? 'atualizado' : 'cadastrado'} com sucesso.` },
      })
    },
    onError: async (erro) => {
      setMensagemSucesso(null)
      const { erros: errosDeCampo, restantes } = errosDeCampoDoServidor(erro, getValues('embalagens').length)
      if (errosDeCampo.length > 0) {
        // Cada erro vai para o seu campo (com a contagem no atalho da secao); a
        // pagina rola ate o primeiro, na ordem das secoes.
        for (const { campo, caminho, mensagem } of errosDeCampo) {
          // Erro num campo de promocao/atacado: o bloco abre para o erro aparecer.
          const interruptor = interruptorDoCampo(campo)
          if (interruptor && !getValues(interruptor)) {
            setValue(interruptor, true)
          }
          setError(caminho as FieldPath<ProdutoFormValues>, { type: 'server', message: mensagem })
        }
        const campos = [...new Set(errosDeCampo.map(({ campo }) => campo))]
        const destino = primeiroCampoComErro((campo) => campos.includes(campo))
        const resumo = mensagemErrosNosCampos(campos, errosDeCampo.length)
        setErroSalvar({ mensagem: [...restantes, resumo].join(' '), campos: restantes.length > 0 ? [] : campos })
        if (destino) {
          const caminhos = errosDeCampo.filter(({ campo }) => campo === destino.campo).map(({ caminho }) => caminho)
          irParaCampo({
            secao: destino.secao,
            campo: destino.campo === 'embalagens' ? primeiroCaminhoDeEmbalagem(caminhos) : destino.campo,
          })
        }
      } else {
        setErroSalvar({ mensagem: mensagemErroSalvar(erro), campos: [] })
      }
      // 400/404: a unidade, a categoria ou a marca escolhida pode ter sido inativada ou
      // removida; recarrega as listas para o select e os seletores sairem dela.
      if (erro instanceof HttpError && (erro.status === 400 || erro.status === 404)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: TODAS_UNIDADES_QUERY_KEY }),
          queryClient.invalidateQueries({ queryKey: TODAS_CATEGORIAS_QUERY_KEY }),
          queryClient.invalidateQueries({ queryKey: TODAS_MARCAS_QUERY_KEY }),
          // Um fornecedor escolhido pode ter sido inativado ou excluido.
          queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY }),
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

  /** Erro de validacao: rola ate o primeiro campo com erro (na ordem das secoes) e foca nele. */
  const aoInvalidar = (erros: FieldErrors<ProdutoFormValues>) => {
    const destino = primeiroCampoComErro((campo) => erros[campo] !== undefined)
    if (destino) {
      // Nas embalagens, o primeiro campo com erro da primeira embalagem com erro.
      const campo =
        destino.campo === 'embalagens'
          ? (caminhosComErroNasEmbalagens(erros.embalagens)[0] ?? 'embalagens')
          : destino.campo
      irParaCampo({ secao: destino.secao, campo })
    }
  }

  /** Onde um codigo esta fora da lista em edicao ('unidade' ou o indice da embalagem), com os valores de agora. */
  const localizadorFora = (lista: 'unidade' | number) => localizarCodigoForaDaLista(getValues(), lista, siglaPorId)

  /**
   * Codigo digitado e nao adicionado (na unidade ou numa embalagem): ao salvar,
   * entra na lista com as mesmas regras do "Adicionar". Se for barrado, nada e
   * salvo e o erro aparece no campo, na secao dele.
   */
  const incorporarCodigoPendente = (): boolean => {
    const barrar = (
      caminho: FieldPath<ProdutoFormValues>,
      secao: SecaoProduto,
      motivo: string,
      campos: (keyof ProdutoFormValues)[],
    ) => {
      setError(caminho, { type: 'manual', message: motivo })
      setMensagemSucesso(null)
      setErroSalvar({ mensagem: mensagemErroNaSecao(secao), campos })
      irParaCampo({ secao, campo: caminho })
      return false
    }
    const pendente = getValues('codigoPendente')
    const resultado = avaliarNovoCodigo(
      pendente,
      getValues('codigosBarras'),
      formatosGravados,
      undefined,
      localizadorFora('unidade'),
    )
    if (resultado.tipo === 'bloqueado') {
      return barrar('codigoPendente', 'codigos', resultado.motivo, ['codigoPendente', 'codigosBarras'])
    }
    if (resultado.tipo === 'aceito') {
      setValue('codigosBarras', resultado.lista, { shouldDirty: true })
    }
    if (pendente !== '') {
      setValue('codigoPendente', '')
    }
    const embalagens = getValues('embalagens')
    for (let indice = 0; indice < embalagens.length; indice++) {
      const doPendente = embalagens[indice].codigoPendente
      const daEmbalagem = avaliarNovoCodigo(
        doPendente,
        embalagens[indice].codigosBarras,
        formatosGravados,
        MAXIMO_CODIGOS_POR_EMBALAGEM,
        localizadorFora(indice),
      )
      if (daEmbalagem.tipo === 'bloqueado') {
        return barrar(`embalagens.${indice}.codigoPendente`, 'embalagens', daEmbalagem.motivo, ['embalagens'])
      }
      if (daEmbalagem.tipo === 'aceito') {
        setValue(`embalagens.${indice}.codigosBarras`, daEmbalagem.lista, { shouldDirty: true })
      }
      if (doPendente !== '') {
        setValue(`embalagens.${indice}.codigoPendente`, '')
      }
    }
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
        // Regras que dependem de outros cadastros, checadas aqui com eles carregados: fracao no atacado
        // e no estoque inicial (unidade escolhida) e o tamanho do codigo na etiqueta da balanca.
        const errosNoEnvio: FieldErrors<ProdutoFormValues> = {}
        const mensagens: Record<(typeof CAMPOS_COM_ERRO_NO_ENVIO)[number], string | null> = {
          quantidadeMinimaAtacado: erroFracaoAtacado(valores, unidadesConhecidas),
          estoqueInicial: erroFracaoEstoqueInicial(valores, unidadesConhecidas),
          codigo: erroCodigoNaEtiqueta(valores, digitosCodigoNaEtiqueta),
        }
        for (const campo of CAMPOS_COM_ERRO_NO_ENVIO) {
          const mensagem = mensagens[campo]
          if (mensagem) {
            errosNoEnvio[campo] = { type: 'manual', message: mensagem }
            setError(campo, { type: 'manual', message: mensagem })
          }
        }
        if (Object.keys(errosNoEnvio).length > 0) {
          enviandoRef.current = false
          aoInvalidar(errosNoEnvio)
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
   * Ctrl+Enter (Cmd+Enter no Mac) salva de qualquer campo; no cadastro novo,
   * Ctrl+Shift+Enter salva e abre outro. No cadastro novo, Enter sozinho num
   * campo de texto nao envia (so o botao): o leitor de codigo de barras termina
   * com Enter e o cadastro em sequencia nao pode sair antes da hora. Na edicao,
   * Enter segue o padrao do navegador.
   */
  const aoTeclarNoFormulario = (event: KeyboardEvent<HTMLFormElement>) => {
    const alvo = event.target
    // So o que esta no DOM do formulario: paineis em portal (ex.: o de categoria) ficam de fora.
    if (event.key !== 'Enter' || !(alvo instanceof Node) || !event.currentTarget.contains(alvo)) {
      return
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      enviar(event.shiftKey && modoNovo ? 'cadastrarOutro' : 'voltar')
      return
    }
    if (modoNovo && alvo instanceof HTMLInputElement) {
      event.preventDefault()
    }
  }

  const acaoEmAndamento = salvarMutation.isPending ? salvarMutation.variables?.acao : undefined
  const desabilitado = salvando || somenteLeitura

  /**
   * Campos com erro na secao; o texto pendente e a lista de codigos de barras
   * contam como um so. Nas embalagens, cada campo com erro de cada embalagem.
   */
  const errosDaSecao = (secao: SecaoProduto) => {
    if (secao === 'embalagens') {
      return caminhosComErroNasEmbalagens(errors.embalagens).length
    }
    const comErro = CAMPOS_POR_SECAO[secao].filter((campo) => errors[campo] !== undefined)
    const codigoDeBarrasEmDobro = comErro.includes('codigoPendente') && comErro.includes('codigosBarras')
    return comErro.length - (codigoDeBarrasEmDobro ? 1 : 0)
  }

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
          {!somenteLeitura && (
            <p className="text-sm text-muted-foreground">
              Campos com <span aria-hidden="true">*</span>
              <span className="sr-only">asterisco</span> são obrigatórios; os demais são opcionais.
            </p>
          )}

          {/* Contêiner fixo: os atalhos e os avisos (sucesso, erro ao salvar) ficam visiveis com a pagina rolada. */}
          <div
            id={ID_BARRA_FIXA}
            className="sticky top-0 z-20 -mx-1 space-y-2 bg-background/95 px-1 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/85"
          >
            <AtalhosDasSecoes
              secoes={secoesVisiveis}
              ativa={secaoAtiva}
              errosDaSecao={errosDaSecao}
              aoEscolher={irParaSecao}
            />
            <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} fixo={false} />
            {erroSalvar && <ErroInline mensagem={erroSalvar.mensagem} />}
          </div>

          <SecaoDaPagina
            secao="geral"
            acessorio={
              produto && (
                <p className="text-sm font-medium text-muted-foreground tabular-nums">
                  <span className="sr-only">Número do produto: </span>
                  {`Nº ${produto.numero}`}
                </p>
              )
            }
          >
            <SecaoGeral
              produto={produto}
              unidadesQuery={unidadesQuery}
              categoriasQuery={categoriasQuery}
              marcasQuery={marcasQuery}
              siglaPorId={siglaPorId}
              desabilitado={desabilitado}
              somenteLeitura={somenteLeitura}
              aoAlterarCampo={aoAlterarCampo}
            />
          </SecaoDaPagina>
          <SecaoDaPagina secao="codigos">
            <SecaoCodigos
              produto={produto}
              desabilitado={desabilitado}
              somenteLeitura={somenteLeitura}
              aoAlterarCampo={aoAlterarCampo}
              aoIrParaEmbalagens={() => irParaSecao('embalagens')}
              siglaPorId={siglaPorId}
            />
          </SecaoDaPagina>
          <SecaoDaPagina secao="precos">
            <SecaoPrecos
              produto={produto}
              custoDaCompraNaoAplicado={custoDaCompraNaoAplicado}
              siglaPorId={siglaPorId}
              desabilitado={desabilitado}
              aoAlterarCampo={aoAlterarCampo}
            />
          </SecaoDaPagina>
          <SecaoDaPagina secao="embalagens">
            <SecaoEmbalagens
              produto={produto}
              unidadesQuery={unidadesQuery}
              siglaPorId={siglaPorId}
              desabilitado={desabilitado}
              somenteLeitura={somenteLeitura}
              aoAlterarCampo={aoAlterarCampo}
            />
          </SecaoDaPagina>
          <SecaoDaPagina secao="estoque">
            <SecaoEstoque
              produto={produto}
              siglaPorId={siglaPorId}
              desabilitado={desabilitado}
              somenteLeitura={somenteLeitura}
              aoAlterarCampo={aoAlterarCampo}
              aoAjustarEstoque={(mensagem, fornecedorDaCompra) => {
                setErroGeral(null)
                setMensagemSucesso(mensagem)
                if (fornecedorDaCompra) {
                  registrarCompra(fornecedorDaCompra)
                }
              }}
            />
          </SecaoDaPagina>
          {produto && (
            <SecaoDaPagina secao="historico">
              <SecaoHistorico
                produtoId={produto.id}
                sigla={produto.unidade.sigla}
                controlaEstoque={produto.controlaEstoque}
              />
            </SecaoDaPagina>
          )}

          {!somenteLeitura && (
            <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-background py-3 sm:flex-row sm:items-center sm:justify-end">
              <p className="hidden text-xs text-muted-foreground sm:mr-auto sm:block">
                <Tecla>{TECLA_ATALHO}</Tecla> + <Tecla>Enter</Tecla> salva
                {modoNovo && (
                  <>
                    {' · '}
                    <Tecla>{TECLA_ATALHO}</Tecla> + <Tecla>Shift</Tecla> + <Tecla>Enter</Tecla> salva e abre outro
                  </>
                )}
              </p>
              <Button asChild variant="outline">
                <Link to={voltarPara}>Cancelar</Link>
              </Button>
              {modoNovo && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => enviar('cadastrarOutro')}
                  disabled={salvando}
                  aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
                >
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
              {/* Excluir com saldo so e possivel quando o unico movimento e o estoque inicial (spec 4.7). */}
              {produto.estoqueAtual > 0 && (
                <p>{`O estoque inicial de ${formatarQuantidade(produto.estoqueAtual, produto.unidade.sigla)} também será apagado.`}</p>
              )}
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
