import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

const ABAS = [
  { rotulo: 'Produtos', to: '/produtos' },
  { rotulo: 'Categorias', to: '/produtos/categorias' },
  { rotulo: 'Unidades', to: '/produtos/unidades' },
] as const

/**
 * Sub-navegacao da area de Produtos (abas-rota). O NavLink marca a aba atual
 * com `aria-current="page"`; `end` evita que "Produtos" fique ativo nas
 * sub-rotas. A sidebar continua com um unico item "Produtos".
 */
export function CatalogoNav() {
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
                  isActive
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
