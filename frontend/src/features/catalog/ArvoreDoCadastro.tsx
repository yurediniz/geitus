import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { ChevronRight, Eye, EyeOff, FolderInput, FolderPlus, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ConfiguracaoDaArvore, TextosDaArvore } from '@/features/catalog/cadastrosEmArvore'
import { FormularioNomeDaArvore } from '@/features/catalog/FormularioNomeDaArvore'
import { MenuAcoes, type ItemMenuAcoes } from '@/features/catalog/MenuAcoes'
import { pluralizar, type Contagem } from '@/features/catalog/textosCatalogo'
import { produtosPorSubarvore, type NoDaArvore } from '@/lib/arvoreCategorias'
import { cn } from '@/lib/utils'
import type { ItemDaArvore } from '@/types/catalogo'

/** Formulario inline aberto sobre um no da arvore. */
export interface EdicaoInline {
  /** `sub`: adicionando uma subcategoria (ou submarca) dentro do no. */
  tipo: 'sub' | 'renomear'
  itemId: string
}

export interface AcoesDaArvore<T extends ItemDaArvore> {
  onAdicionarSub: (item: T) => void
  onRenomear: (item: T) => void
  onMover: (item: T) => void
  onAlterarStatus: (item: T) => void
  onExcluir: (item: T) => void
}

/** Acesso aos elementos da arvore para a tela devolver o foco apos uma acao. */
export interface ArvoreDoCadastroHandle {
  /** O no (treeitem) do item, se estiver visivel. */
  no: (id: string) => HTMLElement | null
  /** O botao "Mais acoes" do no, se estiver visivel. */
  botaoMaisAcoes: (id: string) => HTMLElement | null
  /** Id do no visivel seguinte fora da subarvore (ou o anterior), para quando este sumir. */
  vizinhoVisivel: (id: string) => string | null
}

interface ArvoreDoCadastroProps<T extends ItemDaArvore> {
  ref?: Ref<ArvoreDoCadastroHandle>
  configuracao: ConfiguracaoDaArvore<T>
  arvore: NoDaArvore<T>[]
  expandidos: ReadonlySet<string>
  onAlterarExpansao: (id: string, expandir: boolean) => void
  podeGerenciar: boolean
  edicao: EdicaoInline | null
  salvandoEdicao: boolean
  erroEdicao: string | null
  /** Muda a cada criacao em sequencia: remonta o campo vazio e com foco. */
  chaveEdicao: number
  onSalvarEdicao: (nome: string) => void
  onCancelarEdicao: () => void
  /** Primeira digitacao apos um erro do backend: a tela limpa a mensagem. */
  onAlterarEdicao: () => void
  acaoStatusId: string | null
  acoes: AcoesDaArvore<T>
}

/** No visivel (todos os ancestrais expandidos), na ordem de leitura. */
interface ItemVisivel<T extends ItemDaArvore> {
  no: NoDaArvore<T>
  paiId: string | null
  nivel: number
}

function listarVisiveis<T extends ItemDaArvore>(
  nos: NoDaArvore<T>[],
  expandidos: ReadonlySet<string>,
  paiId: string | null = null,
  nivel = 0,
): ItemVisivel<T>[] {
  const resultado: ItemVisivel<T>[] = []
  for (const no of nos) {
    resultado.push({ no, paiId, nivel })
    if (no.filhos.length > 0 && expandidos.has(no.item.id)) {
      resultado.push(...listarVisiveis(no.filhos, expandidos, no.item.id, nivel + 1))
    }
  }
  return resultado
}

/**
 * Arvore de um cadastro do catalogo (categorias, marcas) com o padrao ARIA de
 * tree view: `tree` > `treeitem` (> `group`), `aria-expanded`/`aria-level`,
 * foco "roving" (um unico item na ordem de Tab) e teclado: ↑/↓ entre nos
 * visiveis, Home/End, → expande ou vai ao primeiro filho, ← recolhe ou vai ao
 * pai, Espaco expande/recolhe e Enter leva o foco as acoes do no (Esc volta ao
 * no). Sem acoes (OPERADOR), Enter tambem expande/recolhe.
 *
 * Por no, so "Adicionar subcategoria" (ou submarca) fica visivel; as demais
 * acoes ficam no menu "Mais" para a linha nao ficar carregada.
 */
