import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Wallet,
  LineChart,
  Building2,
  LogOut,
  Menu,
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

const itensNavegacao: NavItem[] = [
  { rotulo: 'Início', to: '/', icone: LayoutDashboard },
  { rotulo: 'Produtos', to: '/produtos', icone: Package },
  { rotulo: 'Clientes', icone: Users, emBreve: true },
  { rotulo: 'PDV', icone: ShoppingCart, emBreve: true },
  { rotulo: 'Caixa', icone: Wallet, emBreve: true },
  { rotulo: 'Financeiro', icone: LineChart, emBreve: true },
  { rotulo: 'Empresa', to: '/empresa', icone: Building2 },
]

/**
 * Shell principal da aplicacao: uma sidebar fixa (md+) com a identidade do
 * Geitus e a area de conteudo, onde as rotas sao renderizadas via <Outlet />.
 * Em telas estreitas a sidebar da lugar a um drawer aberto pelo botao de menu.
 */
export function RootLayout() {
  const navigate = useNavigate()
  const { usuario, logout } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)

  const aoSair = () => {
    setMenuAberto(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar fixa (desktop). Inalterada no comportamento md+. */}
      <aside className="hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <MarcaGeitus />

        <nav className="flex-1 space-y-1 p-3">
          {itensNavegacao.map((item) => (
            <NavItemLink key={item.rotulo} item={item} />
          ))}
        </nav>

        <RodapeSessao usuario={usuario} aoSair={aoSair} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b px-4 md:px-6">
          {/* Drawer de navegacao (mobile). O Sheet cuida de foco, Esc e aria. */}
          <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:hidden"
                aria-label="Abrir menu de navegação"
              >
                <Menu className="h-5 w-5" />
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

              <RodapeSessao usuario={usuario} aoSair={aoSair} />
            </SheetContent>
          </Sheet>

          <span className="font-brand font-semibold tracking-tight md:hidden">Geitus</span>
          <span className="hidden text-sm text-muted-foreground md:inline">
            Plataforma de gestão para pequenos negócios
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-11 md:hidden" onClick={aoSair}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
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
      end
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
