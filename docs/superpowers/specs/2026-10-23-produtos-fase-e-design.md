# Design — Evolução do cadastro de produtos · Fase E (Listagem)

**Data:** 2026-10-23
**Status:** Implementado em 2026-10-23 (plano: `docs/superpowers/plans/2026-10-23-produtos-fase-e.md`)
**Spec canônica:** [`docs/modules/produtos-listagem.md`](../../modules/produtos-listagem.md) · Decisão: DEC-035

## Escopo da fase
Item §8 (Listagem) do pedido de evolução (DEC-030), sem a miniatura (Fase F). Fecha a DT-020 para Produtos.

## Decisões do usuário (2026-10-23)

| Tema | Escolha |
|---|---|
| Navegação | **Páginas numeradas**, 25 por página, página na URL |
| Layout | **Tabela** com cabeçalho ordenável (≥ 768 px) e **cards** no celular |
| Filtro de estoque | **Todos / Baixo (inclui sem estoque) / Sem estoque** |
| Ordenação padrão | **Nome A–Z** |

## Decisões do CTO (aprovadas no desenho)
- **Consulta de leitura em SQL nativo em duas etapas:** ids e total da página primeiro, depois os produtos com as relações. Escala para milhares de produtos e respeita `fail_on_pagination_over_collection_fetch`. Descartados: copiar o saldo para `produtos` (mistura catálogo e estoque) e filtrar em memória (não escala).
- **Acoplamento com o estoque só no SQL de leitura** (`LEFT JOIN estoque_saldos`): o catálogo continua sem importar classes de `inventory`.
- **Colunas normalizadas mantidas pela aplicação** (`busca_normalizada`, `nome_normalizado`), sem extensão do PostgreSQL (DEC-030). A V10 preenche os existentes com uma conversão SQL testada contra a Java.
- **Busca por palavras:** todas as palavras precisam aparecer, em qualquer ordem.
- **SQL montado só por fragmentos fixos escolhidos por enums**, com os valores sempre como parâmetros nomeados.
- **`status=ativos` como padrão** (a lista atual mostrava todos).
- **Categoria de outra empresa → lista vazia**, sem revelar nada.
- **`PaginacaoLista` genérica** em `components/ui`, pronta para Clientes.
