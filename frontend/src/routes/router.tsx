import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { RootLayout } from '@/components/layout/RootLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { EmpresaPage } from '@/features/company/EmpresaPage'
import { ClientesPage } from '@/features/customers/ClientesPage'
import { ProdutosPage } from '@/features/products/ProdutosPage'
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import { AdminRoute } from '@/routes/AdminRoute'
import { HomePage } from '@/routes/HomePage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute'

/**
 * Rotas publicas (acessiveis sem autenticacao), FORA do RootLayout — sem
 * sidebar/layout autenticado.
 *
 * `/login` fica sob o PublicOnlyRoute: um usuario ja autenticado que tente
 * acessa-la e redirecionado para a area principal (`/`).
 */
const publicRoutes: RouteObject[] = [
  {
    element: <PublicOnlyRoute />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
]

/**
 * Rotas privadas: protegidas pelo ProtectedRoute (sem token -> /login) e
 * renderizadas dentro do RootLayout (layout autenticado com sidebar).
 *
 * Novas telas dos modulos (produtos, clientes, PDV, etc.) serao adicionadas
 * como filhas do RootLayout nas proximas etapas.
 */
const privateRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'produtos', element: <ProdutosPage /> },
          // Clientes: qualquer autenticado (inativar/reativar so ADMIN, controlado na pagina e no backend).
          { path: 'clientes', element: <ClientesPage /> },
          { path: 'empresa', element: <EmpresaPage /> },
          {
            // Area restrita a ADMIN (RBAC no frontend; o backend tambem exige ADMIN).
            element: <AdminRoute />,
            children: [{ path: 'usuarios', element: <UsuariosPage /> }],
          },
        ],
      },
    ],
  },
]

/**
 * Rota curinga top-level: qualquer caminho desconhecido cai no NotFound,
 * independentemente de autenticacao. Fica fora dos guards para que uma URL
 * inexistente nao seja confundida com "acesso negado" e redirecionada ao login.
 */
const fallbackRoute: RouteObject = { path: '*', element: <NotFoundPage /> }

/**
 * Configuracao de rotas da aplicacao, separada em rotas publicas, privadas e
 * o fallback de "nao encontrada".
 */
export const router = createBrowserRouter([
  ...publicRoutes,
  ...privateRoutes,
  fallbackRoute,
])
