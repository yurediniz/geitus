import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronsDownUp, ChevronsUpDown, EyeOff, FolderTree, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArvoreDoCadastro,
  type ArvoreDoCadastroHandle,
  type EdicaoInline,
} from '@/features/catalog/ArvoreDoCadastro'
import type { ConfiguracaoDaArvore, TextosDaArvore } from '@/features/catalog/cadastrosEmArvore'
import { mensagemErroCatalogo } from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { FormularioNomeDaArvore } from '@/features/catalog/FormularioNomeDaArvore'
import { MoverNaArvoreDialog } from '@/features/catalog/MoverNaArvoreDialog'
import { comMaiuscula, descreverVinculos } from '@/features/catalog/textosCatalogo'
import type { DestinoFoco } from '@/features/catalog/useFocoDeOrigem'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { useAuth } from '@/hooks/useAuth'
import { montarArvore, type NoDaArvore } from '@/lib/arvoreCategorias'
import { HttpError } from '@/services/httpClient'
import type { ItemDaArvore } from '@/types/catalogo'

/** O que o formulario de nome aberto vai fazer ao salvar. */
type AcaoNome<T extends ItemDaArvore> =
  | { tipo: 'principal' }
  | { tipo: 'sub'; pai: T }
  | { tipo: 'renomear'; item: T }

function idsComFilhos<T extends ItemDaArvore>(nos: NoDaArvore<T>[], resultado = new Set<string>()): Set<string> {
  for (const no of nos) {
    if (no.filhos.length > 0) {
      resultado.add(no.item.id)
      idsComFilhos(no.filhos, resultado)
    }
  }
  return resultado
}

/** Ids do no informado e de seus ancestrais (para deixar o ramo aberto). */
function idsDoRamo(itens: readonly ItemDaArvore[], id: string | null): string[] {
  const porId = new Map(itens.map((item) => [item.id, item]))
  const ramo: string[] = []
  let atual = id ? porId.get(id) : undefined
  while (atual && !ramo.includes(atual.id)) {
    ramo.push(atual.id)
    atual = atual.parentId ? porId.get(atual.parentId) : undefined
  }
  return ramo
}

/** Para onde vai o foco quando um dialogo aberto a partir de um no fechar. */
interface FocoAposDialogo {
  itemId: string
  /** No visivel vizinho no momento em que o dialogo abriu (se o proprio sumir). */
  vizinhoId: string | null
  /** `true` apos mover: foca o proprio no na nova posicao, em vez do botao "Mais". */
  focarNo: boolean
}

interface PaginaDaArvoreProps<T extends ItemDaArvore> {
  configuracao: ConfiguracaoDaArvore<T>
}

/**
 * Tela de um cadastro em arvore do catalogo: Categorias (/produtos/categorias)
 * e Fabricantes e marcas (/produtos/marcas), com as mesmas regras e acoes.
 */
