import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FormProvider, useForm, type FieldErrors, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FORNECEDORES_QUERY_KEY, TODAS_MARCAS_QUERY_KEY, ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { AvisoSomenteLeitura, ErroInline, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { sucessoDaNavegacao } from '@/features/products/navegacaoProdutos'
import { rolarEFocarCampo } from '@/features/products/secoes/rolagem'
import { SeloStatus } from '@/features/products/SeloStatus'
import {
  CAMPOS_NA_ORDEM,
  campoDoErroDoServidor,
  fornecedorSchema,
  montarRequest,
  valoresDoFornecedor,
  valoresIniciais,
  type FornecedorFormValues,
} from '@/features/suppliers/fornecedorFormulario'
import { chaveDoFornecedor } from '@/features/suppliers/fornecedorQuery'
import {
  destinoDaListaDeFornecedores,
  rotaDoFornecedor,
  type EstadoParaFornecedor,
} from '@/features/suppliers/navegacaoFornecedores'
import { ProdutosDoFornecedor } from '@/features/suppliers/ProdutosDoFornecedor'
import { SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import { SecaoContato } from '@/features/suppliers/secoes/SecaoContato'
import { SecaoDados } from '@/features/suppliers/secoes/SecaoDados'
import { SecaoEndereco } from '@/features/suppliers/secoes/SecaoEndereco'
import { SecaoMarcas } from '@/features/suppliers/secoes/SecaoMarcas'
import { SecaoRepresentantes } from '@/features/suppliers/secoes/SecaoRepresentantes'
import { useAuth } from '@/hooks/useAuth'
import { useAvisoAlteracoesNaoSalvas } from '@/hooks/useAvisoAlteracoesNaoSalvas'
import {
  atualizarFornecedor,
  buscarFornecedor,
  cadastrarFornecedor,
  excluirFornecedor,
  inativarFornecedor,
  reativarFornecedor,
} from '@/services/fornecedorService'
import { HttpError } from '@/services/httpClient'
import { listarMarcas } from '@/services/marcaService'
import type { Marca } from '@/types/catalogo'
import type { Fornecedor } from '@/types/fornecedor'

const ID_FORMULARIO = 'formulario-fornecedor'
const ID_TITULO = 'fornecedor-titulo'
const MENSAGEM_SALVO = 'Fornecedor salvo.'

/** Tecla do atalho de salvar (Cmd no Mac, Ctrl nos demais). */
const TECLA_ATALHO = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'

/** Mensagem amigavel (pt-BR) para a falha ao salvar, sem vazar detalhe interno. */
function mensagemErroSalvar(erro: unknown): string {
  if (erro instanceof HttpError) {
    if ((erro.status === 400 || erro.status === 409) && !ehMensagemGenerica(erro.message)) {
      return erro.message
    }
    if (erro.status === 400) {
      return 'Revise os dados do fornecedor e tente novamente.'
    }
    if (erro.status === 409) {
      return 'Já existe um fornecedor com este documento nesta empresa.'
    }
    if (erro.status === 403) {
      return 'Somente administradores podem cadastrar ou alterar fornecedores.'
    }
    if (erro.status === 404) {
      return 'O fornecedor ou uma marca escolhida não existe mais. Atualize a tela e tente novamente.'
    }
  }
  return 'Não foi possível salvar o fornecedor. Tente novamente.'
}

function mensagemErroExcluir(erro: unknown): string {
  if (erro instanceof HttpError) {
    if (erro.status === 409) {
      return ehMensagemGenerica(erro.message)
        ? 'Não é possível excluir: o fornecedor tem produtos ligados ou entradas registradas. Inative-o.'
        : erro.message
    }
    if (erro.status === 403) {
      return 'Somente administradores podem excluir fornecedores.'
    }
    if (erro.status === 404) {
      return 'Este fornecedor não existe mais ou já foi excluído.'
    }
  }
  return 'Não foi possível excluir o fornecedor. Tente novamente.'
}

/** Erros do backend por campo: o caminho no formulario e a mensagem; os sem campo voltam em `restantes`. */
function errosDoServidor(erro: unknown): { porCampo: [string, string][]; restantes: string[] } {
  if (!(erro instanceof HttpError) || !erro.campos) {
    return { porCampo: [], restantes: [] }
  }
  const porCampo: [string, string][] = []
  const restantes: string[] = []
  for (const [chave, mensagem] of Object.entries(erro.campos)) {
    const campo = campoDoErroDoServidor(chave)
    if (campo) {
      porCampo.push([campo, mensagem])
    } else {
      restantes.push(mensagem)
    }
  }
  return { porCampo, restantes }
}

/** Primeiro caminho com erro, na ordem da tela (nos representantes, o do primeiro com erro). */
function primeiroCaminhoComErro(erros: FieldErrors<FornecedorFormValues>): string | null {
  for (const campo of CAMPOS_NA_ORDEM) {
    const erro = erros[campo]
    if (!erro) {
      continue
    }
    if (campo === 'representantes' && Array.isArray(erro)) {
      const indice = erro.findIndex((item) => item !== undefined)
      if (indice >= 0) {
        const doItem = erro[indice] as Record<string, unknown>
        const sub = ['nome', 'telefone', 'email'].find((nome) => doItem[nome] !== undefined) ?? 'nome'
        return `representantes.${indice}.${sub}`
      }
    }
    return campo
  }
  return null
}

/** Leva o foco ao campo (ou a secao dele, se o campo nao estiver na tela). */
function focarCampo(caminho: string) {
  window.setTimeout(() => {
    const elemento = document.getElementById(caminho)
    if (elemento) {
      rolarEFocarCampo(elemento)
    }
  }, 0)
}

/**
 * Pagina do fornecedor (`/produtos/fornecedores/novo` e `/:id`, spec B5 §8.3).
 * A `key` remonta tudo ao trocar de fornecedor.
 */
export function FornecedorPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const voltarPara = destinoDaListaDeFornecedores(location.state)

  if (id === undefined) {
    if (somenteLeitura) {
      return (
        <EstruturaPagina titulo="Novo fornecedor" voltarPara={voltarPara}>
          <AvisoSomenteLeitura texto="Somente administradores podem cadastrar fornecedores." />
        </EstruturaPagina>
      )
    }
    return <FormularioFornecedor key="novo" fornecedor={null} voltarPara={voltarPara} somenteLeitura={false} />
  }
  return <CarregamentoFornecedor key={id} id={id} voltarPara={voltarPara} somenteLeitura={somenteLeitura} />
}

interface EstruturaPaginaProps {
  titulo: string
  voltarPara: string
  ativo?: boolean
  acaoStatus?: ReactNode
  acoes?: ReactNode
  children: ReactNode
}

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
          Voltar para fornecedores
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1
            id={ID_TITULO}
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
          <p className="text-xs text-muted-foreground">
            Fornecedor inativo não aparece para escolha no produto nem na entrada por compra.
          </p>
        )}
      </header>
      {children}
    </div>
  )
}

