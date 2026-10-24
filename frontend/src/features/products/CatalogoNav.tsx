import { NavLink, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

const ABAS = [
  { rotulo: 'Produtos', to: '/produtos' },
  { rotulo: 'Categorias', to: '/produtos/categorias' },
  { rotulo: 'Marcas', to: '/produtos/marcas' },
  { rotulo: 'Unidades', to: '/produtos/unidades' },
  { rotulo: 'Balança', to: '/produtos/balanca' },
] as const

/** Pagina de um produto (`/produtos/novo`, `/produtos/:id`): fora das demais abas. */
function ehPaginaDeProduto(pathname: string): boolean {
  return pathname.startsWith('/produtos/') && !ABAS.some((aba) => aba.to !== '/produtos' && pathname.startsWith(aba.to))
}

/**
 * Sub-navegacao da area de Produtos (abas-rota). O NavLink marca a aba atual
 * com `aria-current="page"`; `end` evita que "Produtos" fique ativo nas
 * sub-rotas. Na pagina de um produto, "Produtos" fica destacada so no visual
 * (a pagina atual e o produto, nao a lista). A sidebar continua com um unico
 * item "Produtos".
 */
export function CatalogoNav() {
  const { pathname } = useLocation()
  const destacarProdutos = ehPaginaDeProduto(pathname)
  return (
    <nav aria-label="Catálogo" className="border-b">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {ABAS.map((aba) => (
          <li key={aba.to}>
            <NavLink
              to={aba.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center border-b-2 px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive || (aba.to === '/produtos' && destacarProdutos)
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {aba.rotulo}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
