// Configuracao global dos testes (Vitest + Testing Library).
// Adiciona os matchers do jest-dom (ex.: toBeInTheDocument) ao expect do Vitest.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

import { locksFalsos } from '@/test/locksFalsos'

// Web Locks em memoria (o jsdom nao tem): o PDV usa um lock por usuario para ficar em uma aba so.
// Sem isso, o PDV cairia no BroadcastChannel, que no Node e compartilhado entre os workers dos testes.
Object.defineProperty(window.navigator, 'locks', { value: locksFalsos, configurable: true })

afterEach(() => {
  locksFalsos.limpar()
})
