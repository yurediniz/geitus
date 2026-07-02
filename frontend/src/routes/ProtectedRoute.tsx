import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/hooks/useAuth'

/**
 * Guard das rotas privadas. Sem token, redireciona para /login; com token,
 * renderiza a area privada (via <Outlet />).
 */
export function ProtectedRoute() {
  const { estaAutenticado } = useAuth()

  if (!estaAutenticado) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