export function ArvoreDoCadastro<T extends ItemDaArvore>({
  ref,
  configuracao,
  arvore,
  expandidos,
  onAlterarExpansao,
  podeGerenciar,
  edicao,
  salvandoEdicao,
  erroEdicao,
  chaveEdicao,
  onSalvarEdicao,
  onCancelarEdicao,
  onAlterarEdicao,
  acaoStatusId,
  acoes,
}: ArvoreDoCadastroProps<T>) {
  const { textos } = configuracao
  const [focoId, setFocoId] = useState<string | null>(null)
  const itensRef = useRef(new Map<string, HTMLLIElement>())
  const acoesRef = useRef(new Map<string, HTMLDivElement>())
  const maisAcoesRef = useRef(new Map<string, HTMLButtonElement>())

  const totaisProdutos = useMemo(() => produtosPorSubarvore(arvore), [arvore])
  const visiveis = listarVisiveis(arvore, expandidos)

  useImperativeHandle(ref, () => ({
    no: (id) => itensRef.current.get(id) ?? null,
    botaoMaisAcoes: (id) => maisAcoesRef.current.get(id) ?? null,
    vizinhoVisivel: (id) => {
      const indice = visiveis.findIndex((visivel) => visivel.no.item.id === id)
      if (indice < 0) {
        return null
      }
      const nivel = visiveis[indice]?.nivel ?? 0
      const seguinte = visiveis.slice(indice + 1).find((visivel) => visivel.nivel <= nivel)
      return (seguinte ?? visiveis[indice - 1])?.no.item.id ?? null
    },
  }))
  // Se o item com foco sumiu (recolhido, excluido), o primeiro visivel assume.
  const idFocavel = visiveis.some((visivel) => visivel.no.item.id === focoId)
    ? focoId
    : (visiveis[0]?.no.item.id ?? null)

  const focar = (id: string | undefined | null) => {
    if (!id) {
      return
    }
    setFocoId(id)
    itensRef.current.get(id)?.focus()
  }

  const aoTeclarNoItem = (event: KeyboardEvent<HTMLLIElement>, visivel: ItemVisivel<T>) => {
    // Teclas vindas de botoes/campos dentro do no seguem o comportamento nativo.
    if (event.target !== event.currentTarget) {
      return
    }
    const { item, filhos } = visivel.no
    const temFilhos = filhos.length > 0
    const expandido = expandidos.has(item.id)
    const indice = visiveis.findIndex((outro) => outro.no.item.id === item.id)

    switch (event.key) {
      case 'ArrowDown':
        focar(visiveis[indice + 1]?.no.item.id)
        break
      case 'ArrowUp':
        focar(visiveis[indice - 1]?.no.item.id)
        break
      case 'Home':
        focar(visiveis[0]?.no.item.id)
        break
      case 'End':
        focar(visiveis[visiveis.length - 1]?.no.item.id)
        break
      case 'ArrowRight':
        if (temFilhos && !expandido) {
          onAlterarExpansao(item.id, true)
        } else if (temFilhos) {
          focar(filhos[0]?.item.id)
        }
        break
      case 'ArrowLeft':
        if (temFilhos && expandido) {
          onAlterarExpansao(item.id, false)
        } else {
          focar(visivel.paiId)
        }
        break
      case ' ':
        if (temFilhos) {
          onAlterarExpansao(item.id, !expandido)
        }
        break
      case 'Enter':
        if (podeGerenciar) {
          acoesRef.current.get(item.id)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
        } else if (temFilhos) {
          onAlterarExpansao(item.id, !expandido)
        }
        break
      default:
        return
    }
    event.preventDefault()
  }

  const renderizarNos = (nos: NoDaArvore<T>[], nivel: number, paiId: string | null) =>
    nos.map((no, posicao) => {
      const { item, filhos } = no
      const id = item.id
      const temFilhos = filhos.length > 0
      const expandido = temFilhos && expandidos.has(id)
      const renomeando = edicao?.tipo === 'renomear' && edicao.itemId === id
      const adicionandoSub = edicao?.tipo === 'sub' && edicao.itemId === id
      const focavel = id === idFocavel
      const nomeId = `${configuracao.tipo}-${id}-nome`
      const metaId = `${configuracao.tipo}-${id}-meta`
      const contagens = contagensDoNo(totaisProdutos.get(id) ?? 0, configuracao.contagensExtras(item))
      const descricao = descricaoAcessivel(item, contagens, textos)
      const atenuada = !item.ativo || !item.selecionavel
      const recuo = { paddingInlineStart: `${nivel * 1.5}rem` }

      return (
        <li
          key={id}
          ref={(elemento) => {
            if (elemento) {
              itensRef.current.set(id, elemento)
            } else {
              itensRef.current.delete(id)
            }
          }}
          role="treeitem"
          aria-level={nivel + 1}
          aria-setsize={nos.length}
          aria-posinset={posicao + 1}
          aria-expanded={temFilhos ? expandido : undefined}
          aria-labelledby={nomeId}
          aria-describedby={descricao ? metaId : undefined}
          tabIndex={focavel ? 0 : -1}
          onKeyDown={(event) => aoTeclarNoItem(event, { no, paiId, nivel })}
          onFocus={(event: FocusEvent<HTMLLIElement>) => {
            // So o treeitem mais proximo do elemento focado vira o item atual.
            const alvo = event.target instanceof HTMLElement ? event.target : null
            if (alvo?.closest('[role="treeitem"]') === event.currentTarget) {
              setFocoId(id)
            }
          }}
          className="outline-none [&:focus-visible>[data-linha]]:ring-2 [&:focus-visible>[data-linha]]:ring-ring/60"
        >
          <div
            data-linha=""
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md py-1 pr-1 transition-colors hover:bg-muted/60"
            style={recuo}
          >
            {temFilhos ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                tabIndex={-1}
                className="size-9 shrink-0 pointer-coarse:size-11"
                aria-label={`${expandido ? 'Recolher' : 'Expandir'} ${item.nome}`}
                onClick={() => {
                  setFocoId(id)
                  onAlterarExpansao(id, !expandido)
                }}
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform', expandido && 'rotate-90')} />
              </Button>
            ) : (
              <span className="size-9 shrink-0 pointer-coarse:size-11" aria-hidden="true" />
            )}

            {renomeando ? (
              <div className="min-w-0 flex-1">
                <span id={nomeId} className="sr-only">
                  {item.nome}
                </span>
                <span id={metaId} className="sr-only">
                  Renomeando
                </span>
                <FormularioNomeDaArvore
                  rotulo={`Novo nome para ${item.nome}`}
                  singular={textos.singular}
                  valorInicial={item.nome}
                  textoSalvar="Salvar"
                  salvando={salvandoEdicao}
                  erro={erroEdicao}
                  onSalvar={onSalvarEdicao}
                  onCancelar={onCancelarEdicao}
                  onAlterar={onAlterarEdicao}
                />
              </div>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span id={nomeId} className={cn('truncate font-medium', atenuada && 'text-muted-foreground')}>
                    {item.nome}
                  </span>
                  {/* Descricao acessivel em texto corrido; a versao visual usa selos. */}
                  {descricao && (
                    <span id={metaId} className="sr-only">
                      {descricao}
                    </span>
                  )}
                  <span aria-hidden="true" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {contagens.length > 0 && <span className="tabular-nums">{contagens.join(' · ')}</span>}
                    {!item.ativo && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Inativa</span>}
                    {item.ativo && !item.selecionavel && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                        Oculta — {textos.singular} acima inativa
                      </span>
                    )}
                  </span>
                </div>

                {podeGerenciar && (
                  <div
                    ref={(elemento) => {
                      if (elemento) {
                        acoesRef.current.set(id, elemento)
                      } else {
                        acoesRef.current.delete(id)
                      }
                    }}
                    className="flex shrink-0 items-center gap-1"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && !event.defaultPrevented) {
                        event.preventDefault()
                        focar(id)
                      }
                    }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      tabIndex={focavel ? 0 : -1}
                      className="size-9 pointer-coarse:size-11"
                      aria-label={textos.filho.acaoEm(item.nome)}
                      title={textos.filho.acao}
                      onClick={() => acoes.onAdicionarSub(item)}
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                    <MenuAcoes
                      ref={(elemento) => {
                        if (elemento) {
                          maisAcoesRef.current.set(id, elemento)
                        } else {
                          maisAcoesRef.current.delete(id)
                        }
                      }}
                      rotulo={`Mais ações para ${item.nome}`}
                      focavel={focavel}
                      ocupado={acaoStatusId === id}
                      itens={itensDoMenu(item, acoes)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {adicionandoSub && (
            <div className="py-1 pr-1" style={{ paddingInlineStart: `${(nivel + 1) * 1.5 + 3}rem` }}>
              <FormularioNomeDaArvore
                key={chaveEdicao}
                rotulo={`Nome da ${textos.sub} de ${item.nome}`}
                singular={textos.singular}
                placeholder={`Nome da ${textos.sub}`}
                textoSalvar="Adicionar"
                salvando={salvandoEdicao}
                erro={erroEdicao}
                onSalvar={onSalvarEdicao}
                onCancelar={onCancelarEdicao}
                onAlterar={onAlterarEdicao}
              />
            </div>
          )}

          {expandido && (
            <ul role="group" className="space-y-0.5">
              {renderizarNos(filhos, nivel + 1, id)}
            </ul>
          )}
        </li>
      )
    })

  return (
    <ul role="tree" aria-label={textos.aba} className="space-y-0.5">
      {renderizarNos(arvore, 0, null)}
    </ul>
  )
}

/**
 * Contagens do no, sem as zeradas: os produtos da subarvore ("11 produtos") e
 * as diretas da configuracao ("2 fornecedores", nas marcas).
 */
function contagensDoNo(produtosNaSubarvore: number, extras: readonly Contagem[]): string[] {
  return [{ quantidade: produtosNaSubarvore, singular: 'produto', plural: 'produtos' }, ...extras]
    .filter((contagem) => contagem.quantidade > 0)
    .map((contagem) => pluralizar(contagem.quantidade, contagem.singular, contagem.plural))
}

function descricaoAcessivel(item: ItemDaArvore, contagens: readonly string[], textos: TextosDaArvore): string {
  const partes = [...contagens]
  if (!item.ativo) {
    partes.push('inativa')
  } else if (!item.selecionavel) {
    partes.push(`oculta — ${textos.singular} acima inativa`)
  }
  return partes.join(', ')
}

function itensDoMenu<T extends ItemDaArvore>(item: T, acoes: AcoesDaArvore<T>): ItemMenuAcoes[] {
  return [
    { id: 'renomear', rotulo: 'Renomear', icone: Pencil, levaFoco: true, onSelecionar: () => acoes.onRenomear(item) },
    { id: 'mover', rotulo: 'Mover', icone: FolderInput, levaFoco: true, onSelecionar: () => acoes.onMover(item) },
    item.ativo
      ? { id: 'status', rotulo: 'Inativar', icone: EyeOff, onSelecionar: () => acoes.onAlterarStatus(item) }
      : { id: 'status', rotulo: 'Reativar', icone: Eye, onSelecionar: () => acoes.onAlterarStatus(item) },
    {
      id: 'excluir',
      rotulo: 'Excluir',
      icone: Trash2,
      destrutivo: true,
      levaFoco: true,
      onSelecionar: () => acoes.onExcluir(item),
    },
  ]
}