function CarregamentoFornecedor({
  id,
  voltarPara,
  somenteLeitura,
}: {
  id: string
  voltarPara: string
  somenteLeitura: boolean
}) {
  const fornecedorQuery = useQuery<Fornecedor>({
    queryKey: chaveDoFornecedor(id),
    queryFn: () => buscarFornecedor(id),
  })

  if (
    !fornecedorQuery.isLoadingError &&
    (fornecedorQuery.data === undefined || !fornecedorQuery.isFetchedAfterMount)
  ) {
    return (
      <EstruturaPagina titulo="Fornecedor" voltarPara={voltarPara}>
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando fornecedor...
        </p>
      </EstruturaPagina>
    )
  }

  if (fornecedorQuery.data === undefined) {
    const erro = fornecedorQuery.error
    const naoEncontrado = erro instanceof HttpError && (erro.status === 404 || erro.status === 400)
    return (
      <EstruturaPagina titulo="Fornecedor" voltarPara={voltarPara}>
        <div className="max-w-2xl space-y-3">
          <ErroInline
            mensagem={
              naoEncontrado ? 'Este fornecedor não existe ou foi excluído.' : 'Não foi possível carregar o fornecedor.'
            }
          />
          {!naoEncontrado && (
            <Button variant="outline" size="sm" onClick={() => fornecedorQuery.refetch()}>
              Tentar novamente
            </Button>
          )}
        </div>
      </EstruturaPagina>
    )
  }

  return (
    <FormularioFornecedor fornecedor={fornecedorQuery.data} voltarPara={voltarPara} somenteLeitura={somenteLeitura} />
  )
}

