/**
 * `navigator.locks` em memoria para os testes (o jsdom nao tem Web Locks).
 * So o que o PDV usa: lock exclusivo com `ifAvailable`. `segurar` simula a
 * outra aba com o lock; o lock da tela e solto quando o callback termina.
 */
type CallbackDoLock = (lock: { name: string; mode: 'exclusive' } | null) => unknown

export class LocksFalsos {
  private readonly presos = new Set<string>()

  async request(nome: string, opcoes: { ifAvailable?: boolean }, callback: CallbackDoLock): Promise<unknown> {
    if (this.presos.has(nome)) {
      if (opcoes.ifAvailable) {
        return callback(null)
      }
      throw new Error('LocksFalsos: so com ifAvailable.')
    }
    this.presos.add(nome)
    try {
      return await callback({ name: nome, mode: 'exclusive' })
    } finally {
      this.presos.delete(nome)
    }
  }

  /** A "outra aba" pega o lock; devolve a funcao que o solta (fechar a aba). */
  segurar(nome: string): () => void {
    this.presos.add(nome)
    return () => this.presos.delete(nome)
  }

  estaPreso(nome: string): boolean {
    return this.presos.has(nome)
  }

  limpar(): void {
    this.presos.clear()
  }
}

export const locksFalsos = new LocksFalsos()
