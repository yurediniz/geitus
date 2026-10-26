# CLAUDE.md

## Produto

**Geitus** é um SaaS de gestão para pequenos negócios (mercados, pet shops e lojas de roupas): **PDV com ERP básico**, web. A proposta é fazer o essencial muito bem — simples, confiável, rápido —, não ter mais funcionalidades que a concorrência. Visão, princípios de produto/UX e diretrizes de design: [`docs/produto.md`](docs/produto.md) (ler em tarefas de tela ou de produto).

**MVP:** autenticação, layout, empresa, usuários, produtos, clientes, caixa, PDV, estoque básico, financeiro básico, dashboard básico, relatórios básicos, configurações. Ordem atual: estoque básico → financeiro → dashboard → relatórios.

**Fora do MVP** (não implementar sem spec própria e decisão do usuário): NF-e/NFC-e/SPED e fiscal, integrações (bancária, marketplace, e-commerce, WhatsApp, API pública), app mobile, CRM/marketing, multiempresa avançado, múltiplos estoques, lotes/validade, grade de roupas, serviços/agendamento, PDV offline.

## Stack e comandos

- **Backend:** Java 21, Spring Boot 3.5, Maven Wrapper, Spring Web/Data JPA/Security/Validation, PostgreSQL 16, Flyway, JWT (jjwt), BCrypt, springdoc (Swagger só em dev), Testcontainers. Pacote `com.geitus.app`, organizado por domínio (`iam`, `company`, `catalog`, `customer`, `supplier`, `inventory`, `cashier`, `sales`, …); pacote de domínio novo só quando o módulo começar.
- **Frontend:** Node 24, React, TypeScript, Vite, Tailwind v4, shadcn/ui, React Router, React Hook Form + Zod, TanStack Query, Vitest + Testing Library. Código por domínio em `frontend/src/features/`.
- **Subir:** `docker start geitus-postgres` · `.\scripts\dev-backend.ps1` (em worktree: `-EnvFile ..\..\..\.env`) · frontend pelo `.claude/launch.json` (porta 5173).
- **Validar backend:** `./mvnw verify` (em `backend/`).
- **Validar frontend:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (em `frontend/`).

## Regras fixas do código

- **Isolamento por empresa (DEC-016):** empresa e perfil vêm sempre do usuário autenticado, nunca de parâmetro; recurso de outra empresa responde **404**.
- **Camadas:** controller fino → service com a regra de negócio → repository só com acesso a dados. DTO na entrada e na saída; entidade JPA nunca sai na API. Validação sempre no backend (Bean Validation + regra de domínio).
- **Dinheiro:** `BigDecimal`, nunca `double`/`float`. Valores derivados (total, troco, saldo, estoque atual) são calculados, nunca digitados nem gravados como verdade paralela.
- **Banco:** toda mudança de schema é uma migration Flyway nova e aditiva; migration aplicada nunca é editada (DEC-020). `ddl-auto: validate`.
- **Dados críticos** (venda, estoque, caixa, financeiro): sem exclusão física — inativar, cancelar ou estornar, com histórico.
- **Segurança:** senha só com BCrypt; segredos só em variáveis de ambiente (`.env` nunca é commitado); erro sem stack trace, SQL ou detalhe interno; nada de PII em log.
- **Frontend:** TypeScript estrito, sem `any`; estados de carregando, erro, vazio e sucesso tratados; chamadas à API via TanStack Query, sem duplicar lógica de API entre componentes.
- **Testes:** regra de negócio, cálculo, validação e isolamento por empresa nascem com teste. Query de repositório é exercida contra Postgres real (Testcontainers), não só com mock.

## Como trabalhar

