import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  UserCog,
  ShoppingCart,
  Wallet,
  ReceiptText,
  LineChart,
  Building2,
  LogOut,
  Menu,
  FolderTree,
  Tag,
  Truck,
  Ruler,
  Scale,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { TrocarSenhaSheet } from '@/features/usuarios/TrocarSenhaSheet'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { Usuario } from '@/types/auth'

/**
 * Item de navegacao da sidebar. Itens "emBreve" ainda nao possuem rota.
 * `rotaExata`: so fica ativo na propria rota (sem as sub-rotas).
 */
interface NavItem {
  rotulo: string
  to?: string
  icone: LucideIcon
  emBreve?: boolean
  rotaExata?: boolean
}

/** Um item solto ou uma secao com titulo (que recolhe) e itens. */
type BlocoDeNavegacao =
  | { tipo: 'item'; item: NavItem }
  | { tipo: 'secao'; id: string; titulo: string; itens: NavItem[] }

/** Sub-rotas do catalogo que tem item proprio no menu (fora delas, `/produtos/...` e a pagina de um produto). */
const AREAS_DO_CATALOGO = ['/produtos/categorias', '/produtos/marcas', '/produtos/fornecedores', '/produtos/unidades']

/** Pagina de um produto (`/produtos/novo`, `/produtos/:id`): "Produtos" fica ativo, como na lista. */
function ehPaginaDeProduto(pathname: string): boolean {
  return pathname.startsWith('/produtos/') && !AREAS_DO_CATALOGO.some((area) => pathname.startsWith(area))
}

