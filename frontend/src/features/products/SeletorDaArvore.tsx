import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ConfiguracaoDaArvore, TextosDaArvore } from '@/features/catalog/cadastrosEmArvore'
import { mensagemErroCatalogo } from '@/features/catalog/catalogoQuery'
import { nomeDaArvoreSchema } from '@/features/catalog/catalogoSchemas'
import { comMaiuscula } from '@/features/catalog/textosCatalogo'
import { casaTermo, filtrarPorTermo, normalizarTexto } from '@/lib/arvoreCategorias'
import { cn } from '@/lib/utils'
import type { ItemDaArvore, ItemDaArvoreRequest, ResumoDaArvore } from '@/types/catalogo'

/** Valor do select de pai que cria o item como principal (parentId null). */
const SEM_PAI = ''

export interface SeletorDaArvoreProps<T extends ItemDaArvore> {
  /** Cadastro (categorias ou marcas): textos, servico e cache. */
  configuracao: ConfiguracaoDaArvore<T>
  /** Lista plana da empresa (todos, inclusive inativos: o seletor oferece so os selecionaveis). */
  itens: T[]
  /** Id do item escolhido; `null` = nenhum. */
  valor: string | null
  /** Item atual do registro em edicao: continua escolhivel mesmo se inativo. */
  valorAtual?: ResumoDaArvore | null
  onChange: (id: string | null) => void
  /**
   * Somente ADMIN: mostra o atalho "+ Nova ..." e o link para a tela do
   * cadastro na orientacao sobre item inativo.
   */
  podeCriar: boolean
  onCriada?: (item: T) => void
  desabilitado?: boolean
  /** Id do botao que abre o seletor (para o `<label htmlFor>` externo). */
  id?: string
  /** Id do rotulo externo: compoe o nome acessivel com o valor atual. */
  idRotulo?: string
  invalido?: boolean
  /** Rotulo da opcao sem item (`null`). Padrao: "Sem categoria"/"Sem marca"; no filtro da lista e "Todas". */
  rotuloSemValor?: string
  /** Sem a opcao "Sem ..." (ex.: ao adicionar uma marca a uma lista, onde escolher "nenhuma" nao faz sentido). */
  semOpcaoVazia?: boolean
  /** Texto do gatilho com `valor` nulo quando nao ha opcao vazia (ex.: "Adicionar marca"). */
  textoSemValor?: string
  /** Itens que nao aparecem como opcao (ex.: as marcas ja escolhidas numa lista). */
  ocultos?: ReadonlySet<string>
  /**
   * Oferece tambem os itens nao selecionaveis (inativos), marcados com
   * "(inativa)". Usado no filtro da lista: produto em categoria inativa
   * continua existindo e precisa ser encontrado.
   */
  incluirInativas?: boolean
  /** Classes extras do gatilho (ex.: altura maior no celular, no filtro da lista). */
  className?: string
}

