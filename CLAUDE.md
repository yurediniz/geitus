# CLAUDE.md

## Projeto

**Empresa/marca mãe:** UpeFlow
**Produto:** ERPell
**Repositório:** erpell
**Tipo:** Plataforma SaaS de gestão para pequenos negócios
**Produto inicial:** PDV com ERP básico
**Status:** MVP em desenvolvimento

**Objetivo:** Criar uma plataforma simples, confiável, fluida e inteligente para pequenos negócios operarem vendas, produtos, clientes, caixa, estoque, financeiro básico e relatórios.

---

## Papel do Claude Code neste projeto

Você atua como **engenheiro e orquestrador principal** do ERPell: coordena a execução, a revisão e a validação das tarefas, seguindo rigorosamente as diretrizes deste repositório e apoiando-se em agentes especializados quando necessário.

Como orquestrador, você deve:

* Ler este `CLAUDE.md` antes de executar qualquer tarefa relevante.
* Ler `.claude/agents/AGENTS.md` quando a tarefa envolver uso de agentes.
* Usar os agentes especializados quando a tarefa exigir (ver seção "Agentes especializados").
* Consultar `docs/engineering-guidelines.md` (padrões técnicos) e `docs/decision-log.md` (decisões já tomadas) quando forem relevantes para a implementação, a revisão ou uma decisão.
* Respeitar a separação de papéis: o **executor implementa** e o **reviewer revisa**.
* Garantir que o mesmo agente que implementa **não aprove a própria entrega**.
* Coordenar execução, revisão e validação antes de considerar uma tarefa concluída.
* Manter o projeto incremental, evitando implementar funcionalidades futuras sem especificação.

Ao implementar (diretamente ou via agente executor), você deve:

* Implementar código limpo, organizado e sustentável.
* Seguir a arquitetura definida.
* Respeitar as regras de negócio documentadas.
* Não criar funcionalidades fora do escopo sem solicitação explícita.
* Priorizar consistência, legibilidade e manutenção.
* Criar commits pequenos e claros quando solicitado.
* Sempre revisar impactos antes de alterar arquivos existentes.
* Explicar decisões técnicas relevantes antes de aplicá-las.
* Rodar testes, lint e build quando existirem comandos configurados.

Você não deve:

* Inventar módulos não documentados.
* Adicionar bibliotecas sem justificar.
* Criar telas ou fluxos fora do escopo do MVP.
* Misturar responsabilidades entre frontend, backend e banco.
* Remover código funcional sem explicar.
* Ignorar regras de negócio para facilitar a implementação.
* Implementar funcionalidades futuras sem solicitação explícita.
* Fazer grandes refatorações sem necessidade clara.

---

## Agentes especializados

O ERPell utiliza agentes de projeto do Claude Code para organizar **execução** e **revisão**. Eles ficam em `.claude/agents/` e estão detalhados em `.claude/agents/AGENTS.md`, que deve ser lido quando a tarefa envolver agentes. O `CLAUDE.md` prevalece em caso de conflito.

### Agentes executores (implementam código no seu domínio)

* `back-end-executor`
* `front-end-executor`

### Agentes revisores (apenas revisam — read-only neste momento)

* `back-end-reviewer`
* `front-end-reviewer`
* `product-ux-reviewer`
* `qa-reviewer`
* `security-reviewer`
* `data-reviewer`
* `ci-cd-reviewer`

### Regras de uso

* Agentes executores podem implementar código dentro do seu domínio (backend ou frontend).
* Agentes revisores apenas revisam: apontam riscos, problemas, inconsistências e melhorias. **Não alteram arquivos.**
* `qa-reviewer` e `ci-cd-reviewer` **não usam Bash** neste momento (não executam comandos).
* O mesmo agente que implementa **não deve aprovar** a própria entrega.
* `back-end-reviewer` deve revisar entregas relevantes de backend.
* `front-end-reviewer` deve revisar entregas relevantes de frontend.
* `security-reviewer` é **obrigatório** em tarefas de autenticação, autorização, JWT, senhas, permissões, CORS, dados sensíveis e proteção de rotas.
* `data-reviewer` é **obrigatório** em tarefas com banco de dados, migrations, modelagem, constraints, índices ou integridade.
* `product-ux-reviewer` deve revisar telas, fluxos importantes e decisões que afetem a experiência.
* `ci-cd-reviewer` deve revisar workflows, pipelines e automações.

