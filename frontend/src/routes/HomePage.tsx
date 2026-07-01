import { BackendStatus } from '@/components/BackendStatus'

/**
 * Pagina inicial do ERPell. Apresenta a plataforma e o status do backend.
 * As telas dos modulos (produtos, clientes, PDV, etc.) serao adicionadas
 * nas proximas etapas.
 */
export function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ERPell — Plataforma de gestão
        </h1>
        <p className="mt-1 text-muted-foreground">
          Gestão simples e confiável para pequenos negócios. Esta é a base inicial da
          interface; os módulos serão liberados progressivamente.
        </p>
      </div>

      <BackendStatus />
    </div>
  )
}
