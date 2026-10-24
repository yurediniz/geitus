/** Aviso fixo do topo da tela do caixa: recebe o foco quando a sessao muda e a tela troca. */
export const ID_AVISO_DO_CAIXA = 'caixa-aviso'

/**
 * `onCloseAutoFocus` das janelas do caixa: se a tela ja moveu o foco para fora
 * da janela (o titulo do resumo ou o aviso, quando o caixa aberto desmonta),
 * a janela nao o devolve ao botao que a abriu. Sem isso, o foco segue o padrao.
 */
export function manterFocoMovidoPelaTela(event: Event): void {
  const ativo = document.activeElement
  if (ativo && ativo !== document.body) {
    event.preventDefault()
  }
}
