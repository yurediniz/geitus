import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { RootLayout } from '@/components/layout/RootLayout'
import { HomePage } from '@/routes/HomePage'
import { NotFoundPage } from '@/routes/NotFoundPage'

/**
 * Rotas publicas (acessiveis sem autenticacao).
 *
 * TODO (Etapa 5 - Autenticacao): adicionar aqui rotas como `/login`,
 * definidas FORA do RootLayout (sem menu/layout autenticado). Nenhuma
 * rota publica existe ainda; a separacao esta preparada para receber
 * essas telas sem reestruturar o router.
 */
const publicRoutes: RouteObject[] = []

/**
 * Rotas privadas (futuramente exigirao autenticacao).
 *
 * Ficam dentro do RootLayout, que fornece o layout autenticado. Novas
 * telas dos modulos (produtos, clientes, PDV, etc.) serao adicionadas
 * como filhas do RootLayout nas proximas etapas.
 *
 * TODO (Etapa 5 - Autenticacao): envolver o RootLayout com um
 * ProtectedRoute/guard de autenticacao. Nenhuma protecao por auth e
 * aplicada agora.
 *
 * A rota curinga (`*` -> NotFoundPage) permanece dentro do RootLayout,
 * mantendo o comportamento atual: qualquer caminho desconhecido exibe a
 * pagina "nao encontrada" com o layout padrao.
 */
const privateRoutes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

/**
 * Configuracao de rotas da aplicacao. As definicoes ficam separadas em
 * rotas publicas e privadas para deixar clara a topologia que sera usada
 * na Etapa 5 (autenticacao). O comportamento atual e identico ao anterior.
 */
export const router = createBrowserRouter([...publicRoutes, ...privateRoutes])
