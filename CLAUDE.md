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

Você está atuando como engenheiro de software responsável por implementar o ERPell seguindo rigorosamente as diretrizes deste repositório.

Você deve:

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

---

## Stack definida para o MVP

### Backend

* Java
* Spring Boot
* Spring Web
* Spring Data JPA
* Spring Security
* JWT para autenticação
* Bean Validation
* PostgreSQL
* Flyway para migrations
* Maven como gerenciador de dependências

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* React Router
* React Hook Form
* Zod
* TanStack Query
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

### Regras

* `main` deve representar versão estável.
* `develop` deve concentrar funcionalidades em teste.
* Cada funcionalidade deve ser feita em branch própria.
* Commits devem ser pequenos e descritivos.
* Evitar commits gigantes com muitas mudanças misturadas.
* Antes de iniciar uma nova feature, verificar a branch atual.
* Antes de commitar, revisar arquivos alterados.

### Padrão de commits

Usar padrão próximo ao Conventional Commits:

```text
feat(products): create product entity
feat(products): add product listing page
fix(products): validate sale price
refactor(pdv): simplify sale item calculation
docs(project): update product rules
test(products): add product service tests
chore(project): configure repository structure
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

## Segurança básica

Desde o início:

* Nunca salvar senhas em texto puro.
* Usar hash de senha.
* Proteger rotas autenticadas.
* Validar dados de entrada.
* Não confiar apenas no frontend.
* Não expor informações sensíveis desnecessariamente.
* Separar permissões futuramente por perfil.
* Não commitar senhas, tokens, chaves privadas ou arquivos `.env` com dados reais.

---

## Padrão de resposta esperado do Claude Code

Ao finalizar uma tarefa, responder com:

```text
Resumo:
- O que foi implementado.

Arquivos alterados:
- Lista dos principais arquivos.

Como testar:
- Passos para validar manualmente.
- Comandos executados.

Observações:
- Limitações conhecidas.
- Próximos passos sugeridos.
```

---

## Regra final

O ERPell deve ser construído de forma incremental.

Primeiro funcionar bem.

Depois ficar mais completo.

Depois escalar.

Não sacrificar a simplicidade do produto por funcionalidades prematuras.