interface Opcao {
  /** `null` representa "Sem ...". */
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

/**
 * Combobox de um cadastro em arvore (categoria, marca): busca pelo caminho
 * (sem diferenciar acentos), lista so os itens selecionaveis e oferece "Sem
 * ...". Para ADMIN, o atalho "+ Nova ..." cria o item ali mesmo e ja o
 * seleciona. Qualquer nivel pode ser escolhido.
 *
 * Teclado: setas abrem e percorrem a lista, Enter escolhe, Esc fecha e Tab
 * para fora do painel fecha e devolve o foco ao gatilho.
 */
export function SeletorDaArvore<T extends ItemDaArvore>({
  configuracao,
  itens,
  valor,
  valorAtual,
  onChange,
  podeCriar,
  onCriada,
  desabilitado = false,
  id,
  idRotulo,
  invalido,
  rotuloSemValor,
  semOpcaoVazia = false,
  textoSemValor,
  ocultos,
  incluirInativas = false,
  className,
}: SeletorDaArvoreProps<T>) {
  const { textos } = configuracao
  const rotuloVazio = rotuloSemValor ?? `Sem ${textos.singular}`
  const idBase = useId()
  const idGatilho = id ?? `${idBase}-gatilho`
  const idValor = `${idBase}-valor`
  const idLista = `${idBase}-lista`
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  const [criando, setCriando] = useState(false)
  // O item recem-criado so chega na lista apos o refetch; ate la, e lembrado aqui.
  const [criadoAgora, setCriadoAgora] = useState<T | null>(null)
  const listaRef = useRef<HTMLUListElement>(null)
  const conteudoRef = useRef<HTMLDivElement>(null)

  const porId = useMemo(() => {
    const mapa = new Map(itens.map((item) => [item.id, item]))
    if (criadoAgora && !mapa.has(criadoAgora.id)) {
      mapa.set(criadoAgora.id, criadoAgora)
    }
    return mapa
  }, [itens, criadoAgora])

  /** So os ativos (sem ramo inativo): os unicos que podem ser pai de um item novo. */
  const ativos = useMemo(() => [...porId.values()].filter((item) => item.selecionavel), [porId])
  /** O que a lista oferece: os ativos ou, no filtro, tambem os inativos (menos os ocultos). */
  const selecionaveis = useMemo(
    () => (incluirInativas ? [...porId.values()] : ativos).filter((item) => !ocultos?.has(item.id)),
    [porId, incluirInativas, ativos, ocultos],
  )

  /** Item atual nao selecionavel (inativo ou sob ramo inativo): mantido como opcao. */
  const opcaoAtualInativa = useMemo<Opcao | null>(() => {
    if (!valorAtual || selecionaveis.some((item) => item.id === valorAtual.id)) {
      return null
    }
    const conhecido = porId.get(valorAtual.id)
    return {
      id: valorAtual.id,
      rotulo: conhecido?.caminho ?? valorAtual.caminho,
      inativa: conhecido ? !conhecido.selecionavel : false,
    }
  }, [valorAtual, selecionaveis, porId])

  const opcaoVazia = useMemo<Opcao[]>(
    () => (semOpcaoVazia ? [] : [{ id: null, rotulo: rotuloVazio, inativa: false }]),
    [semOpcaoVazia, rotuloVazio],
  )

  const opcoes = useMemo<Opcao[]>(() => {
    const filtradas = filtrarPorTermo(selecionaveis, termo).map<Opcao>((item) => ({
      id: item.id,
      rotulo: item.caminho,
      inativa: !item.selecionavel,
    }))
    const atual = opcaoAtualInativa && casaTermo(opcaoAtualInativa.rotulo, termo) ? [opcaoAtualInativa] : []
    const vazia = termo.trim() === '' ? opcaoVazia : []
    return [...vazia, ...atual, ...filtradas]
  }, [selecionaveis, termo, opcaoAtualInativa, opcaoVazia])

  const textoValor = useMemo(() => {
    if (valor === null) {
      return textoSemValor ?? rotuloVazio
    }
    const conhecido = porId.get(valor)
    if (conhecido) {
      return rotuloOpcao({ id: conhecido.id, rotulo: conhecido.caminho, inativa: !conhecido.selecionavel })
    }
    if (valorAtual && valorAtual.id === valor) {
      return valorAtual.caminho
    }
    return `${comMaiuscula(textos.singular)} selecionada`
  }, [valor, porId, valorAtual, rotuloVazio, textoSemValor, textos.singular])

  // Nome igual (sem diferenciar maiusculas) a um principal selecionavel: ele ja
  // aparece na lista e criar daria nome repetido. Inativos nao contam: a
  // orientacao abaixo explica e "+ Nova" segue disponivel (ex.: como subitem).
  const termoEhPrincipalExistente = useMemo(() => {
    const alvo = chaveDeNome(termo)
    return alvo !== '' && ativos.some((item) => item.parentId === null && chaveDeNome(item.nome) === alvo)
  }, [termo, ativos])

  // Termo igual (sem acento/maiusculas) ao nome de um item fora da lista
  // (inativo ou sob ramo inativo): explica por que ele nao aparece. Prefere o
  // mais raso; ignora o item atual, que ja aparece como opcao "(inativa)".
  const naoSelecionavelComMesmoNome = useMemo(() => {
    const alvo = normalizarTexto(termo)
    // Com os inativos na lista, nao ha o que explicar.
    if (alvo === '' || incluirInativas) {
      return null
    }
    const candidatos = [...porId.values()].filter(
      (item) => !item.selecionavel && item.id !== opcaoAtualInativa?.id && normalizarTexto(item.nome) === alvo,
    )
    return candidatos.sort((a, b) => a.nivel - b.nivel)[0] ?? null
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
    ...opcaoVazia,
    ...(opcaoAtualInativa ? [opcaoAtualInativa] : []),
    ...selecionaveis.map((item) => ({ id: item.id, rotulo: item.caminho, inativa: !item.selecionavel })),
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

  const aoCriar = (item: T) => {
    setCriadoAgora(item)
    onChange(item.id)
    onCriada?.(item)
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
            className,
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
        aria-label={`Escolher ${textos.singular}`}
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
          <FormularioNovoItem
            configuracao={configuracao}
            nomeInicial={termo.trim()}
            pais={ativos}
            onCriado={aoCriar}
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
                aria-label={`Buscar ${textos.singular}`}
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
              aria-label={textos.aba}
              className="max-h-64 overflow-y-auto p-1"
            >
              {opcoes.map((opcao, indice) => {
                const selecionada = opcao.id === valor
                return (
                  <li
                    key={opcao.id ?? 'sem-valor'}
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
              <OrientacaoItemInativo
                item={naoSelecionavelComMesmoNome}
                textos={textos}
                rota={configuracao.rota}
                comLink={podeCriar}
              />
            ) : (
              opcoes.length === 0 && (
                <p className="px-3 pb-3 text-sm text-muted-foreground">
                  Nenhuma {textos.singular} encontrada{termo.trim() ? ` para "${termo.trim()}"` : ''}.
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
                  Nova {textos.singular}
                  {termo.trim() ? `: "${termo.trim()}"` : ''}
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

interface OrientacaoItemInativoProps {
  item: ItemDaArvore
  textos: TextosDaArvore
  rota: string
  /** Link para a tela do cadastro (somente ADMIN, que pode reativar). */
  comLink: boolean
}

/** Explica por que um item com o nome buscado nao aparece na lista. */
function OrientacaoItemInativo({ item, textos, rota, comLink }: OrientacaoItemInativoProps) {
  const destino = comLink ? (
    <Link to={rota} className="font-medium text-foreground underline underline-offset-4">
      {textos.aba}
    </Link>
  ) : (
    textos.aba
  )
  return (
    <p className="px-3 pb-3 text-sm text-muted-foreground">
      {item.ativo ? (
        <>
          A {textos.singular} "{item.caminho}" existe, mas está dentro de uma {textos.singular} inativa. Reative essa{' '}
          {textos.singular} em {destino} para usá-la.
        </>
      ) : (
        <>
          A {textos.singular} "{item.caminho}" existe, mas está inativa. Reative-a em {destino} para usá-la.
        </>
      )}
    </p>
  )
}

interface FormularioNovoItemProps<T extends ItemDaArvore> {
  configuracao: ConfiguracaoDaArvore<T>
  nomeInicial: string
  /** Pais possiveis: so selecionaveis, para o item novo poder ser escolhido. */
  pais: T[]
  onCriado: (item: T) => void
  onCancelar: () => void
}

/** Mini-formulario inline: nome (pre-preenchido com o termo buscado) e pai opcional. */
function FormularioNovoItem<T extends ItemDaArvore>({
  configuracao,
  nomeInicial,
  pais,
  onCriado,
  onCancelar,
}: FormularioNovoItemProps<T>) {
  const { textos } = configuracao
  const queryClient = useQueryClient()
  const idBase = useId()
  const idNome = `${idBase}-nome`
  const idPai = `${idBase}-pai`
  const idErro = `${idBase}-erro`
  const [nome, setNome] = useState(nomeInicial)
  const [parentId, setParentId] = useState(SEM_PAI)
  const [erro, setErro] = useState<string | null>(null)
  const schema = useMemo(() => nomeDaArvoreSchema(textos.singular), [textos.singular])

  const criarMutation = useMutation<T, unknown, ItemDaArvoreRequest>({
    mutationFn: (dados) => configuracao.servico.cadastrar(dados),
    onSuccess: async (item) => {
      onCriado(item)
      await queryClient.invalidateQueries({ queryKey: configuracao.chave })
    },
    onError: (falha) => {
      setErro(
        mensagemErroCatalogo(falha, {
          padrao: `Não foi possível criar a ${textos.singular}. Tente novamente.`,
          naoEncontrado: `A ${textos.singular} pai não existe mais. Escolha outra.`,
          semPermissao: `Somente administradores podem criar ${textos.plural}.`,
        }),
      )
    },
  })

  const aoSubmeter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // O formulario esta num portal, mas o evento React ainda sobe ate o
    // formulario da pagina: sem isto, salvaria o produto junto.
    event.stopPropagation()
    const resultado = schema.safeParse(nome)
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? 'Nome inválido.')
      return
    }
    setErro(null)
    criarMutation.mutate({ nome: resultado.data, parentId: parentId === SEM_PAI ? null : parentId })
  }

  const salvando = criarMutation.isPending

  return (
    <form onSubmit={aoSubmeter} noValidate aria-label={`Nova ${textos.singular}`} className="space-y-3 p-3">
      <p className="text-sm font-medium">Nova {textos.singular}</p>
      <div className="space-y-1.5">
        <label htmlFor={idNome} className="text-sm font-medium">
          Nome da {textos.singular}
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
          <option value={SEM_PAI}>{`Nenhuma — criar como ${textos.singular} principal`}</option>
          {pais.map((pai) => (
            <option key={pai.id} value={pai.id}>
              {pai.caminho}
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
