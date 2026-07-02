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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

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
 * Shell principal da aplicacao: uma sidebar fixa com a identidade do ERPell e
 * a area de conteudo, onde as rotas sao renderizadas via <Outlet />.
 */
export function RootLayout() {
  const navigate = useNavigate()
  const { usuario, logout } = useAuth()

  const aoSair = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">
            E
          </span>
          <div className="leading-tight">
            <p className="font-semibold">ERPell</p>
            <p className="text-xs text-muted-foreground">UpeFlow</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {itensNavegacao.map((item) => (
            <NavItemLink key={item.rotulo} item={item} />
          ))}
        </nav>

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
          <p className="text-xs text-muted-foreground">
            Versão inicial — MVP em desenvolvimento
          </p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center border-b px-6">
          <span className="font-semibold md:hidden">ERPell</span>
          <span className="hidden text-sm text-muted-foreground md:inline">
            Plataforma de gestão para pequenos negócios
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto md:hidden"
            onClick={aoSair}
          >
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

/** Renderiza um link ativo (com rota) ou um item desabilitado ("em breve"). */
function NavItemLink({ item }: { item: NavItem }) {
  const Icone = item.icone
  const classeBase = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors'

  if (item.emBreve || !item.to) {
    return (
      <div
        className={cn(classeBase, 'cursor-not-allowed text-muted-foreground/60')}
        title="Disponível em breve"
        aria-disabled="true"
      >
        <Icone className="h-4 w-4" />
        <span>{item.rotulo}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide">em breve</span>
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      end
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
