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
import { FormularioNomeCategoria } from '@/features/catalog/FormularioNomeCategoria'
import { MenuAcoes, type ItemMenuAcoes } from '@/features/catalog/MenuAcoes'
import { pluralizar } from '@/features/catalog/textosCatalogo'
import { produtosPorSubarvore, type NoCategoria } from '@/lib/arvoreCategorias'
import { cn } from '@/lib/utils'
import type { Categoria } from '@/types/catalogo'

/** Formulario inline aberto sobre um no da arvore. */
export interface EdicaoInline {
  tipo: 'subcategoria' | 'renomear'
  categoriaId: string
}

export interface AcoesCategoria {
  onAdicionarSubcategoria: (categoria: Categoria) => void
  onRenomear: (categoria: Categoria) => void
  onMover: (categoria: Categoria) => void
  onAlterarStatus: (categoria: Categoria) => void
  onExcluir: (categoria: Categoria) => void
}

/** Acesso aos elementos da arvore para a tela devolver o foco apos uma acao. */
export interface ArvoreCategoriasHandle {
  /** O no (treeitem) da categoria, se estiver visivel. */
  no: (id: string) => HTMLElement | null
  /** O botao "Mais acoes" do no, se estiver visivel. */
  botaoMaisAcoes: (id: string) => HTMLElement | null
  /** Id do no visivel seguinte fora da subarvore (ou o anterior), para quando este sumir. */
  vizinhoVisivel: (id: string) => string | null
}

interface ArvoreCategoriasProps {
  ref?: Ref<ArvoreCategoriasHandle>
  arvore: NoCategoria[]
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
  acoes: AcoesCategoria
}

/** No visivel (todos os ancestrais expandidos), na ordem de leitura. */
interface ItemVisivel {
  no: NoCategoria
  paiId: string | null
  nivel: number
}

function listarVisiveis(
  nos: NoCategoria[],
  expandidos: ReadonlySet<string>,
  paiId: string | null = null,
  nivel = 0,
): ItemVisivel[] {
  const resultado: ItemVisivel[] = []
  for (const no of nos) {
    resultado.push({ no, paiId, nivel })
    if (no.filhos.length > 0 && expandidos.has(no.categoria.id)) {
      resultado.push(...listarVisiveis(no.filhos, expandidos, no.categoria.id, nivel + 1))
    }
  }
  return resultado
}

/**
 * Arvore de categorias com o padrao ARIA de tree view: `tree` > `treeitem`
 * (> `group`), `aria-expanded`/`aria-level`, foco "roving" (um unico item na
 * ordem de Tab) e teclado: ↑/↓ entre nos visiveis, Home/End, → expande ou vai
 * ao primeiro filho, ← recolhe ou vai ao pai, Espaco expande/recolhe e Enter
 * leva o foco as acoes do no (Esc volta ao no). Sem acoes (OPERADOR), Enter
 * tambem expande/recolhe.
 *
 * Por no, so "Adicionar subcategoria" fica visivel; as demais acoes ficam no
 * menu "Mais" para a linha nao ficar carregada.
 */
