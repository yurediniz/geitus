/** Quanto uma leitura pode esperar o servidor antes de ser abortada (pedido travado). */
export const LIMITES_DA_LEITURA = { tempoMaximoMs: 8_000 }

/**
 * Fila das leituras do campo "Código ou nome" (Review Focus 1): cada leitura
 * pede a resolucao na hora (o scanner nao espera a anterior), mas os
 * resultados sao aplicados ao carrinho na ordem das leituras. Assim nenhuma
 * leitura se perde e a ordem das linhas e a ordem dos bipes. A fila conta as
 * leituras pendentes: enquanto houver alguma, a venda nao pode ser paga.
 */
export class FilaDeLeituras {
  private cauda: Promise<void> = Promise.resolve()
  private pendentes = 0

  private readonly aoMudarPendentes: (pendentes: number) => void

  constructor(aoMudarPendentes: (pendentes: number) => void = () => undefined) {
    this.aoMudarPendentes = aoMudarPendentes
  }

  enfileirar<T>(pedido: Promise<T>, aplicar: (resultado: T) => void, falhar: (erro: unknown) => void): void {
    this.mudarPendentes(1)
    this.cauda = this.cauda.then(() =>
      pedido.then(
        (resultado) => this.concluir(() => aplicar(resultado)),
        (erro: unknown) => this.concluir(() => falhar(erro)),
      ),
    )
  }

  /** Quantas leituras ainda nao foram aplicadas. */
  quantasPendentes(): number {
    return this.pendentes
  }

  /** Resolve quando todas as leituras enfileiradas ate agora foram aplicadas. */
  ociosa(): Promise<void> {
    return this.cauda
  }

  private mudarPendentes(delta: number): void {
    this.pendentes += delta
    this.aoMudarPendentes(this.pendentes)
  }

  /** Um erro ao aplicar uma leitura nao pode travar as seguintes. */
  private concluir(acao: () => void): void {
    try {
      acao()
    } catch {
      // A leitura seguinte continua; o erro desta ja foi mostrado (ou nao tinha como ser).
    } finally {
      this.mudarPendentes(-1)
    }
  }
}
