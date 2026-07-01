# Documentação do ERPell

Esta pasta reúne a documentação do projeto **ERPell**, o produto de PDV e ERP básico da **UpeFlow**.

O objetivo é manter, em um só lugar, as decisões, regras de negócio e especificações que orientam o desenvolvimento — de forma que qualquer pessoa da equipe consiga entender o produto sem depender apenas do código.

---

## Como a documentação é organizada

- **[CLAUDE.md](../CLAUDE.md)** (na raiz do repositório): documento principal com as diretrizes gerais, arquitetura, stack, princípios de produto e regras de negócio. É a fonte de verdade do projeto e tem prioridade sobre solicitações soltas.
- **[docs/](.)** (esta pasta): documentação de apoio, decisões técnicas e materiais de referência que não pertencem ao código.
- **[docs/modules/](modules/)**: especificação detalhada de cada módulo do sistema (Produtos, Clientes, PDV, Caixa, Financeiro, etc.). Cada módulo terá seu próprio documento.

---

## Princípios da documentação

- **Português do Brasil:** todo o conteúdo é escrito em português, exceto nomes técnicos inevitáveis (ex.: Java, Spring Boot, React, PostgreSQL).
- **Incremental:** a documentação cresce junto com o produto. Um módulo é documentado quando entra em desenvolvimento.
- **Objetiva:** foco em regras de negócio, decisões e o "porquê", evitando repetir o que o código já expressa.
- **Rastreável:** mudanças relevantes de regra ou escopo devem ser refletidas aqui e versionadas via Git.

---

## Convenções

- Documentos em formato Markdown (`.md`).
- Nomes de arquivo em minúsculas, separados por hífen (ex.: `produtos.md`, `pdv.md`).
- Cada documento de módulo segue uma estrutura semelhante para facilitar a leitura (ver [docs/modules/README.md](modules/README.md)).
