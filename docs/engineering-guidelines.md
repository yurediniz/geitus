# Diretrizes de Engenharia — ERPell

## 1. Objetivo

Este documento define os padrões técnicos do ERPell para manter o produto **simples, sustentável, consistente, testável e evolutivo**.

Ele complementa o `CLAUDE.md` (visão de produto, escopo e regras) e o `.claude/agents/AGENTS.md` (papéis de execução e revisão). Em caso de conflito, o `CLAUDE.md` prevalece.

Decisões que motivaram muitas das regras abaixo estão registradas em [`docs/decision-log.md`](decision-log.md).

---

## 2. Princípios gerais de código

* Clareza acima de esperteza.
* Código simples antes de código sofisticado.
* Evitar abstrações prematuras.
* Evitar duplicação relevante, mas sem criar abstrações cedo demais.
* Funções, classes e componentes com responsabilidade clara.
* Nomes explícitos e legíveis.
* Código deve ser fácil de testar.
* Código deve seguir o escopo do MVP.
* Preferir soluções previsíveis a soluções "mágicas".
* Refatorar apenas quando houver benefício claro.

Conceitos que orientam essas escolhas:

* **KISS** — mantenha simples; a solução mais simples que resolve o problema é a preferida.
* **YAGNI** — não implemente o que não é necessário agora.
* **DRY com moderação** — remova duplicação relevante, mas não crie abstrações antes da necessidade real.
* **SOLID de forma pragmática** — aplique os princípios quando trouxerem clareza, não como dogma.
* **Separação de responsabilidades** — cada camada e componente tem um papel bem definido.
* **Baixo acoplamento e alta coesão** — módulos independentes e internamente coerentes.

---

## 3. Padrões de backend (Java + Spring Boot)

* Usar arquitetura por domínio/módulo.
* Controllers **não** devem conter regra de negócio; recebem requisições e delegam para services.
* Services concentram casos de uso e regras de negócio.
* Repositories cuidam apenas de persistência.
* DTOs devem ser usados para entrada e saída da API.
* Entidades JPA **não** devem ser expostas diretamente.
* Validações simples devem usar Bean Validation.
* Validações de negócio devem ficar na camada de service/domínio.
* Usar exceptions claras e um tratador global de erros.
* Usar transações de forma explícita quando fizer sentido.
* Evitar services gigantes.
* Evitar controllers com muita lógica.
* Evitar código duplicado entre módulos.
* Usar `BigDecimal` para valores monetários.
* **Não** usar `double`/`float` para dinheiro.
* **Não** salvar senhas em texto puro.
* **Não** retornar informações sensíveis em responses.
* Usar migrations Flyway para alterações de banco.
* Migrations devem ser versionadas e **não** devem ser alteradas após aplicadas, salvo em fase muito inicial e com justificativa registrada no [`decision-log`](decision-log.md).

---

## 4. Padrões de frontend (React + TypeScript)

* Usar TypeScript de forma rigorosa.
* Evitar `any`.
* Separar componentes genéricos de componentes de domínio.
* Organizar funcionalidades dentro de `features/`.
* Evitar componentes muito grandes.
* Formulários devem usar React Hook Form e Zod quando aplicável.
* Chamadas assíncronas devem usar TanStack Query quando fizer sentido.
* Estados de loading, erro, vazio e sucesso devem ser tratados.
* A UI deve seguir os princípios do ERPell: simplicidade, fluidez, clareza e feedback visual.
* **Não** criar telas poluídas.
* **Não** expor campos avançados sem necessidade.
* Evitar prop drilling excessivo.
* Usar Zustand apenas quando houver real necessidade de estado global.
* Componentes devem ter nomes claros e responsabilidade única.
* Feedbacks de ação devem ser claros e discretos.

---

## 5. Banco de dados e dados

