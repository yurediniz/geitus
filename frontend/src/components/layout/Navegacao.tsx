import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  UserCog,
  ShoppingCart,
  Wallet,
  LineChart,
  Building2,
  LogOut,
  Menu,
  Settings,
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

/** Item de navegacao da sidebar. Itens "emBreve" ainda nao possuem rota. */
interface NavItem {
  rotulo: string
  to?: string
  icone: LucideIcon
  emBreve?: boolean
}

/**
 * Monta os itens da sidebar. "Usuários" (gestao) e "Configurações" so aparecem
 * para ADMIN — o RBAC do backend tambem exige ADMIN nessas rotas (e a rota fica
 * sob o AdminRoute); aqui e apenas a UX de nao expor uma area sem permissao.
 */
function montarItensNavegacao(ehAdmin: boolean): NavItem[] {
  return [
    { rotulo: 'Início', to: '/', icone: LayoutDashboard },
    { rotulo: 'Produtos', to: '/produtos', icone: Package },
    { rotulo: 'Estoque', to: '/estoque', icone: Boxes },
    { rotulo: 'Clientes', to: '/clientes', icone: Users },
    { rotulo: 'PDV', to: '/pdv', icone: ShoppingCart },
    { rotulo: 'Caixa', to: '/caixa', icone: Wallet },
    { rotulo: 'Financeiro', icone: LineChart, emBreve: true },
    { rotulo: 'Empresa', to: '/empresa', icone: Building2 },
    ...(ehAdmin
      ? [
          { rotulo: 'Usuários', to: '/usuarios', icone: UserCog },
          { rotulo: 'Configurações', to: '/configuracoes', icone: Settings },
        ]
      : []),
  ]
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
  const itensNavegacao = montarItensNavegacao(usuario?.perfil === 'ADMIN')

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

        <nav className="flex-1 space-y-1 p-3">
          {itensNavegacao.map((item) => (
            <NavItemLink
              key={item.rotulo}
              item={item}
              onNavigate={() => setMenuAberto(false)}
            />
          ))}
        </nav>

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
  const itensNavegacao = montarItensNavegacao(usuario?.perfil === 'ADMIN')

  return (
    <aside
      className={cn('hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground', !modoFoco && 'md:flex')}
    >
      <MarcaGeitus />

      <nav className="flex-1 space-y-1 p-3">
        {itensNavegacao.map((item) => (
          <NavItemLink key={item.rotulo} item={item} />
        ))}
      </nav>

      <RodapeSessao usuario={usuario} aoSair={sair} />
    </aside>
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
  onNavigate,
}: {
  item: NavItem
  onNavigate?: () => void
}) {
  const Icone = item.icone
  const classeBase = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors'

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
    <NavLink
      to={item.to}
      // So "Início" exige rota exata; os demais ficam ativos nas sub-rotas
      // (ex.: Produtos em /produtos/categorias e /produtos/unidades).
      end={item.to === '/'}
      onClick={() => onNavigate?.()}
      className={({ isActive }) =>
        cn(
          classeBase,
          isActive
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-sidebar-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icone className="h-4 w-4" />
      <span>{item.rotulo}</span>
    </NavLink>
  )
}
