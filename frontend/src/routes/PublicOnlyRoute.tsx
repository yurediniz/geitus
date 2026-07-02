import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/hooks/useAuth'

/**
 * Guard das rotas publicas exclusivas (ex.: /login). Um usuario ja autenticado
 * e redirecionado para a area principal, evitando reexibir o login.
 */
export function PublicOnlyRoute() {
  const { estaAutenticado } = useAuth()

  if (estaAutenticado) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
