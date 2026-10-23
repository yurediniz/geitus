import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CATEGORIAS_QUERY_KEY, mensagemErroCatalogo } from '@/features/catalog/catalogoQuery'
import { nomeCategoriaSchema } from '@/features/catalog/catalogoSchemas'
import { casaTermo, filtrarPorTermo, normalizarTexto } from '@/lib/arvoreCategorias'
import { cn } from '@/lib/utils'
import { cadastrarCategoria } from '@/services/categoriaService'
import type { Categoria, CategoriaRequest, CategoriaResumo } from '@/types/catalogo'

const TEXTOS_ERRO_CRIAR = {
  padrao: 'Não foi possível criar a categoria. Tente novamente.',
  naoEncontrado: 'A categoria pai não existe mais. Escolha outra.',
  semPermissao: 'Somente administradores podem criar categorias.',
}

/** Valor do select de pai que cria a categoria como principal (parentId null). */
const SEM_PAI = ''

export interface SeletorCategoriaProps {
  /** Lista plana da empresa (todas, inclusive inativas: o seletor oferece so as selecionaveis). */
  categorias: Categoria[]
  /** Id da categoria escolhida; `null` = sem categoria. */
  valor: string | null
  /** Categoria atual do produto em edicao: continua escolhivel mesmo se inativa. */
  valorAtual?: CategoriaResumo | null
  onChange: (id: string | null) => void
  /**
   * Somente ADMIN: mostra o atalho "+ Nova categoria" e o link para a tela de
   * Categorias na orientacao sobre categoria inativa.
   */
  podeCriar: boolean
  onCriada?: (categoria: Categoria) => void
  desabilitado?: boolean
  /** Id do botao que abre o seletor (para o `<label htmlFor>` externo). */
  id?: string
  /** Id do rotulo externo: compoe o nome acessivel com o valor atual. */
  idRotulo?: string
  invalido?: boolean
  /** Rotulo da opcao sem categoria (`null`). No filtro da lista e "Todas". */
  rotuloSemValor?: string
  /**
   * Oferece tambem as categorias nao selecionaveis (inativas), marcadas com
   * "(inativa)". Usado no filtro da lista: produto em categoria inativa
   * continua existindo e precisa ser encontrado.
   */
  incluirInativas?: boolean
}

interface Opcao {
  /** `null` representa "Sem categoria". */
  id: string | null
  rotulo: string
  inativa: boolean
}

function rotuloOpcao(opcao: Opcao): string {
  return opcao.inativa ? `${opcao.rotulo} (inativa)` : opcao.rotulo
}

/**
 * Comparacao de nome como a unicidade do backend: ignora maiusculas e espacos
 * nas pontas, mas respeita acentos ("Racao" e "Ração" sao nomes diferentes).
 */
function chaveDeNome(texto: string): string {
  return texto.normalize('NFC').trim().toLocaleLowerCase('pt-BR')
}

const ROTA_CATEGORIAS = '/produtos/categorias'

/**
 * Combobox de categoria: busca pelo caminho (sem diferenciar acentos), lista
 * so as categorias selecionaveis e oferece "Sem categoria". Para ADMIN, o
 * atalho "+ Nova categoria" cria a categoria ali mesmo e ja a seleciona.
 *
 * Teclado: setas abrem e percorrem a lista, Enter escolhe, Esc fecha e Tab
 * para fora do painel fecha e devolve o foco ao gatilho.
 */
