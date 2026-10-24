import { useMemo, useState } from 'react'

/** Acoes para avisar o resultado de uma acao no feedback fixo do topo da tela. */
export interface AvisosDaTela {
  sucesso: (mensagem: string) => void
  erro: (mensagem: string) => void
  limpar: () => void
}

/**
 * Estado do feedback fixo no topo (`FeedbackCatalogo`, sem toast): uma
 * mensagem de cada vez; um aviso novo substitui o anterior. `avisos` e estavel
 * entre renders (pode ir para dependencias e callbacks de mutacao).
 */
export function useFeedbackDaTela() {
  const [feedback, setFeedback] = useState<{ sucesso: string | null; erro: string | null }>({
    sucesso: null,
    erro: null,
  })
  const avisos = useMemo<AvisosDaTela>(
    () => ({
      sucesso: (mensagem) => setFeedback({ sucesso: mensagem, erro: null }),
      erro: (mensagem) => setFeedback({ sucesso: null, erro: mensagem }),
      limpar: () => setFeedback({ sucesso: null, erro: null }),
    }),
    [],
  )
  return { sucesso: feedback.sucesso, erro: feedback.erro, avisos }
}