interface FormularioFornecedorProps {
  /** Fornecedor em edicao; null no cadastro. Os valores iniciais sao lidos so na montagem. */
  fornecedor: Fornecedor | null
  voltarPara: string
  somenteLeitura: boolean
}

/** Para onde ir depois de salvar ou excluir (navega no render seguinte, com o aviso de alteracoes desligado). */
interface Saida {
  para: string
  estado: EstadoParaFornecedor & { sucesso?: string }
}

function FormularioFornecedor({ fornecedor, voltarPara, somenteLeitura }: FormularioFornecedorProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const modoNovo = fornecedor === null

  // Sucesso vindo do cadastro ("Fornecedor salvo." ao abrir o recem-criado): lido uma vez e retirado do historico.
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(() => sucessoDaNavegacao(location.state))
  const temSucessoNaNavegacao = sucessoDaNavegacao(location.state) !== null
  useEffect(() => {
    if (temSucessoNaNavegacao) {
      navigate(location.pathname, { replace: true, state: { voltarPara } })
    }
  }, [temSucessoNaNavegacao, navigate, location.pathname, voltarPara])
  // Fornecedor como gravado agora (salvar e inativar/reativar o atualizam; o formulario so le na montagem).
  const [fornecedorAtual, setFornecedorAtual] = useState<Fornecedor | null>(fornecedor)
  // O fornecedor recarregado (ex.: depois de ligar um produto, a contagem muda) passa a ser o atual.
  const [fornecedorRecebido, setFornecedorRecebido] = useState(fornecedor)
  if (fornecedor !== fornecedorRecebido) {
    setFornecedorRecebido(fornecedor)
    setFornecedorAtual(fornecedor)
  }
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  const [saida, setSaida] = useState<Saida | null>(null)

  const marcasQuery = useQuery<Marca[]>({
    queryKey: TODAS_MARCAS_QUERY_KEY,
    queryFn: () => listarMarcas(),
  })

  const form = useForm<FornecedorFormValues>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: fornecedor ? valoresDoFornecedor(fornecedor) : valoresIniciais(),
    shouldFocusError: false,
  })
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isDirty },
  } = form

  const { dialogo } = useAvisoAlteracoesNaoSalvas(
    isDirty && saida === null && !somenteLeitura,
    'Você alterou este fornecedor e ainda não salvou. Se sair agora, as alterações serão perdidas.',
  )

  useEffect(() => {
    if (saida) {
      navigate(saida.para, { state: saida.estado, replace: true })
    }
  }, [saida, navigate])

  const aoAlterarCampo = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
  }

  const salvarMutation = useMutation<Fornecedor, unknown, FornecedorFormValues>({
    mutationFn: (valores) => {
      const request = montarRequest(valores)
      return fornecedor ? atualizarFornecedor(fornecedor.id, request) : cadastrarFornecedor(request)
    },
    onSuccess: (salvo) => {
      queryClient.setQueryData(chaveDoFornecedor(salvo.id), salvo)
      void queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY, refetchType: 'none' })
      setErroSalvar(null)
      if (modoNovo) {
        // O fornecedor novo abre na edicao: os produtos que ele vende so podem ser ligados depois de salvo.
        setSaida({ para: rotaDoFornecedor(salvo.id), estado: { voltarPara, sucesso: MENSAGEM_SALVO } })
        return
      }
      setFornecedorAtual(salvo)
      reset(valoresDoFornecedor(salvo))
      setErroGeral(null)
      setMensagemSucesso(MENSAGEM_SALVO)
    },
    onError: (erro) => {
      setMensagemSucesso(null)
      const { porCampo, restantes } = errosDoServidor(erro)
      for (const [campo, mensagem] of porCampo) {
        setError(campo as FieldPath<FornecedorFormValues>, { type: 'server', message: mensagem })
      }
      if (porCampo.length > 0) {
        const resumo = 'O fornecedor não foi salvo. Confira os campos destacados.'
        setErroSalvar([...restantes, resumo].join(' '))
        const primeiro = CAMPOS_NA_ORDEM.flatMap((campo) =>
          porCampo.filter(([caminho]) => caminho.split('.')[0] === campo).map(([caminho]) => caminho),
        )[0]
        if (primeiro) {
          focarCampo(primeiro)
        }
      } else {
        // Mensagens do backend sem campo da tela (ex.: uma marca recusada) vao como vieram.
        setErroSalvar(restantes.length > 0 ? restantes.join(' ') : mensagemErroSalvar(erro))
      }
      if (erro instanceof HttpError && (erro.status === 400 || erro.status === 404)) {
        // A marca escolhida pode ter sido removida ou inativada por outra pessoa.
        void queryClient.invalidateQueries({ queryKey: TODAS_MARCAS_QUERY_KEY })
      }
    },
  })

  const statusMutation = useMutation<Fornecedor, unknown, Fornecedor>({
    mutationFn: (alvo) => (alvo.ativo ? inativarFornecedor(alvo.id) : reativarFornecedor(alvo.id)),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(chaveDoFornecedor(atualizado.id), atualizado)
      void queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY, refetchType: 'none' })
      setFornecedorAtual(atualizado)
      setErroGeral(null)
      setMensagemSucesso(atualizado.ativo ? 'Fornecedor reativado.' : 'Fornecedor inativado.')
    },
    onError: () => {
      setMensagemSucesso(null)
      setErroGeral('Não foi possível alterar o status do fornecedor. Tente novamente.')
    },
  })

  const excluirMutation = useMutation<void, unknown, Fornecedor>({
    mutationFn: (alvo) => excluirFornecedor(alvo.id),
    onSuccess: (_, alvo) => {
      void queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY, refetchType: 'none' })
      setConfirmandoExclusao(false)
      setSaida({ para: voltarPara, estado: { voltarPara, sucesso: `Fornecedor "${alvo.razaoSocial}" excluído.` } })
    },
    onError: (erro) => setErroExcluir(mensagemErroExcluir(erro)),
  })

  const salvando = salvarMutation.isPending || saida !== null
  const desabilitado = salvando || somenteLeitura

  const enviar = () => {
    if (salvando || somenteLeitura) {
      return
    }
    void handleSubmit(
      (valores) => {
        setErroSalvar(null)
        setMensagemSucesso(null)
        salvarMutation.mutate(valores)
      },
      (erros) => {
        const caminho = primeiroCaminhoComErro(erros)
        if (caminho) {
          focarCampo(caminho)
        }
      },
    )()
  }

  /** Ctrl+Enter (Cmd+Enter no Mac) salva de qualquer campo da pagina. */
  const aoTeclar = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      enviar()
    }
  }

  // Com produtos ligados, o backend recusaria: o dialogo ja abre bloqueado e oferece inativar.
  const comProdutosLigados = (fornecedorAtual?.quantidadeProdutos ?? 0) > 0
  const exclusaoBloqueada =
    comProdutosLigados ||
    (erroExcluir !== null && excluirMutation.error instanceof HttpError && excluirMutation.error.status === 409)

  return (
    <EstruturaPagina
      titulo={fornecedorAtual ? fornecedorAtual.razaoSocial : 'Novo fornecedor'}
      voltarPara={voltarPara}
      ativo={fornecedorAtual?.ativo}
      acaoStatus={
        fornecedorAtual &&
        !somenteLeitura && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={statusMutation.isPending || salvando}
            onClick={() => statusMutation.mutate(fornecedorAtual)}
          >
            {statusMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : fornecedorAtual.ativo ? (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            {fornecedorAtual.ativo ? 'Inativar' : 'Reativar'}
          </Button>
        )
      }
      acoes={
        fornecedorAtual &&
        !somenteLeitura && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={salvando}
            onClick={() => {
              excluirMutation.reset()
              setErroExcluir(null)
              setConfirmandoExclusao(true)
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Excluir
          </Button>
        )
      }
    >
      {somenteLeitura && (
        <AvisoSomenteLeitura texto="Somente administradores podem alterar fornecedores. Você está no modo leitura." />
      )}
      <div onKeyDown={aoTeclar} className="max-w-4xl space-y-4">
        {!somenteLeitura && (
          <p className="text-sm text-muted-foreground">
            Campos com <span aria-hidden="true">*</span>
            <span className="sr-only">asterisco</span> são obrigatórios; os demais são opcionais.
          </p>
        )}
        {(mensagemSucesso || erroGeral || erroSalvar) && (
          <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-background/95 px-1 py-2">
            <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} fixo={false} />
            {erroSalvar && <ErroInline mensagem={erroSalvar} />}
          </div>
        )}

        <FormProvider {...form}>
          <form
            id={ID_FORMULARIO}
            noValidate
            aria-label={fornecedorAtual ? `Editar ${fornecedorAtual.razaoSocial}` : 'Novo fornecedor'}
            onSubmit={(event) => {
              event.preventDefault()
              enviar()
            }}
            className="space-y-4"
          >
            <SecaoDados
              numero={fornecedorAtual?.numero ?? null}
              desabilitado={desabilitado}
              aoAlterarCampo={aoAlterarCampo}
            />
            <SecaoEndereco desabilitado={desabilitado} aoAlterarCampo={aoAlterarCampo} />
            <SecaoContato desabilitado={desabilitado} aoAlterarCampo={aoAlterarCampo} />
            <SecaoRepresentantes desabilitado={desabilitado} aoAlterarCampo={aoAlterarCampo} />
            <SecaoMarcas
              marcasQuery={marcasQuery}
              marcasGravadas={fornecedorAtual?.marcas ?? []}
              desabilitado={desabilitado}
              podeCriar={!somenteLeitura}
              aoAlterarCampo={aoAlterarCampo}
            />
          </form>
        </FormProvider>

        <SecaoDoFornecedor id="secao-produtos" titulo="Produtos que vende">
          {fornecedorAtual ? (
            <ProdutosDoFornecedor
              fornecedorId={fornecedorAtual.id}
              somenteLeitura={somenteLeitura}
              aoInformar={(feedback) => {
                if ('sucesso' in feedback) {
                  setErroGeral(null)
                  setMensagemSucesso(feedback.sucesso)
                } else {
                  setMensagemSucesso(null)
                  setErroGeral(feedback.erro)
                }
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Salve o fornecedor para adicionar os produtos.</p>
          )}
        </SecaoDoFornecedor>

        {!somenteLeitura && (
          <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t bg-background py-3 sm:flex-row sm:items-center sm:justify-end">
            <p className="hidden text-xs text-muted-foreground sm:mr-auto sm:block">
              <kbd className="rounded border bg-muted px-1 font-sans">{TECLA_ATALHO}</kbd> +{' '}
              <kbd className="rounded border bg-muted px-1 font-sans">Enter</kbd> salva
            </p>
            <Button asChild variant="outline">
              <Link to={voltarPara}>Cancelar</Link>
            </Button>
            <Button
              type="submit"
              form={ID_FORMULARIO}
              disabled={salvando}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              {salvarMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {salvarMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}
      </div>

      {fornecedorAtual && (
        <ConfirmarExclusaoDialog
          aberto={confirmandoExclusao}
          titulo={
            comProdutosLigados
              ? `Não é possível excluir "${fornecedorAtual.razaoSocial}"`
              : `Excluir ${fornecedorAtual.razaoSocial}?`
          }
          descricao={
            comProdutosLigados ? (
              <>
                <p>
                  {`Este fornecedor tem ${fornecedorAtual.quantidadeProdutos} produto(s) ligados. Inative-o para tirá-lo das escolhas; dá para reativar depois.`}
                </p>
                {!fornecedorAtual.ativo && <p>Ele já está inativo.</p>}
              </>
            ) : (
              <>
                <p>Esta ação não pode ser desfeita. Os representantes e as marcas ligadas saem junto.</p>
                {fornecedorAtual.ativo && (
                  <p>Se quiser apenas tirá-lo das escolhas, inative-o; dá para reativar depois.</p>
                )}
                {erroExcluir && <ErroInline mensagem={erroExcluir} />}
              </>
            )
          }
          excluindo={excluirMutation.isPending}
          onConfirmar={() => excluirMutation.mutate(fornecedorAtual)}
          onCancelar={() => {
            setConfirmandoExclusao(false)
            setErroExcluir(null)
          }}
          destinoFoco={(origem) => (origem?.isConnected ? origem : document.getElementById(ID_TITULO))}
          podeExcluir={!exclusaoBloqueada}
          alternativa={
            fornecedorAtual.ativo
              ? {
                  rotulo: 'Inativar',
                  icone: XCircle,
                  executando: statusMutation.isPending,
                  onExecutar: () =>
                    statusMutation.mutate(fornecedorAtual, { onSuccess: () => setConfirmandoExclusao(false) }),
                }
              : undefined
          }
        />
      )}

      {dialogo}
    </EstruturaPagina>
  )
}
