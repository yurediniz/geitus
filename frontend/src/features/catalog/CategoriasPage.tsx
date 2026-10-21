import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronsDownUp, ChevronsUpDown, FolderTree, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArvoreCategorias, type EdicaoInline } from '@/features/catalog/ArvoreCategorias'
import {
  CATEGORIAS_QUERY_KEY,
  PRODUTOS_QUERY_KEY,
  TODAS_CATEGORIAS_QUERY_KEY,
  mensagemErroCatalogo,
} from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { FormularioNomeCategoria } from '@/features/catalog/FormularioNomeCategoria'
import { MoverCategoriaDialog } from '@/features/catalog/MoverCategoriaDialog'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { useAuth } from '@/hooks/useAuth'
import { montarArvore, type NoCategoria } from '@/lib/arvoreCategorias'
import { HttpError } from '@/services/httpClient'
import {
  atualizarCategoria,
  cadastrarCategoria,
  excluirCategoria,
  inativarCategoria,
  listarCategorias,
  reativarCategoria,
} from '@/services/categoriaService'
import type { Categoria } from '@/types/catalogo'

const LISTA_QUERY_KEY = TODAS_CATEGORIAS_QUERY_KEY

const TEXTOS_ERRO = {
  naoEncontrado: 'Esta categoria não existe mais. A lista foi atualizada.',
  semPermissao: 'Somente administradores podem gerenciar categorias.',
}

/** O que o formulario de nome aberto vai fazer ao salvar. */
type AcaoNome =
  | { tipo: 'raiz' }
  | { tipo: 'subcategoria'; pai: Categoria }
  | { tipo: 'renomear'; categoria: Categoria }

function idsComFilhos(nos: NoCategoria[], resultado = new Set<string>()): Set<string> {
  for (const no of nos) {
    if (no.filhos.length > 0) {
      resultado.add(no.categoria.id)
      idsComFilhos(no.filhos, resultado)
    }
  }
  return resultado
}

/** Ids do no informado e de seus ancestrais (para deixar o ramo aberto). */
function idsDoRamo(categorias: Categoria[], id: string | null): string[] {
  const porId = new Map(categorias.map((categoria) => [categoria.id, categoria]))
  const ramo: string[] = []
  let atual = id ? porId.get(id) : undefined
  while (atual && !ramo.includes(atual.id)) {
    ramo.push(atual.id)
    atual = atual.parentId ? porId.get(atual.parentId) : undefined
  }
  return ramo
}

