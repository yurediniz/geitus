/**
 * Fila das leituras do campo "Código ou nome" (Review Focus 1): cada leitura
 * pede a resolucao na hora (o scanner nao espera a anterior), mas os
 * resultados sao aplicados ao carrinho na ordem das leituras. Assim nenhuma
 * leitura se perde e a ordem das linhas e a ordem dos bipes.
 */
export class FilaDeLeituras {
  private cauda: Promise<void> = Promise.resolve()

  enfileirar<T>(pedido: Promise<T>, aplicar: (resultado: T) => void, falhar: (erro: unknown) => void): void {
    this.cauda = this.cauda.then(() =>
      pedido.then(
        (resultado) => this.semQuebrar(() => aplicar(resultado)),
        (erro: unknown) => this.semQuebrar(() => falhar(erro)),
      ),
    )
  }

  /** Resolve quando todas as leituras enfileiradas ate agora foram aplicadas. */
  ociosa(): Promise<void> {
    return this.cauda
  }

  /** Um erro ao aplicar uma leitura nao pode travar as seguintes. */
  private semQuebrar(acao: () => void): void {
    try {
      acao()
    } catch {
      // A leitura seguinte continua; o erro desta ja foi mostrado (ou nao tinha como ser).
    }
  }
}
