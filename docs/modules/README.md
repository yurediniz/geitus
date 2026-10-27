# Specs dos módulos

Uma spec por módulo, **viva**: descreve como o módulo funciona hoje e muda junto com a regra. Não é diário de implementação nem plano — o histórico fica no Git e o porquê no [`decision-log`](../decision-log.md).

## Specs

| Módulo | Spec | Decisões |
|---|---|---|
| Autenticação | [autenticacao.md](autenticacao.md) | DEC-016, DEC-024 |
| Empresa | [empresa.md](empresa.md) | DEC-016, DEC-024 |
| Usuários | [usuarios.md](usuarios.md) | DEC-024 |
| Produtos (catálogo) | [produtos.md](produtos.md) | DEC-025, 028, 030–033, 035–037, 040 |
| Estoque | [produtos-estoque.md](produtos-estoque.md) | DEC-034, DEC-038 |
| Fornecedores e marcas | [fornecedores-e-marcas.md](fornecedores-e-marcas.md) | DEC-039 |
| Clientes | [clientes.md](clientes.md) | DEC-029 |
| Caixa | [caixa.md](caixa.md) | DEC-041 |
| PDV | [pdv.md](pdv.md) | DEC-042, DEC-044 |

Sem spec ainda (escopo em [`produto.md`](../produto.md)): financeiro básico, dashboard, relatórios. Módulo novo começa pela spec, aprovada antes da primeira fatia.

## Formato curto

Alvo: até ~12 KB por spec (Produtos até ~25 KB). Seções, nesta ordem, só as que fizerem sentido:

1. **Objetivo** — 2 a 3 linhas: o que o módulo resolve.
2. **Regras de negócio** — numeradas, uma regra por item, com as mensagens que o usuário vê quando importarem.
3. **Contrato da API** — tabela `Método · Rota · Perfil · Observação` e os erros que importam (status e campo).
4. **Dados** — tabelas e constraints essenciais, com as migrations (Vx). O detalhe de coluna fica na migration.
5. **Telas** — rotas, comportamento e atalhos essenciais.
6. **Fora do escopo e pendências** — o que ficou de fora de propósito e os links para as DTs.

Não entra: plano de tarefas, critérios de teste por cenário, diário de "ajustes na implementação", nomes de revisores. Regra decidida durante a implementação entra como regra na seção 2.
