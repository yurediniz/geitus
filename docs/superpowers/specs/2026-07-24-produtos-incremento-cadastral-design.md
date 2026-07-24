# Design — Incremento cadastral do módulo Produtos

**Data:** 2026-07-24
**Status:** Aprovado — pronto para plano de implementação
**Spec canônica:** [`docs/modules/produtos.md`](../../modules/produtos.md)

Registro de design (brainstorming). A especificação durável vive em `docs/modules/produtos.md` (convenção do projeto, DEC-022) — este documento não a duplica.

## Problema

O `Produto` atual tem ~10 campos (nome, categoria, unidade, preço de venda, custo, estoque mínimo, código de barras, SKU, ativo, timestamps). A modelagem conceitual do PDV (`geitus_pdv_modelagem_completa.md`, §4.14) descreve um Produto muito mais rico, organizado como um mínimo vendável + grupos progressivos de capacidades. Na maturação anterior de Produtos fizemos apenas auditoria e endurecimento (RBAC, 409, Testcontainers) — **sem incrementar campos**, diferente de Empresa e Usuários, que absorveram partes da modelagem.

Objetivo: um **incremento proporcional** ao MVP — campos de utilidade imediata + alguns hints estruturais de baixo custo — mantendo fiscal, variações, lote/série e multi-estoque fora, conforme a própria filosofia da modelagem ("tornar obrigatório só o necessário para uma venda comum; campos extras só quando a capacidade for usada").

## Decisões aprovadas

**Driver:** incremento equilibrado (utilidade imediata + hints estruturais de baixo custo).

### Novos campos — migration **V4** (aditiva, todas nullable; V1/V2/V3 intactas)

| Coluna | Tipo | Regra |
|---|---|---|
| `marca` | `VARCHAR(100)` NULL | marca comercial (texto, como `categoria`; **não** vira entidade) |
| `descricao` | `VARCHAR(1000)` NULL | descrição/observações livres |
| `estoque_maximo` | `NUMERIC(12,3)` NULL | CHECK ≥ 0 |
| `ponto_reposicao` | `NUMERIC(12,3)` NULL | CHECK ≥ 0 |
| `preco_minimo` | `NUMERIC(12,2)` NULL | CHECK ≥ 0 |

A entidade `Produto` ganha os campos + inclui em `atualizarDadosBasicos`; `ddl-auto: validate`. `marca`/`descricao` normalizados (trim + vazio→null), como já feito para categoria/unidade.

### Campos derivados (sem coluna, calculados na `ProdutoResponse`)

- **markup** (marcação sobre o custo) = (preço − custo) / **custo** × 100.
- **margem** (margem sobre a venda) = (preço − custo) / **preço** × 100.
- Só quando `custo` informado e > 0 (e `preço` > 0); senão `null`. Arredondados a 2 casas decimais. Read-only. Alinha ao princípio "calcular automaticamente" do CLAUDE.md.

### Validações (backend, no service; espelhadas no Zod)

- Não-negativos: `estoque_maximo`, `ponto_reposicao`, `preco_minimo` quando informados.
- **Cruzadas** (quando ambos informados): `preco_minimo ≤ preco_venda` e `estoque_maximo ≥ estoque_minimo`. Violação → 400 amigável.

### Frontend (`ProdutosPage`)

- `marca` junto de Categoria/Unidade (campos comuns).
- Bloco avançado "Custo e identificação": acrescenta preço mínimo, estoque máximo, ponto de reposição e descrição (textarea).
- Lista/detalhe do item: exibe margem/markup (quando houver custo), marca e descrição.

## Fora do escopo (mantido)

Não implementar agora (seguem a modelagem como norte futuro): status como enum de ciclo de vida (fica o booleano `ativo`), dados fiscais (NCM/CEST/origem/CFOP/CST/IBS/CBS), variações e atributos, lote/série/validade, múltiplos estoques/locais, tabelas de preço e promoções, imagem/upload, peso/dimensões/logística, marca e categoria como entidades próprias, múltiplos códigos de barras/GTIN/PLU, campos de serviço.

## RBAC

Mantém a DEC-025: escrita (incluindo os novos campos) exige ADMIN; leitura livre a qualquer autenticado.

## Fluxo do CTO

`back-end-executor` + `front-end-executor` → revisores: **`data-reviewer`** (migration V4, obrigatório), `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer`, `qa-reviewer`.

## Decisão a registrar

**DEC-028** — Incremento cadastral do Produto (campos `marca`, `descricao`, `estoque_maximo`, `ponto_reposicao`, `preco_minimo` + derivados margem/markup), alinhado à modelagem do PDV; fiscal/variações/lote/série/status-enum permanecem fora do MVP.
