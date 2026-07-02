# Technical Debt / Pendencias Tecnicas

Este arquivo registra pendencias tecnicas, dividas tecnicas e melhorias internas nao bloqueantes do ERPell.

Os itens abaixo nao devem interromper o fluxo de desenvolvimento, mas precisam ser revisitados em momentos apropriados. Este documento nao substitui o `docs/decision-log.md`: decisoes arquiteturais continuam sendo registradas no decision log.

---

## DT-001 — Reduzir exposicao de setters em Produto

- **ID:** DT-001
- **Modulo:** Produtos
- **Origem:** Etapa 7B1
- **Prioridade:** media
- **Status:** aberto
- **Descricao:** A entidade Produto possui setters publicos. Futuramente, reduzir a visibilidade ou concentrar alteracoes em metodos de dominio pode diminuir o risco de bypass das regras do `ProdutoService`.
- **Impacto:** Nao bloqueia a Etapa 7B2, mas pode afetar manutencao conforme o modulo crescer.
- **Quando revisar:** Apos endpoints de Produtos ou antes de PDV/Estoque.
- **Observacoes:** Manter simples enquanto o modulo ainda esta em construcao inicial.

## DT-002 — Simplificar construcao no metodo cadastrar do ProdutoService

- **ID:** DT-002
- **Modulo:** Produtos
- **Origem:** Etapa 7B1
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** Ha redundancia interna na construcao/cadastro do produto.
- **Impacto:** Nao afeta comportamento, testes ou seguranca.
- **Quando revisar:** Proxima refatoracao pequena do modulo Produtos.
- **Observacoes:** Corrigir apenas quando houver uma oportunidade natural de limpeza no modulo.

## DT-003 — Aplicar validacao de tamanho maximo nos DTOs de Produto

- **ID:** DT-003
- **Modulo:** Produtos
- **Origem:** Etapa 7B1
- **Prioridade:** media
- **Status:** planejado para Etapa 7B2
- **Descricao:** Ao criar os DTOs dos endpoints REST, aplicar Bean Validation de tamanho maximo alinhado aos limites definidos na migration `V3__produtos.sql`.
- **Impacto:** Evita erro de banco por strings maiores que o permitido e melhora a resposta da API.
- **Quando revisar:** Etapa 7B2.
- **Observacoes:** Validacao deve ficar no backend; o frontend pode complementar a experiencia, mas nao substituir a regra de API.

## DT-004 — Warnings conhecidos de fast-refresh no frontend

- **ID:** DT-004
- **Modulo:** Frontend/Base
- **Origem:** Etapas anteriores
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O lint passa, mas ha warnings conhecidos de fast-refresh em `button.tsx` e `useAuth.tsx`.
- **Impacto:** Nao bloqueia build, testes ou fluxo atual.
- **Quando revisar:** Refatoracao frontend futura.
- **Observacoes:** Nao corrigir fora de uma limpeza pequena ou quando o warning passar a atrapalhar o fluxo de desenvolvimento.