export function ArvoreCategorias({
  ref,
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
}: ArvoreCategoriasProps) {
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
      const indice = visiveis.findIndex((item) => item.no.categoria.id === id)
      if (indice < 0) {
        return null
      }
      const nivel = visiveis[indice]?.nivel ?? 0
      const seguinte = visiveis.slice(indice + 1).find((item) => item.nivel <= nivel)
      return (seguinte ?? visiveis[indice - 1])?.no.categoria.id ?? null
    },
  }))
  // Se o item com foco sumiu (recolhido, excluido), o primeiro visivel assume.
  const idFocavel = visiveis.some((item) => item.no.categoria.id === focoId)
    ? focoId
    : (visiveis[0]?.no.categoria.id ?? null)

  const focar = (id: string | undefined | null) => {
    if (!id) {
      return
    }
    setFocoId(id)
    itensRef.current.get(id)?.focus()
  }

  const aoTeclarNoItem = (event: KeyboardEvent<HTMLLIElement>, item: ItemVisivel) => {
    // Teclas vindas de botoes/campos dentro do no seguem o comportamento nativo.
    if (event.target !== event.currentTarget) {
      return
    }
    const { categoria, filhos } = item.no
    const temFilhos = filhos.length > 0
    const expandido = expandidos.has(categoria.id)
    const indice = visiveis.findIndex((visivel) => visivel.no.categoria.id === categoria.id)

    switch (event.key) {
      case 'ArrowDown':
        focar(visiveis[indice + 1]?.no.categoria.id)
        break
      case 'ArrowUp':
        focar(visiveis[indice - 1]?.no.categoria.id)
        break
      case 'Home':
        focar(visiveis[0]?.no.categoria.id)
        break
      case 'End':
        focar(visiveis[visiveis.length - 1]?.no.categoria.id)
        break
      case 'ArrowRight':
        if (temFilhos && !expandido) {
          onAlterarExpansao(categoria.id, true)
        } else if (temFilhos) {
          focar(filhos[0]?.categoria.id)
        }
        break
      case 'ArrowLeft':
        if (temFilhos && expandido) {
          onAlterarExpansao(categoria.id, false)
        } else {
          focar(item.paiId)
        }
        break
      case ' ':
        if (temFilhos) {
          onAlterarExpansao(categoria.id, !expandido)
        }
        break
      case 'Enter':
        if (podeGerenciar) {
          acoesRef.current.get(categoria.id)?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
        } else if (temFilhos) {
          onAlterarExpansao(categoria.id, !expandido)
        }
        break
      default:
        return
    }
    event.preventDefault()
  }

  const renderizarNos = (nos: NoCategoria[], nivel: number, paiId: string | null) =>
    nos.map((no, posicao) => {
      const { categoria, filhos } = no
      const id = categoria.id
      const temFilhos = filhos.length > 0
      const expandido = temFilhos && expandidos.has(id)
      const renomeando = edicao?.tipo === 'renomear' && edicao.categoriaId === id
      const adicionandoSub = edicao?.tipo === 'subcategoria' && edicao.categoriaId === id
      const focavel = id === idFocavel
      const nomeId = `categoria-${id}-nome`
      const metaId = `categoria-${id}-meta`
      const produtosNaSubarvore = totaisProdutos.get(id) ?? 0
      const descricao = descricaoAcessivel(categoria, produtosNaSubarvore)
      const atenuada = !categoria.ativo || !categoria.selecionavel
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
                aria-label={`${expandido ? 'Recolher' : 'Expandir'} ${categoria.nome}`}
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
                  {categoria.nome}
                </span>
                <span id={metaId} className="sr-only">
                  Renomeando
                </span>
                <FormularioNomeCategoria
                  rotulo={`Novo nome para ${categoria.nome}`}
                  valorInicial={categoria.nome}
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
                    {categoria.nome}
                  </span>
                  {/* Descricao acessivel em texto corrido; a versao visual usa selos. */}
                  {descricao && (
                    <span id={metaId} className="sr-only">
                      {descricao}
                    </span>
                  )}
                  <span aria-hidden="true" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {produtosNaSubarvore > 0 && (
                      <span className="tabular-nums">{pluralizar(produtosNaSubarvore, 'produto', 'produtos')}</span>
                    )}
                    {!categoria.ativo && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Inativa</span>
                    )}
                    {categoria.ativo && !categoria.selecionavel && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                        Oculta — categoria acima inativa
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
                      aria-label={`Adicionar subcategoria em ${categoria.nome}`}
                      title="Adicionar subcategoria"
                      onClick={() => acoes.onAdicionarSubcategoria(categoria)}
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
                      rotulo={`Mais ações para ${categoria.nome}`}
                      focavel={focavel}
                      ocupado={acaoStatusId === id}
                      itens={itensDoMenu(categoria, acoes)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {adicionandoSub && (
            <div className="py-1 pr-1" style={{ paddingInlineStart: `${(nivel + 1) * 1.5 + 3}rem` }}>
              <FormularioNomeCategoria
                key={chaveEdicao}
                rotulo={`Nome da subcategoria de ${categoria.nome}`}
                placeholder="Nome da subcategoria"
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
    <ul role="tree" aria-label="Categorias" className="space-y-0.5">
      {renderizarNos(arvore, 0, null)}
    </ul>
  )
}

function descricaoAcessivel(categoria: Categoria, produtosNaSubarvore: number): string {
  const partes: string[] = []
  if (produtosNaSubarvore > 0) {
    partes.push(pluralizar(produtosNaSubarvore, 'produto', 'produtos'))
  }
  if (!categoria.ativo) {
    partes.push('inativa')
  } else if (!categoria.selecionavel) {
    partes.push('oculta — categoria acima inativa')
  }
  return partes.join(', ')
}

function itensDoMenu(categoria: Categoria, acoes: AcoesCategoria): ItemMenuAcoes[] {
  return [
    { id: 'renomear', rotulo: 'Renomear', icone: Pencil, levaFoco: true, onSelecionar: () => acoes.onRenomear(categoria) },
    { id: 'mover', rotulo: 'Mover', icone: FolderInput, levaFoco: true, onSelecionar: () => acoes.onMover(categoria) },
    categoria.ativo
      ? { id: 'status', rotulo: 'Inativar', icone: EyeOff, onSelecionar: () => acoes.onAlterarStatus(categoria) }
      : { id: 'status', rotulo: 'Reativar', icone: Eye, onSelecionar: () => acoes.onAlterarStatus(categoria) },
    {
      id: 'excluir',
      rotulo: 'Excluir',
      icone: Trash2,
      destrutivo: true,
      levaFoco: true,
      onSelecionar: () => acoes.onExcluir(categoria),
    },
  ]
}