/** O item esta ativo na rota atual? */
function estaAtivo(item: NavItem, pathname: string): boolean {
  if (!item.to) {
    return false
  }
  if (item.to === '/produtos') {
    return pathname === '/produtos' || ehPaginaDeProduto(pathname)
  }
  if (item.to === '/' || item.rotaExata) {
    return pathname === item.to
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/**
 * Monta o menu em secoes (Vendas, Catalogo, Configuracoes) e itens soltos.
 * "Usuários", "Caixa e PDV" e "Balança" so aparecem para ADMIN — o backend
 * tambem exige ADMIN nessas rotas (e elas ficam sob o AdminRoute); aqui e
 * apenas a UX de nao expor uma area sem permissao.
 */
function montarBlocosDeNavegacao(ehAdmin: boolean): BlocoDeNavegacao[] {
  return [
    { tipo: 'item', item: { rotulo: 'Início', to: '/', icone: LayoutDashboard } },
    {
      tipo: 'secao',
      id: 'vendas',
      titulo: 'Vendas',
      itens: [
        { rotulo: 'PDV', to: '/pdv', icone: ShoppingCart },
        { rotulo: 'Caixa', to: '/caixa', icone: Wallet },
        { rotulo: 'Vendas', to: '/vendas', icone: ReceiptText },
      ],
    },
    {
      tipo: 'secao',
      id: 'catalogo',
      titulo: 'Catálogo',
      itens: [
        { rotulo: 'Produtos', to: '/produtos', icone: Package },
        { rotulo: 'Estoque', to: '/estoque', icone: Boxes },
        { rotulo: 'Categorias', to: '/produtos/categorias', icone: FolderTree, rotaExata: true },
        { rotulo: 'Marcas', to: '/produtos/marcas', icone: Tag, rotaExata: true },
        // Fornecedores continua ativo na pagina de um fornecedor (sub-rotas).
        { rotulo: 'Fornecedores', to: '/produtos/fornecedores', icone: Truck },
        { rotulo: 'Unidades', to: '/produtos/unidades', icone: Ruler, rotaExata: true },
      ],
    },
    { tipo: 'item', item: { rotulo: 'Clientes', to: '/clientes', icone: Users } },
    { tipo: 'item', item: { rotulo: 'Financeiro', icone: LineChart, emBreve: true } },
    {
      tipo: 'secao',
      id: 'configuracoes',
      titulo: 'Configurações',
      itens: [
        { rotulo: 'Empresa', to: '/empresa', icone: Building2 },
        ...(ehAdmin
          ? [
              { rotulo: 'Usuários', to: '/usuarios', icone: UserCog },
              { rotulo: 'Caixa e PDV', to: '/configuracoes', icone: SlidersHorizontal, rotaExata: true },
              { rotulo: 'Balança', to: '/configuracoes/balanca', icone: Scale, rotaExata: true },
            ]
          : []),
      ],
    },
  ]
}

/** Chave das secoes recolhidas no navegador (so conveniencia: sem ela, tudo aberto). */
const CHAVE_SECOES_RECOLHIDAS = 'geitus.menu.recolhidas'

function lerSecoesRecolhidas(): string[] {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(CHAVE_SECOES_RECOLHIDAS) ?? '[]')
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function guardarSecoesRecolhidas(ids: readonly string[]) {
  try {
    localStorage.setItem(CHAVE_SECOES_RECOLHIDAS, JSON.stringify(ids))
  } catch {
    // Sem armazenamento (aba privada, bloqueado): o menu so volta aberto na proxima vez.
  }
}

/** Sair: encerra a sessao e volta ao login. */
function useSair() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  return () => {
    logout()
    navigate('/login', { replace: true })
  }
}

export interface MenuDeNavegacaoProps {
  /** Mostra "Menu" ao lado do icone (modo foco do PDV, onde a sidebar fica recolhida). */
  comRotulo?: boolean
  className?: string
}

/**
 * O drawer de navegacao (o Sheet cuida de foco, Esc e aria), aberto pelo
 * botao de menu: no topo do layout em telas estreitas e na barra do PDV.
 */
export function MenuDeNavegacao({ comRotulo = false, className }: MenuDeNavegacaoProps) {
  const { usuario } = useAuth()
  const sair = useSair()
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size={comRotulo ? 'default' : 'icon'}
          className={cn(comRotulo ? 'h-11 gap-2 px-3' : 'size-11', className)}
          aria-label="Abrir menu de navegação"
        >
          <Menu className="h-5 w-5" />
          {comRotulo && <span>Menu</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetTitle asChild>
          <div>
            <MarcaGeitus />
          </div>
        </SheetTitle>
        <SheetDescription className="sr-only">
          Menu de navegação principal do Geitus
        </SheetDescription>

        <ListaDeNavegacao
          ehAdmin={usuario?.perfil === 'ADMIN'}
          idBase="menu"
          onNavigate={() => setMenuAberto(false)}
        />

        <RodapeSessao
          usuario={usuario}
          aoSair={() => {
            setMenuAberto(false)
            sair()
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

/**
 * A sidebar fixa (md+) com a identidade do Geitus. No modo foco (PDV) fica
 * recolhida: a barra do PDV traz o botao "Menu".
 */
export function BarraLateral({ modoFoco }: { modoFoco: boolean }) {
  const { usuario } = useAuth()
  const sair = useSair()

  return (
    <aside
      // Altura da tela e presa no topo: o menu rola por dentro e o rodape (usuario, Sair) fica sempre visivel.
      className={cn(
        'hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen',
        !modoFoco && 'md:flex',
      )}
    >
      <MarcaGeitus />

      <ListaDeNavegacao ehAdmin={usuario?.perfil === 'ADMIN'} idBase="barra" />

      <RodapeSessao usuario={usuario} aoSair={sair} />
    </aside>
  )
}

/**
 * O menu em secoes, o mesmo na sidebar e no drawer. O titulo de cada secao
 * recolhe e expande (lembrado no navegador); a secao do item ativo abre
 * sozinha ao chegar na pagina, e so fica fechada se for recolhida ali mesmo.
 */
function ListaDeNavegacao({
  ehAdmin,
  idBase,
  onNavigate,
}: {
  ehAdmin: boolean
  /** Prefixo dos ids das listas (a sidebar e o drawer podem estar no DOM ao mesmo tempo). */
  idBase: string
  onNavigate?: () => void
}) {
  const { pathname, key: visita } = useLocation()
  const blocos = montarBlocosDeNavegacao(ehAdmin)
  const [recolhidas, setRecolhidas] = useState<string[]>(lerSecoesRecolhidas)
  // Em que visita (a `key` da navegacao, nova a cada uma, inclusive ao voltar a mesma pagina) cada secao
  // foi recolhida: a secao do item ativo so fica fechada na visita em que o usuario a recolheu.
  const [recolhidaEm, setRecolhidaEm] = useState<Record<string, string>>({})
  const navRef = useRef<HTMLElement>(null)

  // A cada pagina, o menu rola (por dentro) ate o item ativo: em telas baixas ele pode estar abaixo da dobra.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [visita])

  const alternar = (id: string, aberta: boolean) => {
    const proximas = aberta ? [...recolhidas.filter((item) => item !== id), id] : recolhidas.filter((item) => item !== id)
    setRecolhidas(proximas)
    setRecolhidaEm((atual) => ({ ...atual, [id]: visita }))
    guardarSecoesRecolhidas(proximas)
  }

  return (
    <nav ref={navRef} aria-label="Menu principal" className="flex-1 space-y-1 overflow-y-auto p-3">
      {blocos.map((bloco, indice) => {
        if (bloco.tipo === 'item') {
          // Item solto logo depois de uma secao ganha o mesmo respiro: nao parece fazer parte dela.
          const depoisDeSecao = indice > 0 && blocos[indice - 1].tipo !== 'item'
          return (
            <div key={bloco.item.rotulo} className={cn(depoisDeSecao && 'pt-2')}>
              <NavItemLink item={bloco.item} ativo={estaAtivo(bloco.item, pathname)} onNavigate={onNavigate} />
            </div>
          )
        }
        const temAtivo = bloco.itens.some((item) => estaAtivo(item, pathname))
        const aberta =
          !recolhidas.includes(bloco.id) || (temAtivo && recolhidaEm[bloco.id] !== visita)
        const idLista = `${idBase}-secao-${bloco.id}`
        // Recolhida com a pagina atual dentro: o titulo fica destacado, para o usuario saber onde esta.
        const ativaRecolhida = temAtivo && !aberta
        return (
          <div key={bloco.id} className="pt-2">
            <button
              type="button"
              id={`${idLista}-titulo`}
              aria-expanded={aberta}
              aria-controls={idLista}
              onClick={() => alternar(bloco.id, aberta)}
              className={cn(
                'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-8',
                ativaRecolhida && 'text-primary',
              )}
            >
              <span>{bloco.titulo}</span>
              {ativaRecolhida && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  <span className="sr-only">(página atual)</span>
                </>
              )}
              <ChevronDown
                className={cn('ml-auto h-4 w-4 transition-transform', !aberta && '-rotate-90')}
                aria-hidden="true"
              />
            </button>
            <div id={idLista} role="group" aria-labelledby={`${idLista}-titulo`} hidden={!aberta} className="space-y-1">
              {bloco.itens.map((item) => (
                <NavItemLink key={item.rotulo} item={item} ativo={estaAtivo(item, pathname)} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

/** O "Sair" do topo em telas estreitas. */
export function BotaoSairDoTopo() {
  const sair = useSair()
  return (
    <Button variant="ghost" size="sm" className="ml-auto h-11 md:hidden" onClick={sair}>
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  )
}

/** Cabecalho de marca reutilizado pela sidebar e pelo topo do drawer. */
function MarcaGeitus() {
  return (
    <div className="flex h-16 items-center gap-2 border-b px-6">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
        G
      </span>
      <div className="leading-tight">
        <p className="font-brand text-lg font-semibold tracking-tight">Geitus</p>
      </div>
    </div>
  )
}

/**
 * Bloco de sessao (usuario/empresa + acao de sair) reutilizado pela sidebar e
 * pelo drawer. Fica no rodape da navegacao.
 */
function RodapeSessao({
  usuario,
  aoSair,
}: {
  usuario: Usuario | null
  aoSair: () => void
}) {
  return (
    <div className="space-y-3 border-t p-4">
      {usuario && (
        <div className="leading-tight">
          <p
            className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground"
            title={usuario.empresa.nome}
          >
            {usuario.empresa.nome}
          </p>
          <p className="truncate text-sm font-medium" title={usuario.nome}>
            {usuario.nome}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={usuario.email}>
            {usuario.email}
          </p>
        </div>
      )}
      {usuario && <TrocarSenhaSheet />}
      <Button variant="outline" size="sm" className="w-full" onClick={aoSair}>
        <LogOut className="h-4 w-4" />
        Sair
      </Button>
      <p className="text-xs text-muted-foreground">Versão inicial — MVP em desenvolvimento</p>
    </div>
  )
}

/**
 * Renderiza um link ativo (com rota) ou um item desabilitado ("em breve").
 * `onNavigate` permite ao drawer mobile fechar-se ao escolher um item.
 */
function NavItemLink({
  item,
  ativo,
  onNavigate,
}: {
  item: NavItem
  ativo: boolean
  onNavigate?: () => void
}) {
  const Icone = item.icone
  const classeBase =
    'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-0'

  if (item.emBreve || !item.to) {
    return (
      <div
        className={cn(
          classeBase,
          'cursor-not-allowed select-none text-muted-foreground/60 active:bg-foreground/5',
        )}
        title="Disponível em breve"
        aria-disabled="true"
      >
        <Icone className="h-4 w-4" />
        <span>{item.rotulo}</span>
        <span className="ml-auto rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          em breve
        </span>
      </div>
    )
  }

  return (
    // O ativo vem de `estaAtivo` (nao do NavLink): "Produtos" fica ativo na pagina de um
    // produto, mas nao em /produtos/categorias, que tem item proprio.
    <Link
      to={item.to}
      aria-current={ativo ? 'page' : undefined}
      onClick={() => onNavigate?.()}
      className={cn(
        classeBase,
        ativo
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-sidebar-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icone className="h-4 w-4" />
      <span>{item.rotulo}</span>
    </Link>
  )
}