export function PaginaDaArvore<T extends ItemDaArvore>({ configuracao }: PaginaDaArvoreProps<T>) {
  const { textos, servico } = configuracao
  const singularMaiusculo = comMaiuscula(textos.singular)
  const textosErro = {
    naoEncontrado: `Esta ${textos.singular} não existe mais. A lista foi atualizada.`,
    semPermissao: `Somente administradores podem gerenciar ${textos.plural}.`,
  }

  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const podeGerenciar = usuario?.perfil === 'ADMIN'
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set())
  const [acaoNome, setAcaoNome] = useState<AcaoNome<T> | null>(null)
  const [erroNome, setErroNome] = useState<string | null>(null)
  const [itemMovendo, setItemMovendo] = useState<T | null>(null)
  const [erroMover, setErroMover] = useState<string | null>(null)
  const [itemExcluindo, setItemExcluindo] = useState<T | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<string | null>(null)
  // Muda a cada item criado: remonta o campo vazio e com foco para criar o proximo.
  const [chaveCriacao, setChaveCriacao] = useState(0)
  const arvoreRef = useRef<ArvoreDoCadastroHandle>(null)
  const tituloArvoreRef = useRef<HTMLDivElement>(null)
  const botaoNovaRef = useRef<HTMLButtonElement>(null)
  const focoAposDialogoRef = useRef<FocoAposDialogo | null>(null)

  const { data: itens = [], isPending, isError, refetch } = useQuery<T[]>({
    queryKey: configuracao.chaveDaLista,
    queryFn: () => servico.listar(),
  })

  const arvore = useMemo(() => montarArvore(itens), [itens])
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

  const atualizarCaches = async (caminhoMudou: boolean) => {
    await queryClient.invalidateQueries({ queryKey: configuracao.chave })
    if (caminhoMudou) {
      // O produto (e o fornecedor, nas marcas) exibe o caminho: renomear/mover o desatualiza.
      await Promise.all(
        configuracao.chavesQueExibemOCaminho.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
    }
  }

  const mensagemDeErro = async (erro: unknown, padrao: string) => {
    // 404 (removido) e 409 (vinculos mudaram): a lista na tela esta desatualizada.
    if (erro instanceof HttpError && (erro.status === 404 || erro.status === 409)) {
      await queryClient.invalidateQueries({ queryKey: configuracao.chave })
    }
    return mensagemErroCatalogo(erro, { ...textosErro, padrao })
  }

  /** Lembra o no de origem antes de abrir um dialogo, para devolver o foco ao fechar. */
  const lembrarOrigem = (item: T) => {
    focoAposDialogoRef.current = {
      itemId: item.id,
      vizinhoId: arvoreRef.current?.vizinhoVisivel(item.id) ?? null,
      focarNo: false,
    }
  }

  /** Origem (botao "Mais" do no) se ainda existir; senao o vizinho visivel; senao o titulo da arvore. */
  const destinoFocoDialogo: DestinoFoco = () => {
    const foco = focoAposDialogoRef.current
    focoAposDialogoRef.current = null
    const arvoreAtual = arvoreRef.current
    if (!foco || !arvoreAtual) {
      return tituloArvoreRef.current
    }
    const proprio = foco.focarNo ? arvoreAtual.no(foco.itemId) : arvoreAtual.botaoMaisAcoes(foco.itemId)
    const vizinho = foco.vizinhoId ? arvoreAtual.no(foco.vizinhoId) : null
    return proprio ?? vizinho ?? tituloArvoreRef.current
  }

  const salvarNomeMutation = useMutation<T, unknown, { acao: AcaoNome<T>; nome: string }>({
    mutationFn: ({ acao, nome }) => {
      if (acao.tipo === 'renomear') {
        return servico.atualizar(acao.item.id, { nome, parentId: acao.item.parentId })
      }
      return servico.cadastrar({ nome, parentId: acao.tipo === 'sub' ? acao.pai.id : null })
    },
    onSuccess: async (salvo, { acao }) => {
      await atualizarCaches(acao.tipo === 'renomear')
      setErroNome(null)
      if (acao.tipo === 'renomear') {
        setMensagemSucesso(`${singularMaiusculo} renomeada para "${salvo.nome}".`)
        setAcaoNome(null)
        arvoreRef.current?.no(salvo.id)?.focus()
        return
      }
      // Criacao em sequencia: o campo continua aberto, vazio e com foco (Esc fecha).
      if (acao.tipo === 'sub') {
        expandir([acao.pai.id])
        setMensagemSucesso(textos.filho.criado(salvo.nome, acao.pai.caminho))
      } else {
        setMensagemSucesso(`${singularMaiusculo} "${salvo.nome}" criada.`)
      }
      setChaveCriacao((chave) => chave + 1)
    },
    onError: async (erro) => {
      setErroNome(await mensagemDeErro(erro, `Não foi possível salvar a ${textos.singular}. Tente novamente.`))
    },
  })

  const moverMutation = useMutation<T, unknown, { item: T; parentId: string | null }>({
    mutationFn: ({ item, parentId }) => servico.atualizar(item.id, { nome: item.nome, parentId }),
    onSuccess: async (movido, { parentId }) => {
      // Abre o caminho ate o novo pai para o item movido continuar a vista.
      expandir(idsDoRamo(itens, parentId))
      await atualizarCaches(true)
      const destino = itens.find((item) => item.id === parentId)
      setMensagemSucesso(
        destino
          ? `"${movido.nome}" agora está em "${destino.caminho}".`
          : textos.principal.virou(movido.nome),
      )
      // A lista ja voltou do refetch: ao fechar, o foco vai ao no na nova posicao.
      if (focoAposDialogoRef.current) {
        focoAposDialogoRef.current.focarNo = true
      }
      setItemMovendo(null)
      setErroMover(null)
    },
    onError: async (erro) => {
      // 400 (ciclo) e 409 (nome repetido no destino) ficam no dialogo para escolher outro destino.
      setErroMover(await mensagemDeErro(erro, `Não foi possível mover a ${textos.singular}. Tente novamente.`))
    },
  })

  const statusMutation = useMutation<T, unknown, T>({
    mutationFn: (item) => (item.ativo ? servico.inativar(item.id) : servico.reativar(item.id)),
    onMutate: (item) => setAcaoStatusId(item.id),
    onSuccess: async (atualizado) => {
      await atualizarCaches(false)
      setMensagemSucesso(
        atualizado.ativo
          ? `${singularMaiusculo} "${atualizado.nome}" reativada.`
          : `${singularMaiusculo} "${atualizado.nome}" inativada. Ela e suas ${textos.subPlural} deixam de aparecer ${textos.ondeAparece}.`,
      )
    },
    onError: async (erro) => {
      setErroGeral(
        await mensagemDeErro(erro, `Não foi possível alterar o status da ${textos.singular}. Tente novamente.`),
      )
    },
    onSettled: () => {
      setAcaoStatusId(null)
      // Inativar tambem e oferecido no dialogo de exclusao bloqueada.
      setItemExcluindo(null)
    },
  })

  const excluirMutation = useMutation<void, unknown, T>({
    mutationFn: (item) => servico.excluir(item.id),
    onSuccess: async (_, item) => {
      await atualizarCaches(false)
      setMensagemSucesso(`${singularMaiusculo} "${item.nome}" excluída.`)
    },
    onError: async (erro) => {
      // 409 (vinculos criados enquanto o dialogo estava aberto): o backend diz
      // quantos vinculos impedem e sugere inativar.
      setErroGeral(await mensagemDeErro(erro, `Não foi possível excluir a ${textos.singular}. Tente novamente.`))
    },
    onSettled: () => setItemExcluindo(null),
  })

  const limparFeedback = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
  }

  const abrirAcaoNome = (acao: AcaoNome<T>) => {
    limparFeedback()
    setErroNome(null)
    setAcaoNome(acao)
    if (acao.tipo === 'sub') {
      expandir([acao.pai.id])
    }
  }

  const cancelarAcaoNome = () => {
    // Devolve o foco ao no de onde o formulario saiu (ou ao botao de criar).
    if (acaoNome?.tipo === 'renomear') {
      arvoreRef.current?.no(acaoNome.item.id)?.focus()
    } else if (acaoNome?.tipo === 'sub') {
      arvoreRef.current?.no(acaoNome.pai.id)?.focus()
    } else {
      botaoNovaRef.current?.focus()
    }
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
    acaoNome?.tipo === 'sub'
      ? { tipo: 'sub', itemId: acaoNome.pai.id }
      : acaoNome?.tipo === 'renomear'
        ? { tipo: 'renomear', itemId: acaoNome.item.id }
        : null

  return (
    <div className="space-y-6">
      <CatalogoNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{textos.titulo}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{textos.descricao}</p>
        </div>

        {podeGerenciar && (
          <Button ref={botaoNovaRef} type="button" onClick={() => abrirAcaoNome({ tipo: 'principal' })}>
            <Plus className="h-4 w-4" />
            {textos.principal.novo}
          </Button>
        )}
      </div>

      {!podeGerenciar && (
        <AvisoSomenteLeitura
          texto={`Somente administradores podem gerenciar ${textos.plural}. Você está no modo leitura.`}
        />
      )}

      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} />

      {podeGerenciar && acaoNome?.tipo === 'principal' && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{textos.principal.novo}</CardTitle>
            <CardDescription>{textos.principal.descricaoDoNovo}</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioNomeDaArvore
              key={chaveCriacao}
              rotulo={textos.principal.rotuloDoNome}
              singular={textos.singular}
              placeholder={textos.exemploPrincipal}
              textoSalvar={textos.principal.criar}
              salvando={salvarNomeMutation.isPending}
              erro={erroNome}
              onSalvar={salvarNome}
              onCancelar={cancelarAcaoNome}
              onAlterar={() => setErroNome(null)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle ref={tituloArvoreRef} tabIndex={-1} className="outline-none">
            Árvore de {textos.plural}
          </CardTitle>
          <CardDescription>
            {comMaiuscula(textos.plural)} inativas e seus ramos continuam nos {textos.usadoPor} que já os usam, mas não
            aparecem em novos cadastros.
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
              Carregando {textos.plural}...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar as {textos.plural}.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && itens.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <FolderTree className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Nenhuma {textos.singular} ainda.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {podeGerenciar
                    ? textos.orientacaoVazia
                    : `Peça a um administrador para criar as ${textos.plural} dos produtos.`}
                </p>
                {podeGerenciar && acaoNome?.tipo !== 'principal' && (
                  <Button type="button" size="sm" className="mt-3" onClick={() => abrirAcaoNome({ tipo: 'principal' })}>
                    <Plus className="h-4 w-4" />
                    {textos.principal.criar}
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isPending && !isError && itens.length > 0 && (
            <ArvoreDoCadastro
              ref={arvoreRef}
              configuracao={configuracao}
              arvore={arvore}
              expandidos={expandidos}
              onAlterarExpansao={alterarExpansao}
              podeGerenciar={podeGerenciar}
              edicao={edicaoInline}
              salvandoEdicao={salvarNomeMutation.isPending}
              erroEdicao={erroNome}
              chaveEdicao={chaveCriacao}
              onSalvarEdicao={salvarNome}
              onCancelarEdicao={cancelarAcaoNome}
              onAlterarEdicao={() => setErroNome(null)}
              acaoStatusId={acaoStatusId}
              acoes={{
                onAdicionarSub: (pai) => abrirAcaoNome({ tipo: 'sub', pai }),
                onRenomear: (item) => abrirAcaoNome({ tipo: 'renomear', item }),
                onMover: (item) => {
                  limparFeedback()
                  setErroMover(null)
                  lembrarOrigem(item)
                  setItemMovendo(item)
                },
                onAlterarStatus: (item) => {
                  limparFeedback()
                  statusMutation.mutate(item)
                },
                onExcluir: (item) => {
                  limparFeedback()
                  lembrarOrigem(item)
                  setItemExcluindo(item)
                },
              }}
            />
          )}
        </CardContent>
      </Card>

      <MoverNaArvoreDialog
        item={itemMovendo}
        itens={itens}
        textos={textos}
        salvando={moverMutation.isPending}
        erro={erroMover}
        onConfirmar={(parentId) => itemMovendo && moverMutation.mutate({ item: itemMovendo, parentId })}
        onCancelar={() => {
          setItemMovendo(null)
          setErroMover(null)
        }}
        destinoFoco={destinoFocoDialogo}
      />

      <DialogExcluirItem
        item={itemExcluindo}
        configuracao={configuracao}
        excluindo={excluirMutation.isPending}
        inativando={statusMutation.isPending}
        onExcluir={(item) => excluirMutation.mutate(item)}
        onInativar={(item) => statusMutation.mutate(item)}
        onCancelar={() => setItemExcluindo(null)}
        destinoFoco={destinoFocoDialogo}
      />
    </div>
  )
}

interface DialogExcluirItemProps<T extends ItemDaArvore> {
  item: T | null
  configuracao: ConfiguracaoDaArvore<T>
  excluindo: boolean
  inativando: boolean
  onExcluir: (item: T) => void
  onInativar: (item: T) => void
  onCancelar: () => void
  destinoFoco: DestinoFoco
}

/** "Ela deixa de aparecer no cadastro de produtos; os produtos continuam com ela." (ou a versao de item ja inativo). */
function consequenciaDeInativar(ativo: boolean, textos: TextosDaArvore): string {
  return ativo
    ? `Ela deixa de aparecer ${textos.ondeAparece}; os ${textos.usadoPor} continuam com ela.`
    : `Ela já está inativa: não aparece ${textos.ondeAparece} e os ${textos.usadoPor} continuam com ela.`
}

/**
 * Exclusao de um item da arvore. Com subitens, produtos (ou fornecedores, nas
 * marcas) vinculados, ja explica por que nao da para excluir e oferece inativar
 * no lugar (sem beco sem saida). O 409 do backend continua tratado para o caso
 * de corrida.
 */
function DialogExcluirItem<T extends ItemDaArvore>({
  item,
  configuracao,
  excluindo,
  inativando,
  onExcluir,
  onInativar,
  onCancelar,
  destinoFoco,
}: DialogExcluirItemProps<T>) {
  const { textos } = configuracao
  const nome = item?.nome ?? ''
  const vinculos = item ? descreverVinculos(configuracao.vinculos(item)) : ''
  const bloqueado = vinculos !== ''

  return (
    <ConfirmarExclusaoDialog
      aberto={item !== null}
      titulo={bloqueado ? `Não é possível excluir "${nome}"` : `Excluir a ${textos.singular} "${nome}"?`}
      descricao={
        bloqueado ? (
          <>
            {/* Contagens diretas: a arvore mostra a subarvore, por isso o "diretamente nela". */}
            <p>
              Esta {textos.singular} tem {vinculos} diretamente nela, por isso não pode ser excluída.
            </p>
            <p>{consequenciaDeInativar(item?.ativo ?? false, textos)}</p>
          </>
        ) : (
          'Esta ação não pode ser desfeita.'
        )
      }
      excluindo={excluindo}
      podeExcluir={!bloqueado}
      alternativa={
        bloqueado && item?.ativo
          ? {
              rotulo: `Inativar ${textos.singular}`,
              icone: EyeOff,
              executando: inativando,
              onExecutar: () => onInativar(item),
            }
          : undefined
      }
      onConfirmar={() => item && onExcluir(item)}
      onCancelar={onCancelar}
      destinoFoco={destinoFoco}
    />
  )
}
