import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Wallet,
  LineChart,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
  { rotulo: 'Produtos', icone: Package, emBreve: true },
  { rotulo: 'Clientes', icone: Users, emBreve: true },
  { rotulo: 'PDV', icone: ShoppingCart, emBreve: true },
  { rotulo: 'Caixa', icone: Wallet, emBreve: true },
  { rotulo: 'Financeiro', icone: LineChart, emBreve: true },
]

/**
 * Shell principal da aplicacao: uma sidebar fixa com a identidade do ERPell e
 * a area de conteudo, onde as rotas sao renderizadas via <Outlet />.
 */
export function RootLayout() {
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

        <div className="border-t p-4 text-xs text-muted-foreground">
          Versão inicial — MVP em desenvolvimento
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center border-b px-6">
          <span className="font-semibold md:hidden">ERPell</span>
          <span className="hidden text-sm text-muted-foreground md:inline">
            Plataforma de gestão para pequenos negócios
          </span>
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
