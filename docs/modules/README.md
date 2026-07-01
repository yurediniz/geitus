# Documentação dos módulos

Esta pasta contém a especificação detalhada de cada módulo do **ERPell**.

Cada módulo do sistema terá o seu próprio documento, descrevendo o que ele faz, suas regras de negócio e como se relaciona com os demais. A especificação de um módulo é criada quando ele entra em desenvolvimento — a documentação cresce de forma incremental, junto com o produto.

---

## Módulos previstos no MVP

Conforme o escopo definido no [CLAUDE.md](../../CLAUDE.md):

- Autenticação
- Layout principal
- Empresa
- Usuários
- Produtos
- Clientes
- PDV
- Caixa
- Estoque básico
- Financeiro básico
- Dashboard básico
- Relatórios básicos
- Configurações básicas

> Cada item acima ganhará um arquivo próprio (ex.: `produtos.md`, `pdv.md`, `caixa.md`) assim que for iniciado.

---

## Estrutura sugerida para o documento de um módulo

Para manter consistência, cada especificação de módulo deve conter, quando fizer sentido:

1. **Visão geral** — o que é o módulo e qual problema resolve.
2. **Escopo** — o que está e o que não está incluído (respeitando o MVP).
3. **Entidades e campos** — dados principais e campos essenciais.
4. **Regras de negócio** — validações, restrições e comportamentos obrigatórios.
5. **Fluxos** — passo a passo das operações principais.
6. **Integrações** — relação com outros módulos (ex.: PDV com Estoque e Caixa).
7. **Histórico e auditoria** — ações que devem ser rastreáveis.
8. **Pontos em aberto** — decisões pendentes ou pontos a definir no futuro.

---

## Convenções

- Arquivos em Markdown (`.md`), nomeados em minúsculas e com hífen (ex.: `financeiro-basico.md`).
- Conteúdo em português do Brasil, exceto nomes técnicos inevitáveis.
- As regras aqui descritas devem estar sempre alinhadas ao [CLAUDE.md](../../CLAUDE.md); em caso de conflito, o `CLAUDE.md` prevalece.