---

## Contexto da marca

A UpeFlow é a empresa/marca mãe.

O ERPell é o primeiro produto da UpeFlow: um sistema SaaS de gestão com foco em PDV e ERP básico para pequenos negócios.

A proposta do ERPell não é ser o ERP com mais funcionalidades do mercado.
A proposta é fazer o essencial muito bem, com experiência de uso superior, confiabilidade e inteligência prática.

---

## Visão do ERPell

O ERPell existe para tornar simples a gestão de pequenos negócios por meio da tecnologia.

O produto deve atender inicialmente:

* Mercados
* Pet shops
* Lojas de roupas

O sistema deve ser criado com uma base única, mas preparado para pequenas adaptações por segmento no futuro.

---

## Missão

Tornar simples a gestão do negócio por meio da tecnologia.

---

## Visão

Ser a plataforma de gestão mais intuitiva e confiável para pequenos negócios do Brasil.

---

## Princípios de Produto

### Simplicidade

O sistema deve ser fácil de entender e operar.
Funcionalidades complexas devem ser simplificadas na experiência do usuário.

### Confiabilidade

Os dados do negócio são patrimônio do cliente.
Estoque, vendas, caixa e financeiro precisam ser consistentes e rastreáveis.

### Fluidez

O sistema deve responder de forma rápida, previsível e agradável.
Velocidade e interatividade devem andar juntas.

### Inteligência

A tecnologia deve reduzir esforço, evitar retrabalho e sugerir caminhos úteis quando possível.

### Experiência contextual

Cada tela deve respeitar o contexto de uso.

Exemplos:

* PDV: máxima agilidade, foco em scanner, teclado e poucos cliques.
* Dashboard: clareza, leitura rápida e boa hierarquia visual.
* Cadastros: orientação, validação, menos digitação e campos essenciais primeiro.
* Financeiro: segurança, organização e confiança.

---

## Princípios de UX

Toda interface do ERPell deve seguir estes princípios:

* O usuário nunca deve ficar sem saber o que aconteceu.
* A informação mais importante deve aparecer primeiro.
* O sistema deve integrar informações e reduzir digitação.
* A interface deve reduzir erros, não apenas alertar sobre eles.
* Velocidade e interatividade devem andar juntas.
* O sistema deve funcionar para usuários iniciantes e experientes.
* As ações mais frequentes devem exigir o menor número possível de cliques.
* Componentes semelhantes devem se comportar da mesma forma.
* Microinterações devem aumentar confiança, não servir apenas como decoração.

---

## Escopo do MVP

O MVP inicial do ERPell deve conter apenas os módulos essenciais.

### Módulos do MVP

* Autenticação
* Layout principal
* Empresa
* Usuários
* Produtos
* Clientes
* PDV
* Caixa
* Estoque básico
* Financeiro básico
* Dashboard básico
* Relatórios básicos
* Configurações básicas

### Fora do escopo inicial

Não implementar no MVP:

* NF-e
* NFC-e
* SPED
* Contabilidade avançada
* Integração bancária
* Marketplace
* E-commerce
* Aplicativo mobile
* CRM avançado
* Automação de marketing
* WhatsApp integrado
* Multiempresa avançado
* API pública
* Controle fiscal completo
* Serviços
* Agendamento
* Controle de banho e tosa
* Controle de validade
* Controle de lotes
* Grade avançada de roupas
* Múltiplos estoques
* Integrações externas

Essas funcionalidades podem ser previstas para o futuro, mas não devem ser implementadas sem uma especificação própria.

### Plataforma e decisões recentes de escopo

* O MVP continua sendo **PDV com ERP básico**.
* O público inicial são pequenos negócios, principalmente **mercados, pet shops e lojas de roupas**.
* A plataforma principal continua sendo **web/SaaS** neste momento.
* **Serviços** continuam **fora do escopo inicial**.
* **PDV Desktop/offline** é uma possibilidade futura, mas **não deve ser implementado agora**. O PDV deve ser pensado futuramente com atenção ao isolamento das regras de venda e a uma possível execução local/offline, **sem alterar o escopo atual**.
* O objetivo não é criar o ERP com mais funcionalidades, e sim **fazer o essencial muito bem**.

---

## Stack definida para o MVP

