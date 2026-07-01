import { Link } from 'react-router-dom'

/**
 * Pagina exibida para rotas inexistentes.
 */
export function NotFoundPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground">A rota acessada não existe.</p>
      <Link to="/" className="text-primary underline underline-offset-4">
        Voltar para o início
      </Link>
    </div>
  )
}