1. **Plano antes de código.** Toda tarefa que não seja trivial (texto, typo, ajuste de uma linha) começa no plan mode. O plano cabe em uma tela e tem: **Objetivo · Faz · Não faz · Banco/segurança · Execução** (sequencial ou forks, com o contrato entre back e front) **· Pronto quando** (inclui o que o usuário verá na tela). Nada é implementado sem o "ok" do usuário. O plano não vira arquivo versionado.
2. **Escopo fechado.** Implementar só o que está em "Faz". Ideia nova, melhoria percebida ou refatoração fora do plano vira item de "Sugestões" no relatório — nunca código. Se a implementação exigir algo que o plano não previu, **parar e perguntar**.
3. **Sempre parar e perguntar antes de:** adicionar dependência; criar ou alterar migration não prevista no plano; mexer em autenticação, autorização ou dado sensível; mudar regra de negócio ou escopo do MVP.
4. **Fatia pequena.** Cada entrega é uma fatia vertical demonstrável: no máximo uma migration e algo em torno de 15 arquivos. Maior que isso, o plano já nasce dividido em fatias, e cada fatia termina com o usuário vendo o resultado.
5. **Módulo novo começa pela spec.** Antes da primeira fatia, uma spec curta em `docs/modules/` (regras, contrato, o que fica fora), aprovada pelo usuário.
6. **Uma sessão por fatia ou módulo.** O que precisa sobreviver entre sessões fica na spec do módulo (`docs/modules/`), não na conversa.
7. **Bug:** reproduzir, achar a causa, só então corrigir — com um teste que falhava antes.

## Agentes

A sessão principal planeja, implementa, verifica e responde pelo resultado. Um arquivo em `.claude/agents/` só existe se restringe ferramentas ou muda o papel.

- **Execução em paralelo:** só quando o plano aprovado prevê. Usar *fork* (herda o plano e a conversa), com fronteira explícita (ex.: "só `backend/`"). Busca ampla no código: agente `Explore`.
- **`revisor`** — **obrigatório no fim de cada fatia**, antes do relatório. Recebe o plano aprovado e confere o diff: o que estiver fora do plano é bloqueante; inclui as checagens de segurança e de dados quando a fatia toca esses temas.
- **`revisor-ux`** — obrigatório em tela ou fluxo novo/importante. Avalia a tela rodando no navegador.
- Achado bloqueante: corrigir e revisar de novo. Achado não bloqueante: vai para o relatório.

## Pronto quando

- validações de backend e/ou frontend verdes (comandos acima), com a saída conferida;
- mudança de tela verificada no navegador, com screenshot;
- `revisor` (e `revisor-ux`, quando aplicável) sem bloqueante;
- spec do módulo atualizada se a regra mudou; decisão de arquitetura nova registrada no `docs/decision-log.md` em poucas linhas.

## Git

- Trabalhar na `develop` (DEC-006). Sem push nem merge para `main`; sem PR para tarefas comuns.
- Commit só com a entrega validada e o ok do usuário. Commits pequenos, em português do Brasil: `feat(pdv): …`, `fix(caixa): …`, `docs(projeto): …`, `test(…)`, `refactor(…)`, `chore(…)`.
- Antes de começar e antes de terminar: `git status`.

## Relatório

Em português do Brasil, curto:

```text
Resumo: o que foi feito (1–3 linhas).
Arquivos: principais.
Validações: o que rodou e o resultado.
Revisão: achados do revisor e o que foi feito com eles.
Sugestões: ideias fora do plano (não implementadas).
Próximo passo: uma linha.
```

Detalhar mais só quando houver erro de validação, banco, segurança ou pedido do usuário.

## Documentação

Em Markdown e em português do Brasil (nomes técnicos podem ficar em inglês).

- `docs/modules/<módulo>.md` — spec viva de cada módulo (regras e contrato). Ler a do módulo antes de mexer nele.
- `docs/decision-log.md` — decisões de arquitetura e de produto (consultar quando a tarefa tocar uma decisão).
- `docs/engineering-guidelines.md` — padrões de código detalhados (consulta pontual).
- `docs/technical-debt.md` — pendências conhecidas.
- Swagger em `/swagger-ui.html` (só em dev) documenta a API; não substitui a spec do módulo.

Em conflito entre este arquivo e um pedido: apontar o conflito e pedir decisão.
