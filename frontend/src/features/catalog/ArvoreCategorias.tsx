import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import {
  ChevronRight,
  FolderInput,
  FolderPlus,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FormularioNomeCategoria } from '@/features/catalog/FormularioNomeCategoria'
import type { NoCategoria } from '@/lib/arvoreCategorias'
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

interface ArvoreCategoriasProps {
  arvore: NoCategoria[]
  expandidos: ReadonlySet<string>
  onAlterarExpansao: (id: string, expandir: boolean) => void
  podeGerenciar: boolean
  edicao: EdicaoInline | null
  salvandoEdicao: boolean
  erroEdicao: string | null
  onSalvarEdicao: (nome: string) => void
  onCancelarEdicao: () => void
  acaoStatusId: string | null
  acoes: AcoesCategoria
}

/** No visivel (todos os ancestrais expandidos), na ordem de leitura. */
interface ItemVisivel {
  no: NoCategoria
  paiId: string | null
}

function listarVisiveis(nos: NoCategoria[], expandidos: ReadonlySet<string>, paiId: string | null = null): ItemVisivel[] {
  const resultado: ItemVisivel[] = []
  for (const no of nos) {
    resultado.push({ no, paiId })
    if (no.filhos.length > 0 && expandidos.has(no.categoria.id)) {
      resultado.push(...listarVisiveis(no.filhos, expandidos, no.categoria.id))
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
 */
export function ArvoreCategorias({
  arvore,
  expandidos,
  onAlterarExpansao,
  podeGerenciar,
  edicao,
  salvandoEdicao,
  erroEdicao,
  onSalvarEdicao,
  onCancelarEdicao,
  acaoStatusId,
  acoes,
}: ArvoreCategoriasProps) {
  const [focoId, setFocoId] = useState<string | null>(null)
  const itensRef = useRef(new Map<string, HTMLLIElement>())
  const acoesRef = useRef(new Map<string, HTMLDivElement>())

  const visiveis = listarVisiveis(arvore, expandidos)
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
          aria-describedby={metaId}
          tabIndex={focavel ? 0 : -1}
          onKeyDown={(event) => aoTeclarNoItem(event, { no, paiId })}
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
                className="size-11 shrink-0 md:size-8"
                aria-label={`${expandido ? 'Recolher' : 'Expandir'} ${categoria.nome}`}
                onClick={() => {
                  setFocoId(id)
                  onAlterarExpansao(id, !expandido)
                }}
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform', expandido && 'rotate-90')} />
              </Button>
            ) : (
              <span className="size-11 shrink-0 md:size-8" aria-hidden="true" />
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
                />
              </div>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    id={nomeId}
                    className={cn('truncate font-medium', !categoria.ativo && 'text-muted-foreground')}
                  >
                    {categoria.nome}
                  </span>
                  {/* Descricao acessivel em texto corrido; a versao visual usa selos. */}
                  <span id={metaId} className="sr-only">
                    {descricaoAcessivel(categoria)}
                  </span>
                  <span aria-hidden="true" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{categoria.quantidadeProdutos} produto(s)</span>
                    {!categoria.ativo && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Inativa</span>
                    )}
                    {categoria.ativo && !categoria.selecionavel && (
                      <span
                        className="rounded-full bg-muted px-2 py-0.5 font-medium"
                        title="Uma categoria acima está inativa: este ramo não aparece no cadastro de produtos."
                      >
                        Ramo inativo
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
                    className="flex shrink-0 items-center gap-0.5"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        focar(id)
                      }
                    }}
                  >
                    <BotaoAcao
                      icone={FolderPlus}
                      rotulo={`Adicionar subcategoria em ${categoria.nome}`}
                      dica="Adicionar subcategoria"
                      focavel={focavel}
                      onClick={() => acoes.onAdicionarSubcategoria(categoria)}
                    />
                    <BotaoAcao
                      icone={Pencil}
                      rotulo={`Renomear ${categoria.nome}`}
                      dica="Renomear"
                      focavel={focavel}
                      onClick={() => acoes.onRenomear(categoria)}
                    />
                    <BotaoAcao
                      icone={FolderInput}
                      rotulo={`Mover ${categoria.nome}`}
                      dica="Mover"
                      focavel={focavel}
                      onClick={() => acoes.onMover(categoria)}
                    />
                    <BotaoAcao
                      icone={acaoStatusId === id ? Loader2 : categoria.ativo ? XCircle : RotateCcw}
                      girando={acaoStatusId === id}
                      rotulo={`${categoria.ativo ? 'Inativar' : 'Reativar'} ${categoria.nome}`}
                      dica={categoria.ativo ? 'Inativar' : 'Reativar'}
                      focavel={focavel}
                      desabilitado={acaoStatusId === id}
                      onClick={() => acoes.onAlterarStatus(categoria)}
                    />
                    <BotaoAcao
                      icone={Trash2}
                      rotulo={`Excluir ${categoria.nome}`}
                      dica="Excluir"
                      focavel={focavel}
                      destrutivo
                      onClick={() => acoes.onExcluir(categoria)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {adicionandoSub && (
            <div className="py-1 pr-1" style={{ paddingInlineStart: `${(nivel + 1) * 1.5 + 3}rem` }}>
              <FormularioNomeCategoria
                rotulo={`Nome da subcategoria de ${categoria.nome}`}
                placeholder="Nome da subcategoria"
                textoSalvar="Adicionar"
                salvando={salvandoEdicao}
                erro={erroEdicao}
                onSalvar={onSalvarEdicao}
                onCancelar={onCancelarEdicao}
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

function descricaoAcessivel(categoria: Categoria): string {
  const partes = [`${categoria.quantidadeProdutos} produto(s)`]
  if (!categoria.ativo) {
    partes.push('inativa')
  } else if (!categoria.selecionavel) {
    partes.push('ramo inativo')
  }
  return partes.join(', ')
}

interface BotaoAcaoProps {
  icone: LucideIcon
  rotulo: string
  dica: string
  /** So as acoes do item atual entram na ordem de Tab (foco roving). */
  focavel: boolean
  onClick: () => void
  desabilitado?: boolean
  destrutivo?: boolean
  girando?: boolean
}

function BotaoAcao({ icone: Icone, rotulo, dica, focavel, onClick, desabilitado, destrutivo, girando }: BotaoAcaoProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      tabIndex={focavel ? 0 : -1}
      className={cn('size-11 md:size-8', destrutivo && 'text-destructive hover:text-destructive')}
      aria-label={rotulo}
      title={dica}
      disabled={desabilitado}
      onClick={onClick}
    >
      <Icone className={cn('h-4 w-4', girando && 'animate-spin')} />
    </Button>
  )
}