### Backend

* Java 21 LTS
* Spring Boot 3.5.x
* Maven via Maven Wrapper (`mvnw`)
* Spring Web
* Spring Data JPA
* Spring Security
* Bean Validation
* PostgreSQL
* Flyway para migrations
* BCrypt para hash de senha (quando a autenticação for implementada)
* JWT para autenticação (quando a autenticação for implementada)
* OpenAPI/Swagger via springdoc-openapi para documentação da API (quando endpoints reais forem implementados)

### Frontend

* Node.js 24 LTS (versão recomendada)
* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* React Router
* React Hook Form
* Zod
* TanStack Query
* Vitest
* Testing Library
* Zustand apenas quando houver necessidade real de estado global

### Banco de Dados

* PostgreSQL

### Versionamento

* Git
* GitHub

---

## Arquitetura inicial recomendada

O projeto deve ser organizado como monorepo:

```text
erpell/
├── backend/
├── frontend/
├── docs/
├── CLAUDE.md
├── README.md
└── .github/
```

### Backend

```text
backend/
├── src/main/java/...
│   ├── config/
│   ├── auth/
│   ├── company/
│   ├── user/
│   ├── product/
│   ├── customer/
│   ├── sale/
│   ├── cashregister/
│   ├── stock/
│   ├── finance/
│   └── shared/
└── src/main/resources/
    ├── application.yml
    └── db/migration/
```

### Frontend

```text
frontend/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── customers/
│   │   ├── pdv/
│   │   ├── cash-register/
│   │   └── finance/
│   ├── hooks/
│   ├── lib/
│   ├── routes/
│   ├── services/
│   ├── styles/
│   └── types/
```

---

## Diretrizes de implementação

### Backend

* Usar arquitetura por domínio/módulo.
* Evitar colocar regras de negócio diretamente nos controllers.
* Controllers devem receber requisições e delegar para services.
* Services devem conter regras de negócio.
* Repositories devem cuidar apenas de acesso a dados.
* DTOs devem ser usados para entrada e saída de dados.
* Entidades JPA não devem ser expostas diretamente na API.
* Validações devem ser feitas com Bean Validation e regras de domínio.
* Toda regra importante deve ser testável.
* Usar migrations para alterações no banco.
* Evitar lógica de negócio em entidades quando isso prejudicar clareza ou teste.
* Preferir nomes explícitos a abreviações.

### Frontend

* Criar componentes reutilizáveis.
* Separar componentes de UI genéricos de componentes específicos de domínio.
* Usar TypeScript de forma rigorosa.
* Evitar `any`.
* Formulários devem usar validação clara.
* Estados de loading, erro, vazio e sucesso devem ser tratados.
* A interface deve ser limpa, moderna e funcional.
* Evitar telas poluídas.
* Campos avançados devem ser ocultados ou agrupados quando possível.
* Não duplicar lógica de API em múltiplos componentes.
* Usar TanStack Query para chamadas assíncronas e cache de dados.
* Usar Zustand apenas para estados globais realmente necessários.

---

## Design e UI

O ERPell deve parecer:

* Simples
* Moderno
* Confiável
* Leve
* Organizado
* Profissional
* Agradável de usar

Evitar:

* Visual legado de ERP antigo
* Excesso de campos na tela
* Tabelas confusas
* Modais desnecessários
* Cores agressivas
* Animações lentas
* Interfaces carregadas demais

### Interações

Toda ação importante deve gerar feedback visual.

Exemplos:

* Produto salvo com sucesso.
* Item adicionado à venda.
* Venda finalizada.
* Caixa aberto.
* Caixa fechado.
* Erro de validação.
* Estoque insuficiente.

Feedbacks devem ser claros e discretos.

### Microinterações

Microinterações são permitidas e desejadas quando reforçam clareza, confiança ou fluidez.

Elas não devem:

* Atrasar fluxos operacionais.
* Bloquear ações frequentes.
* Ser usadas apenas como decoração.
* Prejudicar a velocidade do PDV.

---

## Regras gerais de negócio

### Exclusão de dados

Evitar exclusão física de dados importantes.

Preferir:

* Inativar
* Arquivar
* Cancelar
* Registrar histórico

Nunca apagar permanentemente dados que impactem:

* Vendas
* Estoque
* Caixa
* Financeiro
* Auditoria

