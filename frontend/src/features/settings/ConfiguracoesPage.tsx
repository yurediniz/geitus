import { FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { SecaoCaixa } from '@/features/settings/SecaoCaixa'
import { useFeedbackDaTela } from '@/hooks/useFeedbackDaTela'

/**
 * Configuracoes da empresa (/configuracoes, so ADMIN: rota sob o AdminRoute e
 * escrita protegida no backend). Pagina com secoes; nesta fase so o Caixa
 * (spec `docs/modules/caixa.md` §6.7).
 */
export function ConfiguracoesPage() {
  const { sucesso, erro, avisos } = useFeedbackDaTela()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">Ajustes da empresa que valem para todos os usuários.</p>
      </div>

      <FeedbackCatalogo sucesso={sucesso} erro={erro} />

      <SecaoCaixa avisos={avisos} />
    </div>
  )
}