* PostgreSQL como banco principal.
* Flyway para migrations.
* Usar constraints para proteger a integridade.
* Usar índices quando houver justificativa.
* **Não** criar tabelas sem necessidade.
* **Não** criar modelagem complexa antes do escopo exigir.
* Evitar exclusão física de dados importantes.
* Preferir status/inativação/cancelamento quando houver histórico.
* Dados críticos devem ser rastreáveis.
* Estoque, venda, caixa e financeiro devem priorizar consistência.

---

## 6. APIs

* Endpoints devem seguir padrão REST quando aplicável.
* Usar o prefixo `/api`.
* Responses devem ser consistentes.
* Erros devem ter formato padronizado.
* **Não** expor entidades diretamente.
* Validar entrada no backend.
* Documentar APIs com OpenAPI/Swagger (springdoc-openapi) quando endpoints reais forem implementados.
* Swagger/OpenAPI **não substitui** a documentação de regras de negócio, UX, produto ou decisões arquiteturais.

---

## 7. Testes

* Priorizar testes para regras críticas.
* Testar autenticação, validações, cálculos, estoque, caixa, venda e financeiro quando implementados.
* Backend deve ter testes para services e regras de negócio.
* Frontend deve ter testes para componentes e fluxos importantes.
* Testes devem ser claros e úteis, não apenas para aumentar cobertura.
* **Não** criar testes frágeis ou excessivamente acoplados à implementação.

---

## 8. Segurança

* Validar no backend.
* **Nunca** confiar apenas no frontend.
* **Nunca** commitar `.env` com dados reais.
* **Nunca** commitar tokens, senhas ou chaves.
* Usar hash forte para senhas (BCrypt quando a autenticação for implementada).
* O `security-reviewer` deve revisar tarefas sensíveis.
* Mensagens de erro **não** devem expor detalhes internos desnecessários.
* CORS deve ser restrito ao necessário.
* Rotas protegidas devem exigir autenticação quando aplicável.

---

## 9. UX aplicada ao código

Decisões técnicas devem proteger a experiência do usuário:

* Operações frequentes devem ser simples e rápidas.
* Interfaces devem responder com feedback claro.
* O sistema deve reduzir digitação.
* A arquitetura deve permitir evolução sem comprometer a fluidez.
* O PDV deve ser pensado com isolamento suficiente para uma futura possibilidade local/offline, **sem implementar isso agora** (ver DEC-010 no [`decision-log`](decision-log.md)).

---

## 10. Revisão de código

As revisões devem verificar:

* Clareza.
* Simplicidade.
* Escopo.
* Testabilidade.
* Segurança.
* Consistência com o `CLAUDE.md`.
* Consistência com o `.claude/agents/AGENTS.md`.
* Consistência com o `docs/engineering-guidelines.md`.
* Consistência com o `docs/decision-log.md` quando houver decisão relacionada.
* Se houve criação de complexidade prematura.
* Se houve alteração fora do escopo.

---

## 11. O que evitar (antipadrões)

* Código genérico demais antes da necessidade.
* Abstrações prematuras.
* Services gigantes.
* Componentes gigantes.
* Regras de negócio no frontend.
* Regras de negócio em controllers.
* Dados sensíveis em logs.
* Migrations sem necessidade.
* Dependências sem justificativa.
* Telas complexas demais.
* Funcionalidades futuras implementadas antes da hora.

---

## 12. Como agentes devem usar este documento

* **Executores** (`back-end-executor`, `front-end-executor`) devem consultar este documento antes de implementar código relevante.
* **Revisores** devem usar este documento como checklist de revisão.
* O **`security-reviewer`** deve cruzar este documento com tarefas sensíveis (seção 8).
* O **`data-reviewer`** deve cruzar este documento com alterações de banco (seção 5).
* O **`product-ux-reviewer`** deve observar principalmente a seção de UX aplicada ao código (seção 9).

Os papéis e as obrigatoriedades de cada agente estão detalhados em [`.claude/agents/AGENTS.md`](../.claude/agents/AGENTS.md).
