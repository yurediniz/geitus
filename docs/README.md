# Documentação do Geitus

Markdown, em português do Brasil, versionado junto com o código. Cada informação fica em um lugar só; o que o código já diz não se repete aqui.

| Arquivo | Para quê | Quando ler |
|---|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Produto, comandos, regras fixas do código e fluxo de trabalho | Sempre (carregado em toda sessão) |
| [`produto.md`](produto.md) | Visão, princípios de produto e de UX, visual | Tarefas de tela, fluxo ou decisão de produto |
| [`modules/`](modules/) | Spec viva de cada módulo: regras, contrato, dados e telas | Antes de mexer no módulo |
| [`decision-log.md`](decision-log.md) | Decisões de arquitetura e de produto, com o porquê | Quando a tarefa toca uma decisão |
| [`technical-debt.md`](technical-debt.md) | Pendências abertas, por quando atacar | Ao mexer no módulo e antes do deploy |
| [`engineering-guidelines.md`](engineering-guidelines.md) | Padrões de código detalhados | Consulta pontual |
| [`visao-dominio-pdv.md`](visao-dominio-pdv.md) | Norte de longo prazo do domínio (não é escopo) | Ao especificar um módulo novo |

A API é documentada pelo Swagger (`/swagger-ui.html`, só em desenvolvimento), que não substitui a spec do módulo.

O histórico (specs antigas, planos executados, versões longas do registro de decisões e das pendências) fica no Git.