### Histórico

Toda ação crítica deve ser rastreável.

Exemplos:

* Criação de produto
* Alteração de preço
* Alteração de estoque
* Venda finalizada
* Venda cancelada
* Abertura de caixa
* Fechamento de caixa
* Entrada financeira
* Saída financeira

### Consistência

Uma informação deve ser cadastrada uma vez e reutilizada quando possível.

Evitar retrabalho e duplicidade.

### Cálculos

O sistema deve calcular automaticamente sempre que possível.

Não solicitar ao usuário valores que podem ser derivados.

Exemplos:

* Total da venda
* Subtotal
* Desconto aplicado
* Troco
* Margem
* Lucro estimado
* Saldo de caixa
* Estoque atual

---

## Módulo Produtos — diretriz inicial

Inicialmente, o ERPell trabalhará apenas com produtos físicos.

Serviços serão tratados futuramente em módulo ou aba separada.

Produto representa um item físico que pode ser:

* Cadastrado
* Vendido
* Movimentado em estoque
* Pesquisado no PDV
* Relacionado a relatórios

Campos essenciais iniciais:

* Nome
* Categoria
* Unidade
* Preço de venda
* Custo
* Estoque inicial
* Estoque mínimo
* Código de barras
* SKU
* Status ativo/inativo

Regras iniciais:

* Produto deve possuir nome.
* Produto deve possuir preço de venda.
* SKU deve ser único.
* Código de barras, quando informado, deve ser único.
* Produto vendido não deve ser excluído fisicamente.
* Produto com movimentação de estoque não deve ser excluído fisicamente.
* Produto inativo não deve aparecer para venda no PDV.
* Estoque atual deve ser calculado por movimentações, não editado diretamente sem histórico.
* Alterações de preço e custo devem gerar histórico futuramente.
* O cadastro inicial deve priorizar campos essenciais e ocultar campos avançados.

---

## Módulo PDV — diretriz inicial

O PDV é uma das telas mais importantes do ERPell.

Deve priorizar:

* Rapidez
* Scanner de código de barras
* Busca por nome
* Teclado
* Poucos cliques
* Feedback imediato
* Visual limpo
* Total sempre visível

Fluxo base:

1. Abrir caixa
2. Iniciar venda
3. Adicionar produtos por scanner ou busca
4. Ajustar quantidade se necessário
5. Aplicar desconto se permitido
6. Selecionar forma de pagamento
7. Confirmar pagamento
8. Finalizar venda
9. Atualizar estoque, caixa, financeiro e relatórios

Não criar complexidades fiscais no MVP.

---

## Módulo Caixa — diretriz inicial

O caixa controla o dinheiro e as movimentações do período.

Regras iniciais:

* Deve existir abertura de caixa.
* Deve existir fechamento de caixa.
* Venda só deve ser finalizada se houver caixa aberto, salvo regra futura em contrário.
* Cada venda deve estar vinculada a um caixa.
* Sangria e reforço podem ser previstos, mas podem ficar para etapa posterior.
* O fechamento deve comparar valores esperados e informados.

---

## Módulo Clientes — diretriz inicial

Cliente representa pessoa que compra da empresa.

Campos iniciais:

* Nome
* Telefone
* WhatsApp
* CPF opcional
* Observações
* Status ativo/inativo

Cliente deve ser opcional na venda, pois muitos mercados realizam venda sem identificação do cliente.

---

## Módulo Financeiro — diretriz inicial

O financeiro do MVP deve ser simples.

Deve controlar:

* Receitas
* Despesas
* Fluxo de caixa básico
* Movimentações originadas por vendas
* Movimentações manuais

Não implementar contabilidade complexa no MVP.

---

## Ordem recomendada de desenvolvimento

Não implementar todos os módulos de uma vez.

Seguir esta ordem:

1. Estrutura inicial do repositório
2. Backend base
3. Frontend base
4. Banco PostgreSQL e migrations
5. Autenticação inicial
6. Layout principal
7. Empresa e usuário inicial
8. Produtos
9. Clientes
10. Caixa
11. PDV
12. Estoque básico
13. Financeiro básico
14. Dashboard básico
15. Relatórios básicos

Cada etapa deve ser implementada, testada e versionada antes de avançar.

---

## Git e GitHub

O projeto deve ser versionado desde o início.

### Branches

