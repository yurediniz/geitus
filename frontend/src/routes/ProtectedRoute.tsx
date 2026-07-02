import { Navigate, Outlet } from 'react-router-dom'

import { SessionLoading } from '@/components/SessionLoading'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guard das rotas privadas. Enquanto a sessao esta sendo revalidada no boot,
 * mostra um indicador de carregamento (evita decidir o redirect cedo demais).
 * Sem token, redireciona para /login; com token valido, renderiza a area
 * privada (via <Outlet />).
 */
export function ProtectedRoute() {
  const { estaAutenticado, carregandoSessao } = useAuth()

  if (carregandoSessao) {
    return <SessionLoading />
  }

  if (!estaAutenticado) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
