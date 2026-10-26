/** O campo "Código ou nome": tem sempre o foco e o recebe de volta depois de cada janela e de cada venda. */
export const ID_CAMPO_DE_LEITURA = 'pdv-codigo-ou-nome'

export function focarCampoDeLeitura(): void {
  document.getElementById(ID_CAMPO_DE_LEITURA)?.focus()
}

/** F2: o foco vai ao campo com o texto selecionado (o que se digitar substitui a busca). */
export function selecionarCampoDeLeitura(): void {
  const campo = document.getElementById(ID_CAMPO_DE_LEITURA)
  if (campo instanceof HTMLInputElement) {
    campo.focus()
    campo.select()
  }
}

/** `onCloseAutoFocus` das janelas do PDV: o foco volta ao campo, e nao ao botao que abriu a janela. */
export function devolverFocoAoCampo(event: Event): void {
  event.preventDefault()
  focarCampoDeLeitura()
}