Usar preferencialmente:

```text
main
develop
feature/nome-da-feature
fix/nome-do-ajuste
docs/nome-do-documento
```

### Fluxo atual

Durante o desenvolvimento inicial, o fluxo é simplificado:

* Trabalhar **diretamente na branch `develop`**.
* **Não** criar PR para tarefas comuns na `develop`.
* **Não** fazer push para `main`.
* **Não** fazer merge para `main`.
* A branch `main` deve representar **versão estável**.
* PRs serão usados futuramente, principalmente para **promover `develop` → `main`**.

### Regras

* `main` deve representar versão estável.
* `develop` deve concentrar as funcionalidades em desenvolvimento e teste.
* Commits devem ser pequenos, claros e descritivos.
* Evitar commits gigantes com muitas mudanças misturadas.
* Mensagens de commit devem estar em **português do Brasil**.
* Antes de iniciar tarefas, verificar a branch atual e o estado do working tree.
* Antes de finalizar, rodar `git status`.
* Fazer commit somente quando a entrega estiver coerente e validada.

### Padrão de commits

Usar padrão próximo ao Conventional Commits, mantendo a **descrição em português do Brasil**:

```text
feat(products): cria entidade de produto
feat(products): adiciona página de listagem de produtos
fix(products): valida preço de venda
refactor(pdv): simplifica cálculo do item de venda
docs(projeto): atualiza regras de produto
test(products): adiciona testes do service de produto
chore(projeto): configura estrutura do repositório
```

---

## Fluxo de trabalho com Claude Code

Ao iniciar uma tarefa:

1. Ler este `CLAUDE.md`.
2. Ler o documento específico do módulo em `docs/`, se existir.
3. Verificar o estado atual do projeto.
4. Verificar a branch atual.
5. Criar ou usar a branch correta.
6. Implementar a menor parte funcional possível.
7. Rodar lint, testes e build quando aplicável.
8. Explicar o que foi alterado.
9. Sugerir próximos passos.

Antes de implementar, quando a tarefa for grande:

* Dividir em etapas.
* Explicar plano curto.
* Aguardar confirmação se houver ambiguidade importante.

Quando houver conflito entre este documento e uma solicitação solta:

* Priorizar este documento.
* Apontar o conflito.
* Solicitar decisão do usuário.

---

## Protocolo de execução de tarefas

Antes de executar qualquer tarefa relevante, o Claude Code deve revisar o pedido recebido e validar se ele está alinhado ao `CLAUDE.md`, ao `.claude/agents/AGENTS.md` e ao escopo atual do ERPell.

### Avaliação antes de executar

* O objetivo está claro?
* Existe conflito com o escopo do MVP?
* A tarefa exige agente especializado?
* A tarefa envolve backend, frontend, segurança, banco, UX, QA ou CI/CD?
* Há risco de alterar arquitetura, regras de negócio, dependências ou banco de dados?
* Há necessidade de pedir confirmação antes de seguir?

### Pode executar diretamente

Quando a tarefa for clara, segura e limitada, como:

* ajustes simples de documentação;
* correções de lint;
* ajustes pequenos de estilo;
* organização de arquivos;
* melhorias pequenas de README;
* testes simples;
* correções que não alterem arquitetura, segurança, banco ou regras de negócio.

### Deve parar e pedir confirmação

Quando a tarefa envolver:

* nova dependência relevante;
* mudança de stack;
* mudança de arquitetura;
* alteração de banco de dados ou migrations;
* autenticação, autorização, JWT, senhas ou permissões;
* regras de negócio;
* módulos como Produtos, Clientes, PDV, Caixa, Estoque ou Financeiro;
* alteração de escopo do MVP;
* mudança no fluxo de Git;
* alteração relevante em CI/CD;
* decisão técnica com mais de uma alternativa válida.

### Após executar

Apresentar:

* resumo do que foi feito;
* arquivos alterados;
* comandos executados;
* validações realizadas;
* limitações conhecidas;
* sugestões de melhoria.

As sugestões devem ser classificadas em:

* **Aplicar agora:** melhorias pequenas, seguras e alinhadas à tarefa atual.
* **Deixar para depois:** melhorias úteis, mas não necessárias neste momento.
* **Fora do escopo:** ideias que não devem ser implementadas no MVP atual.

