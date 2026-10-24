import { FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { SecaoCaixa } from '@/features/settings/SecaoCaixa'
import { SecaoPdv } from '@/features/settings/SecaoPdv'
import { useFeedbackDaTela } from '@/hooks/useFeedbackDaTela'

/**
 * Configuracoes da empresa (/configuracoes, so ADMIN: rota sob o AdminRoute e
 * escrita protegida no backend). Pagina com secoes: o Caixa (spec
 * `docs/modules/caixa.md` §6.7) e o PDV (spec `docs/modules/pdv.md` §6.6).
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
      <SecaoPdv avisos={avisos} />
    </div>
  )
}