export function SeletorCategoria({
  categorias,
  valor,
  valorAtual,
  onChange,
  podeCriar,
  onCriada,
  desabilitado = false,
  id,
  idRotulo,
  invalido,
  rotuloSemValor = 'Sem categoria',
  incluirInativas = false,
}: SeletorCategoriaProps) {
  const idBase = useId()
  const idGatilho = id ?? `${idBase}-gatilho`
  const idValor = `${idBase}-valor`
  const idLista = `${idBase}-lista`
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  const [criando, setCriando] = useState(false)
  // A categoria recem-criada so chega na lista apos o refetch; ate la, e lembrada aqui.
  const [criadaAgora, setCriadaAgora] = useState<Categoria | null>(null)
  const listaRef = useRef<HTMLUListElement>(null)
  const conteudoRef = useRef<HTMLDivElement>(null)

  const porId = useMemo(() => {
    const mapa = new Map(categorias.map((categoria) => [categoria.id, categoria]))
    if (criadaAgora && !mapa.has(criadaAgora.id)) {
      mapa.set(criadaAgora.id, criadaAgora)
    }
    return mapa
  }, [categorias, criadaAgora])

  const selecionaveis = useMemo(
    () => [...porId.values()].filter((categoria) => incluirInativas || categoria.selecionavel),
    [porId, incluirInativas],
  )

  /** Categoria atual nao selecionavel (inativa ou sob ramo inativo): mantida como opcao. */
  const opcaoAtualInativa = useMemo<Opcao | null>(() => {
    if (!valorAtual || selecionaveis.some((categoria) => categoria.id === valorAtual.id)) {
      return null
    }
    const conhecida = porId.get(valorAtual.id)
    return {
      id: valorAtual.id,
      rotulo: conhecida?.caminho ?? valorAtual.caminho,
      inativa: conhecida ? !conhecida.selecionavel : false,
    }
  }, [valorAtual, selecionaveis, porId])

  const opcoes = useMemo<Opcao[]>(() => {
    const filtradas = filtrarPorTermo(selecionaveis, termo).map<Opcao>((categoria) => ({
      id: categoria.id,
      rotulo: categoria.caminho,
      inativa: !categoria.selecionavel,
    }))
    const atual =
      opcaoAtualInativa && casaTermo(opcaoAtualInativa.rotulo, termo) ? [opcaoAtualInativa] : []
    const semCategoria: Opcao[] = termo.trim() === '' ? [{ id: null, rotulo: rotuloSemValor, inativa: false }] : []
    return [...semCategoria, ...atual, ...filtradas]
  }, [selecionaveis, termo, opcaoAtualInativa, rotuloSemValor])

  const textoValor = useMemo(() => {
    if (valor === null) {
      return rotuloSemValor
    }
    const conhecida = porId.get(valor)
    if (conhecida) {
      return rotuloOpcao({ id: conhecida.id, rotulo: conhecida.caminho, inativa: !conhecida.selecionavel })
    }
    if (valorAtual && valorAtual.id === valor) {
      return valorAtual.caminho
    }
    return 'Categoria selecionada'
  }, [valor, porId, valorAtual, rotuloSemValor])

  // Nome igual (sem diferenciar maiusculas) a uma principal selecionavel: ela ja
  // aparece na lista e criar daria nome repetido. Inativas nao contam: a
  // orientacao abaixo explica e "+ Nova" segue disponivel (ex.: como subcategoria).
  const termoEhPrincipalExistente = useMemo(() => {
    const alvo = chaveDeNome(termo)
    return (
      alvo !== '' &&
      selecionaveis.some((categoria) => categoria.parentId === null && chaveDeNome(categoria.nome) === alvo)
    )
  }, [termo, selecionaveis])

  // Termo igual (sem acento/maiusculas) ao nome de uma categoria fora da lista
  // (inativa ou sob ramo inativo): explica por que ela nao aparece. Prefere a
  // mais rasa; ignora a categoria atual, que ja aparece como opcao "(inativa)".
  const naoSelecionavelComMesmoNome = useMemo(() => {
    const alvo = normalizarTexto(termo)
    // Com as inativas na lista, nao ha o que explicar.
    if (alvo === '' || incluirInativas) {
      return null
    }
    const candidatas = [...porId.values()].filter(
      (categoria) =>
        !categoria.selecionavel && categoria.id !== opcaoAtualInativa?.id && normalizarTexto(categoria.nome) === alvo,
    )
    return candidatas.sort((a, b) => a.nivel - b.nivel)[0] ?? null
  }, [termo, porId, opcaoAtualInativa, incluirInativas])

  const indiceSeguro = opcoes.length === 0 ? -1 : Math.min(indiceAtivo, opcoes.length - 1)
  const idOpcao = (indice: number) => `${idBase}-opcao-${indice}`

  // Mantem a opcao ativa visivel ao navegar pelo teclado em listas longas.
  useEffect(() => {
    if (indiceSeguro < 0) {
      return
    }
    const elemento = listaRef.current?.children.item(indiceSeguro)
    elemento?.scrollIntoView?.({ block: 'nearest' })
  }, [indiceSeguro])

  // Indice do valor atual na lista sem filtro (termo vazio), usado ao abrir.
  const opcoesIniciais = (): Opcao[] => [
    { id: null, rotulo: rotuloSemValor, inativa: false },
    ...(opcaoAtualInativa ? [opcaoAtualInativa] : []),
    ...selecionaveis.map((categoria) => ({ id: categoria.id, rotulo: categoria.caminho, inativa: !categoria.selecionavel })),
  ]

  const abrir = (proximo: boolean) => {
    setAberto(proximo)
    if (proximo) {
      setTermo('')
      setCriando(false)
      const indiceDoValor = Math.max(
        0,
        opcoesIniciais().findIndex((opcao) => opcao.id === valor),
      )
      setIndiceAtivo(indiceDoValor)
    }
  }

  const escolher = (opcao: Opcao) => {
    onChange(opcao.id)
    setAberto(false)
  }

  const aoTeclarNaBusca = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndiceAtivo((indice) => (opcoes.length === 0 ? 0 : (Math.min(indice, opcoes.length - 1) + 1) % opcoes.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndiceAtivo((indice) =>
        opcoes.length === 0 ? 0 : (Math.min(indice, opcoes.length - 1) - 1 + opcoes.length) % opcoes.length,
      )
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const opcao = indiceSeguro >= 0 ? opcoes[indiceSeguro] : undefined
      if (opcao) {
        escolher(opcao)
      }
    }
  }

  // Tab saindo do primeiro/ultimo campo do painel: fecha e o Radix devolve o foco ao gatilho.
  const aoTeclarNoPainel = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !conteudoRef.current) {
      return
    }
    const focaveis = Array.from(
      conteudoRef.current.querySelectorAll<HTMLElement>(
        'a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    )
    const limite = event.shiftKey ? focaveis[0] : focaveis[focaveis.length - 1]
    if (limite && document.activeElement === limite) {
      event.preventDefault()
      setAberto(false)
    }
  }

  const aoTeclarNoGatilho = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!aberto && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      abrir(true)
    }
  }

  const aoCriar = (categoria: Categoria) => {
    setCriadaAgora(categoria)
    onChange(categoria.id)
    onCriada?.(categoria)
    setCriando(false)
    setAberto(false)
  }

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild disabled={desabilitado}>
        <button
          type="button"
          id={idGatilho}
          aria-labelledby={idRotulo ? `${idRotulo} ${idValor}` : undefined}
          aria-invalid={invalido ? true : undefined}
          onKeyDown={aoTeclarNoGatilho}
          className={cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          )}
        >
          <span id={idValor} className={cn('truncate', valor === null && 'text-muted-foreground')}>
            {textoValor}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        ref={conteudoRef}
        aria-label="Escolher categoria"
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
        onKeyDown={aoTeclarNoPainel}
        onEscapeKeyDown={(event) => {
          // Com o mini-formulario aberto, o primeiro Esc volta para a lista.
          if (criando) {
            event.preventDefault()
            setCriando(false)
          }
        }}
      >
        {criando ? (
          <FormularioNovaCategoria
            nomeInicial={termo.trim()}
            categorias={selecionaveis}
            onCriada={aoCriar}
            onCancelar={() => setCriando(false)}
          />
        ) : (
          <div className="flex flex-col">
            <div className="relative border-b p-2">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                autoFocus
                role="combobox"
                aria-label="Buscar categoria"
                aria-expanded="true"
                aria-controls={idLista}
                aria-autocomplete="list"
                aria-activedescendant={indiceSeguro >= 0 ? idOpcao(indiceSeguro) : undefined}
                value={termo}
                placeholder="Buscar pelo nome ou caminho"
                onChange={(event) => {
                  setTermo(event.target.value)
                  setIndiceAtivo(0)
                }}
                onKeyDown={aoTeclarNaBusca}
                className="pl-8"
              />
            </div>

            <ul
              ref={listaRef}
              id={idLista}
              role="listbox"
              aria-label="Categorias"
              className="max-h-64 overflow-y-auto p-1"
            >
              {opcoes.map((opcao, indice) => {
                const selecionada = opcao.id === valor
                return (
                  <li
                    key={opcao.id ?? 'sem-categoria'}
                    id={idOpcao(indice)}
                    role="option"
                    aria-selected={selecionada}
                    data-ativa={indice === indiceSeguro ? true : undefined}
                    onMouseMove={() => setIndiceAtivo(indice)}
                    onClick={() => escolher(opcao)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                      'data-ativa:bg-accent data-ativa:text-accent-foreground',
                      opcao.id === null && 'text-muted-foreground',
                    )}
                  >
                    <Check
                      className={cn('h-4 w-4 shrink-0', selecionada ? 'opacity-100' : 'opacity-0')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">{rotuloOpcao(opcao)}</span>
                  </li>
                )
              })}
            </ul>

            {naoSelecionavelComMesmoNome ? (
              <OrientacaoCategoriaInativa categoria={naoSelecionavelComMesmoNome} comLink={podeCriar} />
            ) : (
              opcoes.length === 0 && (
                <p className="px-3 pb-3 text-sm text-muted-foreground">
                  Nenhuma categoria encontrada{termo.trim() ? ` para "${termo.trim()}"` : ''}.
                </p>
              )
            )}

            {podeCriar && !termoEhPrincipalExistente && (
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full justify-start"
                  onClick={() => setCriando(true)}
                >
                  <Plus className="h-4 w-4" />
                  Nova categoria{termo.trim() ? `: "${termo.trim()}"` : ''}
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

interface OrientacaoCategoriaInativaProps {
  categoria: Categoria
  /** Link para a tela de Categorias (somente ADMIN, que pode reativar). */
  comLink: boolean
}

/** Explica por que uma categoria com o nome buscado nao aparece na lista. */
function OrientacaoCategoriaInativa({ categoria, comLink }: OrientacaoCategoriaInativaProps) {
  const destino = comLink ? (
    <Link to={ROTA_CATEGORIAS} className="font-medium text-foreground underline underline-offset-4">
      Categorias
    </Link>
  ) : (
    'Categorias'
  )
  return (
    <p className="px-3 pb-3 text-sm text-muted-foreground">
      {categoria.ativo ? (
        <>
          A categoria "{categoria.caminho}" existe, mas está dentro de uma categoria inativa. Reative essa categoria
          em {destino} para usá-la.
        </>
      ) : (
        <>
          A categoria "{categoria.caminho}" existe, mas está inativa. Reative-a em {destino} para usá-la.
        </>
      )}
    </p>
  )
}

interface FormularioNovaCategoriaProps {
  nomeInicial: string
  /** Pais possiveis: so selecionaveis, para a nova categoria poder ser escolhida. */
  categorias: Categoria[]
  onCriada: (categoria: Categoria) => void
  onCancelar: () => void
}

/** Mini-formulario inline: nome (pre-preenchido com o termo buscado) e pai opcional. */
function FormularioNovaCategoria({ nomeInicial, categorias, onCriada, onCancelar }: FormularioNovaCategoriaProps) {
  const queryClient = useQueryClient()
  const idBase = useId()
  const idNome = `${idBase}-nome`
  const idPai = `${idBase}-pai`
  const idErro = `${idBase}-erro`
  const [nome, setNome] = useState(nomeInicial)
  const [parentId, setParentId] = useState(SEM_PAI)
  const [erro, setErro] = useState<string | null>(null)

  const criarMutation = useMutation<Categoria, unknown, CategoriaRequest>({
    mutationFn: (dados) => cadastrarCategoria(dados),
    onSuccess: async (categoria) => {
      onCriada(categoria)
      await queryClient.invalidateQueries({ queryKey: CATEGORIAS_QUERY_KEY })
    },
    onError: (falha) => {
      setErro(mensagemErroCatalogo(falha, TEXTOS_ERRO_CRIAR))
    },
  })

  const aoSubmeter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // O formulario esta num portal, mas o evento React ainda sobe ate o
    // formulario do produto: sem isto, salvaria o produto junto.
    event.stopPropagation()
    const resultado = nomeCategoriaSchema.safeParse(nome)
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? 'Nome inválido.')
      return
    }
    setErro(null)
    criarMutation.mutate({ nome: resultado.data, parentId: parentId === SEM_PAI ? null : parentId })
  }

  const salvando = criarMutation.isPending

  return (
    <form onSubmit={aoSubmeter} noValidate aria-label="Nova categoria" className="space-y-3 p-3">
      <p className="text-sm font-medium">Nova categoria</p>
      <div className="space-y-1.5">
        <label htmlFor={idNome} className="text-sm font-medium">
          Nome da categoria
        </label>
        <Input
          id={idNome}
          autoFocus
          value={nome}
          maxLength={100}
          disabled={salvando}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          onChange={(event) => {
            setNome(event.target.value)
            setErro(null)
          }}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={idPai} className="text-sm font-medium">
          Dentro de (opcional)
        </label>
        <select
          id={idPai}
          value={parentId}
          disabled={salvando}
          onChange={(event) => setParentId(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value={SEM_PAI}>Nenhuma — criar como categoria principal</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.caminho}
            </option>
          ))}
        </select>
      </div>
      {erro && (
        <p id={idErro} role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onCancelar} disabled={salvando}>
          Voltar
        </Button>
        <Button type="submit" size="sm" className="h-9" disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Criar e selecionar
        </Button>
      </div>
    </form>
  )
}
