import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { RootLayout } from '@/components/layout/RootLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { CaixaPage } from '@/features/cash-register/CaixaPage'
import { CategoriasPage } from '@/features/catalog/CategoriasPage'
import { EtiquetaBalancaPage } from '@/features/catalog/EtiquetaBalancaPage'
import { MarcasPage } from '@/features/catalog/MarcasPage'
import { UnidadesPage } from '@/features/catalog/UnidadesPage'
import { EmpresaPage } from '@/features/company/EmpresaPage'
import { ClientesPage } from '@/features/customers/ClientesPage'
import { ProdutoPage } from '@/features/products/ProdutoPage'
import { ProdutosListaPage } from '@/features/products/ProdutosListaPage'
import { ConfiguracoesPage } from '@/features/settings/ConfiguracoesPage'
import { FornecedoresPage } from '@/features/suppliers/FornecedoresPage'
import { FornecedorPage } from '@/features/suppliers/FornecedorPage'
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
          { path: 'produtos', element: <ProdutosListaPage /> },
          // Catalogo: leitura a qualquer autenticado; escrita so ADMIN (pagina e backend, DEC-031).
          // Declaradas antes de `produtos/:id` por legibilidade (o ranking do React Router ja prefere o segmento fixo).
          { path: 'produtos/categorias', element: <CategoriasPage /> },
          { path: 'produtos/marcas', element: <MarcasPage /> },
          // Fornecedores: leitura a qualquer autenticado; escrita so ADMIN (pagina e backend).
          { path: 'produtos/fornecedores', element: <FornecedoresPage /> },
          { path: 'produtos/fornecedores/novo', element: <FornecedorPage /> },
          { path: 'produtos/fornecedores/:id', element: <FornecedorPage /> },
          { path: 'produtos/unidades', element: <UnidadesPage /> },
          // Etiqueta de balanca: leitura e teste a qualquer autenticado; salvar so ADMIN (pagina e backend).
          { path: 'produtos/balanca', element: <EtiquetaBalancaPage /> },
          // Pagina do produto: OPERADOR abre em modo leitura; cadastro e escrita so ADMIN (pagina e backend).
          { path: 'produtos/novo', element: <ProdutoPage /> },
          { path: 'produtos/:id', element: <ProdutoPage /> },
          // Clientes: qualquer autenticado (inativar/reativar so ADMIN, controlado na pagina e no backend).
          { path: 'clientes', element: <ClientesPage /> },
          // Caixa: qualquer autenticado opera o proprio caixa; o ADMIN ve e fecha o de outras pessoas (backend).
          { path: 'caixa', element: <CaixaPage /> },
          { path: 'empresa', element: <EmpresaPage /> },
          {
            // Area restrita a ADMIN (RBAC no frontend; o backend tambem exige ADMIN).
            element: <AdminRoute />,
            children: [
              { path: 'usuarios', element: <UsuariosPage /> },
              { path: 'configuracoes', element: <ConfiguracoesPage /> },
            ],
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
