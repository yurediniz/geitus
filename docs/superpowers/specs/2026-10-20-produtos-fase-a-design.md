# Design — Evolução do cadastro de produtos · Fase A (Categorias e Unidades)

**Data:** 2026-10-20
**Status:** Spec escrita — aguardando revisão do usuário antes do plano de implementação
**Spec canônica:** [`docs/modules/categorias-e-unidades.md`](../../modules/categorias-e-unidades.md) · Decisões: DEC-030 (escopo/fases) e DEC-031 (modelagem da Fase A)

Registro do brainstorming. A especificação durável vive em `docs/modules/` (DEC-022).

## Pedido

Tornar o cadastro de produtos mais completo para o uso diário (sem fiscal): categorias hierárquicas, unidades de medida, múltiplos códigos de barras, nome curto, SKU automático, preços promocional/atacado/histórico, estoque com movimentações, imagem, listagem com busca em tempo real sem acento, filtros, ordenação e paginação, e formulário em abas.

## Análise do estado atual (resumo)

- `produtos` com `categoria` e `unidade` em texto livre, um `codigo_barras` e um `sku` únicos por empresa, preços em `NUMERIC`, margem/markup derivados.
- Sem PDV/vendas (etapa 11), sem estoque (etapa 12), sem upload, sem busca sem acento, sem paginação (DT-020).
- Frontend: `ProdutosPage.tsx` monolítica (853 linhas); `radix-ui` já disponível (Select/Tabs/Dialog/Popover sem dependência nova).

## Conflitos identificados e tratamento

| Conflito | Tratamento |
|---|---|
| PDV não existe | Regras "na venda…" viram regras de domínio testadas, prontas para o PDV |
| Estoque é a etapa 12 | **Usuário decidiu antecipar** como Fase D (movimentos imutáveis) |
| `produtos.md` §3 e DEC-028 deixavam promoções, categoria/unidade como entidade e múltiplos códigos fora | Mudança de escopo registrada na **DEC-030** |
| "Código único no sistema inteiro" | Único **por empresa** (multi-tenant, DEC-016) |

## Decomposição aprovada

A (categorias + unidades) → B (identificação + formulário em abas) → C (preços) → D (estoque) → E (listagem) — com F (imagem) em paralelo a partir de B. Cada fase: spec → plano → execução → revisão → verificação.

## Decisões do usuário

| Tema | Escolha |
|---|---|
| Estoque | Antecipar como Fase D |
| Imagem | PostgreSQL, comprimida no navegador |
| Busca sem acento | Coluna normalizada mantida pela aplicação |
| Exclusão de produto | Física só se nunca movimentou; senão inativar |

## Decisões de design da Fase A (tomadas pelo CTO, revisáveis na spec)

- **Unidades por empresa** (não globais): cada empresa ajusta as suas; padrão semeado na migration e no código.
- **Sigla `VARCHAR(20)`**, maiúscula: comporta textos migrados mais longos sem truncar.
- **Sinônimos na migração** (UND→UN, LT→L, KILO→KG…) para não criar unidades duplicadas de fato.
- **Categorias carregadas inteiras em memória** para caminho, ciclos e subárvore — volume pequeno por empresa; CTE recursiva só se a Fase E exigir no SQL.
- **Inativação sem cascata:** o ramo de uma categoria inativa sai do seletor, mas nenhum registro filho é alterado (reversível).
- **Exclusão física de categoria/unidade** só sem vínculos — são cadastros, não histórico.
- **Colunas de texto antigas preservadas** até a Fase B (rede de segurança), removidas em migration própria.
- **Sub-navegação em Produtos** (Produtos · Categorias · Unidades) em vez de novos itens na sidebar.

## Revisores previstos

`data-reviewer` e `security-reviewer` obrigatórios; `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer`, `qa-reviewer`.