/** Tela de Categorias em arvore (/produtos/categorias). */
export function CategoriasPage() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const podeGerenciar = usuario?.perfil === 'ADMIN'
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set())
  const [acaoNome, setAcaoNome] = useState<AcaoNome | null>(null)
  const [erroNome, setErroNome] = useState<string | null>(null)
  const [categoriaMovendo, setCategoriaMovendo] = useState<Categoria | null>(null)
  const [erroMover, setErroMover] = useState<string | null>(null)
  const [categoriaExcluindo, setCategoriaExcluindo] = useState<Categoria | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<string | null>(null)

  const { data: categorias = [], isPending, isError, refetch } = useQuery<Categoria[]>({
    queryKey: LISTA_QUERY_KEY,
    queryFn: () => listarCategorias(),
  })

  const arvore = useMemo(() => montarArvore(categorias), [categorias])
  const expansiveis = useMemo(() => idsComFilhos(arvore), [arvore])

  const expandir = (ids: string[]) => {
    setExpandidos((anteriores) => new Set([...anteriores, ...ids]))
  }

  const alterarExpansao = (id: string, abrir: boolean) => {
    setExpandidos((anteriores) => {
      const proximos = new Set(anteriores)
      if (abrir) {
        proximos.add(id)
      } else {
        proximos.delete(id)
      }
      return proximos
    })
  }

  const atualizarCaches = async (incluirProdutos: boolean) => {
    await queryClient.invalidateQueries({ queryKey: CATEGORIAS_QUERY_KEY })
    if (incluirProdutos) {
      // O produto exibe o caminho da categoria: renomear/mover o desatualiza.
      await queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
    }
  }

  const mensagemDeErro = async (erro: unknown, padrao: string) => {
    if (erro instanceof HttpError && erro.status === 404) {
      await queryClient.invalidateQueries({ queryKey: CATEGORIAS_QUERY_KEY })
    }
    return mensagemErroCatalogo(erro, { ...TEXTOS_ERRO, padrao })
  }

  const salvarNomeMutation = useMutation<Categoria, unknown, { acao: AcaoNome; nome: string }>({
    mutationFn: ({ acao, nome }) => {
      if (acao.tipo === 'renomear') {
        return atualizarCategoria(acao.categoria.id, { nome, parentId: acao.categoria.parentId })
      }
      return cadastrarCategoria({ nome, parentId: acao.tipo === 'subcategoria' ? acao.pai.id : null })
    },
    onSuccess: async (categoria, { acao }) => {
      await atualizarCaches(acao.tipo === 'renomear')
      if (acao.tipo === 'subcategoria') {
        expandir([acao.pai.id])
        setMensagemSucesso(`Subcategoria "${categoria.nome}" criada em "${acao.pai.caminho}".`)
      } else if (acao.tipo === 'renomear') {
        setMensagemSucesso(`Categoria renomeada para "${categoria.nome}".`)
      } else {
        setMensagemSucesso(`Categoria "${categoria.nome}" criada.`)
      }
      setAcaoNome(null)
      setErroNome(null)
    },
    onError: async (erro) => {
      setErroNome(await mensagemDeErro(erro, 'Não foi possível salvar a categoria. Tente novamente.'))
    },
  })

  const moverMutation = useMutation<Categoria, unknown, { categoria: Categoria; parentId: string | null }>({
    mutationFn: ({ categoria, parentId }) => atualizarCategoria(categoria.id, { nome: categoria.nome, parentId }),
    onSuccess: async (movida, { parentId }) => {
      // Abre o caminho ate o novo pai para a categoria movida continuar a vista.
      expandir(idsDoRamo(categorias, parentId))
      await atualizarCaches(true)
      const destino = categorias.find((categoria) => categoria.id === parentId)
      setMensagemSucesso(
        destino
          ? `"${movida.nome}" agora está em "${destino.caminho}".`
          : `"${movida.nome}" agora é uma categoria raiz.`,
      )
      setCategoriaMovendo(null)
      setErroMover(null)
    },
    onError: async (erro) => {
      // 400 (ciclo) e 409 (nome repetido no destino) ficam no dialogo para escolher outro destino.
      setErroMover(await mensagemDeErro(erro, 'Não foi possível mover a categoria. Tente novamente.'))
    },
  })

  const statusMutation = useMutation<Categoria, unknown, Categoria>({
    mutationFn: (categoria) =>
      categoria.ativo ? inativarCategoria(categoria.id) : reativarCategoria(categoria.id),
    onMutate: (categoria) => setAcaoStatusId(categoria.id),
    onSuccess: async (atualizada) => {
      await atualizarCaches(false)
      setMensagemSucesso(
        atualizada.ativo
          ? `Categoria "${atualizada.nome}" reativada.`
          : `Categoria "${atualizada.nome}" inativada. Ela e suas subcategorias deixam de aparecer no cadastro de produtos.`,
      )
    },
    onError: async (erro) => {
      setErroGeral(await mensagemDeErro(erro, 'Não foi possível alterar o status da categoria. Tente novamente.'))
    },
    onSettled: () => setAcaoStatusId(null),
  })

  const excluirMutation = useMutation<void, unknown, Categoria>({
    mutationFn: (categoria) => excluirCategoria(categoria.id),
    onSuccess: async (_, categoria) => {
      await atualizarCaches(false)
      setMensagemSucesso(`Categoria "${categoria.nome}" excluída.`)
    },
    onError: async (erro) => {
      // 409: o backend diz quantas subcategorias/produtos impedem e sugere inativar.
      setErroGeral(await mensagemDeErro(erro, 'Não foi possível excluir a categoria. Tente novamente.'))
    },
    onSettled: () => setCategoriaExcluindo(null),
  })

  const limparFeedback = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
  }

  const abrirAcaoNome = (acao: AcaoNome) => {
    limparFeedback()
    setErroNome(null)
    setAcaoNome(acao)
    if (acao.tipo === 'subcategoria') {
      expandir([acao.pai.id])
    }
  }

  const cancelarAcaoNome = () => {
    setAcaoNome(null)
    setErroNome(null)
  }

  const salvarNome = (nome: string) => {
    if (!acaoNome) {
      return
    }
    limparFeedback()
    setErroNome(null)
    salvarNomeMutation.mutate({ acao: acaoNome, nome })
  }

  const edicaoInline: EdicaoInline | null =
    acaoNome?.tipo === 'subcategoria'
      ? { tipo: 'subcategoria', categoriaId: acaoNome.pai.id }
      : acaoNome?.tipo === 'renomear'
        ? { tipo: 'renomear', categoriaId: acaoNome.categoria.id }
        : null

  return (
    <div className="space-y-6">
      <CatalogoNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Organize os produtos em categorias e subcategorias, como Ração › Úmida › Sachê.
          </p>
        </div>

        {podeGerenciar && (
          <Button type="button" onClick={() => abrirAcaoNome({ tipo: 'raiz' })}>
            <Plus className="h-4 w-4" />
            Nova categoria
          </Button>
        )}
      </div>

      {!podeGerenciar && (
        <AvisoSomenteLeitura texto="Somente administradores podem gerenciar categorias. Você está no modo leitura." />
      )}

      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} />

      {podeGerenciar && acaoNome?.tipo === 'raiz' && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Nova categoria</CardTitle>
            <CardDescription>Ela fica no primeiro nível; depois você pode adicionar subcategorias.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioNomeCategoria
              rotulo="Nome da nova categoria"
              placeholder="Ex.: Mercearia"
              textoSalvar="Criar categoria"
              salvando={salvarNomeMutation.isPending}
              erro={erroNome}
              onSalvar={salvarNome}
              onCancelar={cancelarAcaoNome}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Árvore de categorias</CardTitle>
          <CardDescription>
            Categorias inativas e seus ramos continuam nos produtos que já os usam, mas não aparecem em novos cadastros.
          </CardDescription>
          {expansiveis.size > 0 && (
            <CardAction className="flex flex-wrap gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpandidos(new Set(expansiveis))}>
                <ChevronsUpDown className="h-4 w-4" />
                Expandir tudo
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpandidos(new Set())}>
                <ChevronsDownUp className="h-4 w-4" />
                Recolher tudo
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando categorias...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar as categorias.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && categorias.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <FolderTree className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Nenhuma categoria ainda.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {podeGerenciar
                    ? 'Crie a primeira categoria, como Mercearia ou Ração, e organize os produtos por ela.'
                    : 'Peça a um administrador para criar as categorias dos produtos.'}
                </p>
                {podeGerenciar && acaoNome?.tipo !== 'raiz' && (
                  <Button type="button" size="sm" className="mt-3" onClick={() => abrirAcaoNome({ tipo: 'raiz' })}>
                    <Plus className="h-4 w-4" />
                    Criar categoria
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isPending && !isError && categorias.length > 0 && (
            <ArvoreCategorias
              arvore={arvore}
              expandidos={expandidos}
              onAlterarExpansao={alterarExpansao}
              podeGerenciar={podeGerenciar}
              edicao={edicaoInline}
              salvandoEdicao={salvarNomeMutation.isPending}
              erroEdicao={erroNome}
              onSalvarEdicao={salvarNome}
              onCancelarEdicao={cancelarAcaoNome}
              acaoStatusId={acaoStatusId}
              acoes={{
                onAdicionarSubcategoria: (pai) => abrirAcaoNome({ tipo: 'subcategoria', pai }),
                onRenomear: (categoria) => abrirAcaoNome({ tipo: 'renomear', categoria }),
                onMover: (categoria) => {
                  limparFeedback()
                  setErroMover(null)
                  setCategoriaMovendo(categoria)
                },
                onAlterarStatus: (categoria) => {
                  limparFeedback()
                  statusMutation.mutate(categoria)
                },
                onExcluir: (categoria) => {
                  limparFeedback()
                  setCategoriaExcluindo(categoria)
                },
              }}
            />
          )}
        </CardContent>
      </Card>

      <MoverCategoriaDialog
        categoria={categoriaMovendo}
        categorias={categorias}
        salvando={moverMutation.isPending}
        erro={erroMover}
        onConfirmar={(parentId) =>
          categoriaMovendo && moverMutation.mutate({ categoria: categoriaMovendo, parentId })
        }
        onCancelar={() => {
          setCategoriaMovendo(null)
          setErroMover(null)
        }}
      />

      <ConfirmarExclusaoDialog
        aberto={categoriaExcluindo !== null}
        titulo={`Excluir a categoria "${categoriaExcluindo?.nome ?? ''}"?`}
        descricao="Só é possível excluir categorias sem subcategorias e sem produtos. Esta ação não pode ser desfeita."
        excluindo={excluirMutation.isPending}
        onConfirmar={() => categoriaExcluindo && excluirMutation.mutate(categoriaExcluindo)}
        onCancelar={() => setCategoriaExcluindo(null)}
      />
    </div>
  )
}
