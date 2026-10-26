import { Outlet, useLocation } from 'react-router-dom'

import { BarraLateral, BotaoSairDoTopo, MenuDeNavegacao } from '@/components/layout/Navegacao'
import { cn } from '@/lib/utils'

/**
 * Shell principal da aplicacao: uma sidebar fixa (md+) com a identidade do
 * Geitus e a area de conteudo, onde as rotas sao renderizadas via <Outlet />.
 * Em telas estreitas a sidebar da lugar a um drawer aberto pelo botao de menu.
 */
export function RootLayout() {
  const { pathname } = useLocation()
  // Modo foco no PDV: sem sidebar nem topo; a barra do proprio PDV traz o botao "Menu" e a venda ganha a tela.
  const modoFoco = pathname === '/pdv' || pathname.startsWith('/pdv/')

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <BarraLateral modoFoco={modoFoco} />

      <div className="flex min-w-0 flex-1 flex-col">
        {!modoFoco && (
          <header className="flex h-16 items-center gap-3 border-b px-4 md:px-6">
            {/* Drawer de navegacao (mobile). */}
            <MenuDeNavegacao className="md:hidden" />

            <span className="font-brand font-semibold tracking-tight md:hidden">Geitus</span>
            <span className="hidden text-sm text-muted-foreground md:inline">
              Plataforma de gestão para pequenos negócios
            </span>
            <BotaoSairDoTopo />
          </header>
        )}

        <main className={cn('flex-1', !modoFoco && 'p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
