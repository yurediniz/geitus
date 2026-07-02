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
- **Status:** finalizado
- **Descricao:** Ao criar os DTOs dos endpoints REST, aplicar Bean Validation de tamanho maximo alinhado aos limites definidos na migration `V3__produtos.sql`.
- **Impacto:** Evita erro de banco por strings maiores que o permitido e melhora a resposta da API.
- **Quando revisar:** Etapa 7B2.
- **Observacoes:** Resolvido na Etapa 7B2. `ProdutoRequest` aplica `@Size` em nome (150), categoria (100), unidade (20), codigoBarras e sku (50), alinhado exatamente aos limites da migration `V3__produtos.sql`, com teste cobrindo campo acima do tamanho maximo em `ProdutoControllerTest`.

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

## DT-005 — Simplificar caminhos duplicados no ProdutoService

- **ID:** DT-005
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** media
- **Status:** aberto
- **Descricao:** Os endpoints REST passaram a usar metodos `*ParaUsuario`, que resolvem a empresa a partir do usuario autenticado, mas os metodos antigos por `empresaId` (da Etapa 7B1) foram mantidos e ficaram sem consumidor externo, gerando dois caminhos publicos para a mesma regra de negocio.
- **Impacto:** Nao afeta seguranca (o isolamento por empresa continua correto), mas aumenta a superficie publica do service e pode confundir futuros consumidores.
- **Quando revisar:** Antes de outros modulos (Caixa, PDV, Estoque) passarem a depender do `ProdutoService`.
- **Observacoes:** Reduzir para um unico caminho publico (`*ParaUsuario`), tornando os metodos por `empresaId` privados ou removendo-os apos confirmar que os testes de service nao dependem deles diretamente.

## DT-006 — Validar casas decimais de estoqueMinimo no ProdutoRequest

- **ID:** DT-006
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** A coluna `estoque_minimo` e `NUMERIC(12,3)`, mas o DTO `ProdutoRequest` nao possui `@Digits(integer = 12, fraction = 3)` para barrar excesso de casas decimais antes de chegar ao banco.
- **Impacto:** Um valor com mais de 3 casas decimais cairia como erro generico de banco/handler, em vez de um 400 amigavel.
- **Quando revisar:** Proxima manutencao pequena dos DTOs de Produto.
- **Observacoes:** Adicionar `@Digits` alinhado a migration `V3__produtos.sql`.

## DT-007 — Cobrir teste de codigo de barras duplicado no ProdutoControllerTest

- **ID:** DT-007
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O `ProdutoControllerTest` cobre SKU duplicado no cadastro e na atualizacao, mas nao ha teste simetrico para codigo de barras duplicado, embora a regra de negocio trate os dois campos da mesma forma.
- **Impacto:** Nao afeta comportamento; e uma lacuna pequena de cobertura de teste no controller.
- **Quando revisar:** Proxima manutencao pequena dos testes de Produtos.
- **Observacoes:** A regra em si ja e coberta no `ProdutoServiceTest` (Etapa 7B1); a lacuna e apenas no nivel de contrato HTTP.

## DT-008 — Completar testes de 401 para os endpoints de Produtos

- **ID:** DT-008
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O `ProdutoControllerTest` cobre 401 sem token para listar e cadastrar, mas nao ha teste explicito de 401 para buscarPorId, atualizar, inativar e reativar. O comportamento e garantido pela configuracao global de seguranca, mas sem teste dedicado por endpoint.
- **Impacto:** Baixo risco de regressao silenciosa se a configuracao global de seguranca mudar no futuro.
- **Quando revisar:** Proxima manutencao pequena dos testes de Produtos.
- **Observacoes:** Reforca a protecao contra regressao futura, sem exigir mudanca de comportamento agora.

## DT-009 — Avaliar indice para busca textual de produtos se o volume crescer

- **ID:** DT-009
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O filtro de busca (`GET /api/produtos?busca=`) usa `LIKE` sobre nome/SKU/codigo de barras, que nao aproveita indice B-tree padrao para buscas por substring.
- **Impacto:** Aceitavel para o volume esperado do MVP (poucos milhares de produtos por empresa); pode degradar performance se o catalogo crescer muito.
- **Quando revisar:** Quando houver indicio real de lentidao na busca de produtos.
- **Observacoes:** Considerar indice trigram (`pg_trgm`) ou full-text search do PostgreSQL; nao ha necessidade agora.