O Claude Code **não deve aplicar automaticamente** sugestões que envolvam escopo, arquitetura, segurança, banco, dependências ou regras de negócio.

---

## Qualidade

Sempre que possível, rodar:

### Frontend

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

### Backend com Maven

```bash
./mvnw test
./mvnw verify
```

Caso algum comando não exista ainda, não inventar.
Informar que o comando ainda não foi configurado.

---

## Testes

Priorizar testes para:

* Regras de negócio
* Cálculos de venda
* Estoque
* Caixa
* Validações
* Permissões
* Fluxos críticos

Não é necessário testar tudo no início, mas regras críticas não devem ficar sem cobertura quando implementadas.

---

## Segurança e dados

Desde o início:

* Nunca salvar senhas em texto puro.
* Usar hash de senha (BCrypt quando a autenticação for implementada).
* Proteger rotas autenticadas.
* Validar dados de entrada **no backend** — não confiar apenas no frontend.
* Não expor informações sensíveis desnecessariamente.
* Usar variáveis de ambiente para segredos e configurações sensíveis.
* Nunca commitar senhas, tokens, chaves privadas ou arquivos `.env` com dados reais.
* Separar permissões futuramente por perfil.

Revisores obrigatórios em tarefas sensíveis:

* `security-reviewer` é **obrigatório** em tarefas de autenticação, autorização, JWT, senhas, permissões, CORS, dados sensíveis e proteção de rotas.
* `data-reviewer` é **obrigatório** em tarefas que envolvam banco de dados, migrations e modelagem.

---

## Documentação do projeto

A documentação operacional do desenvolvimento deve ser feita em **Markdown** dentro do repositório.

* **PDFs não** devem ser usados como documentação operacional diária para o Claude Code.
* `docs/` deve concentrar especificações, decisões e módulos.
* `docs/engineering-guidelines.md` reúne os padrões de engenharia, código, arquitetura, testes, segurança e revisão.
* `docs/modules/` deve conter especificações por módulo.
* Decisões importantes devem ser registradas em `docs/decision-log.md`.
* Cada módulo relevante deve ter especificação própria antes de uma implementação significativa.
* A documentação deve ser objetiva, modular e adequada para consumo por IA.

### Dois tipos de documentação

**1. Documentação de produto e arquitetura:**

* `CLAUDE.md`
* `.claude/agents/AGENTS.md`
* `docs/engineering-guidelines.md`
* `docs/decision-log.md`
* `docs/`
* `docs/modules/`

**2. Documentação técnica da API:**

* OpenAPI
* Swagger UI
* `/v3/api-docs`
* `/swagger-ui.html` ou rota equivalente definida pelo springdoc-openapi

### Relação entre os dois tipos

* OpenAPI/Swagger documenta a **API do backend**.
* OpenAPI/Swagger **não substitui** a documentação de regras de negócio, UX, produto ou decisões arquiteturais.
* Swagger UI deve ser habilitado inicialmente para **desenvolvimento**.
* Swagger UI **não** deve ser exposto em **produção** sem decisão explícita futura.
* Endpoints públicos e autenticados devem ser documentados quando forem criados.

---

## Linguagem

* Toda documentação, resumos, commits e descrições devem estar em **português do Brasil**.
* Nomes técnicos inevitáveis podem permanecer em inglês.
* Nomes de bibliotecas, frameworks, comandos e padrões técnicos devem permanecer conforme o ecossistema.

---

## Padrão de resposta esperado do Claude Code

Ao finalizar uma tarefa, responder em **português do Brasil** com:

```text
Resumo:
- O que foi feito.

Arquivos alterados:
- Lista dos principais arquivos.

Comandos executados:
- Comandos rodados (lint, testes, build, git etc.).

Validações realizadas:
- O que foi verificado e revisado (incluindo revisores acionados).

Como testar:
- Passos para validar manualmente.

Observações:
- Limitações conhecidas.

Sugestões de melhoria:
- Aplicar agora: melhorias pequenas, seguras e alinhadas.
- Deixar para depois: úteis, mas não necessárias agora.
- Fora do escopo: não implementar no MVP atual.
```

---

## Regra final

O ERPell deve ser construído de forma incremental.

Primeiro funcionar bem.

Depois ficar mais completo.

Depois escalar.

Não sacrificar a simplicidade do produto por funcionalidades prematuras.
